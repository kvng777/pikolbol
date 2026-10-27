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
  ensureThread,
  loadThreadMessages,
  saveThreadMessages,
  trimForModel,
} from '@/lib/agent/history'
import type { AgentUIMessage } from '@/lib/agent/types'

// Allow multi-step tool loops to finish on Vercel.
export const maxDuration = 60

const AGENT_MODEL = 'claude-sonnet-5-5'

const generateId = createIdGenerator({ prefix: 'msg', size: 16 })

// The client sends ONLY the new message text; the server builds the message and replays history from the DB.
const bodySchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(4000),
})

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response('Bad request', { status: 400 })
  const { id: threadId, text } = parsed.data

  if ((await ensureThread(threadId, auth.userId)) === 'forbidden') {
    return new Response('Forbidden', { status: 403 })
  }

  const history = await loadThreadMessages(threadId)
  // Built server-side (server id, text-only part): no client-controlled ids, files or provider metadata.
  const userMessage: AgentUIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text }] }
  const messages = [...history, userMessage]

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
          await saveThreadMessages(threadId, updated, history.length)
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
