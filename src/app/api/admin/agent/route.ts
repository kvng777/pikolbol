import { anthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import {
  consumeStream,
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from 'ai'
import { z } from 'zod'
import { requireAdmin } from '@/lib/agent/auth'
import { agentTools } from '@/lib/agent/tools'
import { AGENT_SYSTEM_PROMPT, buildContextNote } from '@/lib/agent/prompt'
import {
  compactOldToolOutputs,
  deleteMessagesFromSeq,
  ensureThread,
  loadThreadMessages,
  planTurn,
  saveThreadMessages,
  trimForModel,
} from '@/lib/agent/history'
import { checkBudgetGate, recordUsage } from '@/lib/agent/usage'
import type { AgentUIMessage } from '@/lib/agent/types'

// Allow multi-step tool loops to finish on Vercel.
export const maxDuration = 60

const AGENT_MODEL = 'claude-sonnet-5-5'

const generateId = createIdGenerator({ prefix: 'msg', size: 16 })

// The client sends ONLY the new message text; the server builds the message and replays history from the DB.
const bodySchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(4000),
  // True when the client retries the last question; the stored user message is reused instead of duplicated.
  regenerate: z.boolean().optional(),
})

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response('Bad request', { status: 400 })
  const { id: threadId, text, regenerate } = parsed.data

  // Monthly budget gate (shared across admins): 402 when reached, 503 if usage can't be checked.
  // A turn already in flight may overshoot slightly.
  const blocked = await checkBudgetGate()
  if (blocked) return blocked

  if ((await ensureThread(threadId, auth.userId)) === 'forbidden') {
    return new Response('Forbidden', { status: 403 })
  }

  const history = await loadThreadMessages(threadId)
  // New user messages are built server-side (server id, text-only part): no client-controlled ids, files or provider metadata.
  const { messages, deleteFromSeq, startSeq } = planTurn(history, text, regenerate ?? false, generateId)
  if (deleteFromSeq !== null) await deleteMessagesFromSeq(threadId, deleteFromSeq)

  const result = streamText({
    model: anthropic(AGENT_MODEL),
    instructions: [
      // Static and cached: tools + this prompt form the cached prefix.
      {
        role: 'system',
        content: AGENT_SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      // Changes every request, so it goes after the cache breakpoint.
      { role: 'system', content: buildContextNote() },
    ],
    messages: await convertToModelMessages(compactOldToolOutputs(trimForModel(messages)), {
      tools: agentTools,
      ignoreIncompleteToolCalls: true,
    }),
    tools: agentTools,
    stopWhen: isStepCount(8),
    maxOutputTokens: 8000,
    providerOptions: {
      anthropic: { effort: 'medium' } satisfies AnthropicLanguageModelOptions,
    },
    // Fires once all steps finish; consumeSseStream below keeps the stream draining after a client disconnect.
    onEnd: async ({ totalUsage }) => {
      const d = totalUsage.inputTokenDetails
      const cacheRead = d?.cacheReadTokens ?? 0
      const cacheWrite = d?.cacheWriteTokens ?? 0
      const noCacheInput = d?.noCacheTokens ?? Math.max(0, (totalUsage.inputTokens ?? 0) - cacheRead - cacheWrite)
      try {
        await recordUsage({
          adminUserId: auth.userId,
          threadId,
          model: AGENT_MODEL,
          tokens: { noCacheInput, cacheRead, cacheWrite, output: totalUsage.outputTokens ?? 0 },
        })
      } catch (error) {
        console.error('Failed to record agent usage:', error)
      }
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof agentTools, AgentUIMessage>({
      stream: result.stream,
      tools: agentTools,
      originalMessages: messages,
      generateMessageId: generateId,
      onError: error => {
        console.error('Agent stream error:', error)
        return 'Sorry, something went wrong while answering. Please try again.'
      },
      onEnd: async ({ messages: updated }) => {
        try {
          await saveThreadMessages(threadId, updated, startSeq)
        } catch (error) {
          console.error('Failed to save agent thread:', error)
        }
      },
    }),
    // The tee keeps the UI pipeline draining after the client disconnects,
    // so onEnd still fires with the complete message and the thread is saved.
    consumeSseStream: ({ stream }) => consumeStream({ stream }),
  })
}
