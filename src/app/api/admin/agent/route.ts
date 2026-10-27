import { anthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from 'ai'
import { z } from 'zod'
import { requireAdmin } from '@/lib/agent/auth'
import { agentTools } from '@/lib/agent/tools'
import { AGENT_SYSTEM_PROMPT, buildContextNote } from '@/lib/agent/prompt'
import { ensureThread, loadThreadMessages, saveThreadMessages, trimForModel } from '@/lib/agent/history'
import type { AgentUIMessage } from '@/lib/agent/types'

// Allow multi-step tool loops to finish on Vercel.
export const maxDuration = 60

const AGENT_MODEL = 'claude-sonnet-5-5'

// The client sends ONLY the new message; the server replays history from the DB (single history source).
const bodySchema = z.object({
  id: z.string().min(1).max(100),
  message: z.unknown(),
})

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof Response) return auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response('Bad request', { status: 400 })
  const { id: threadId, message } = parsed.data

  if ((await ensureThread(threadId, auth.userId)) === 'forbidden') {
    return new Response('Forbidden', { status: 403 })
  }

  const history = await loadThreadMessages(threadId)

  let messages: AgentUIMessage[]
  try {
    messages = await validateUIMessages<AgentUIMessage>({ messages: [...history, message], tools: agentTools })
  } catch {
    return new Response('Invalid message', { status: 400 })
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return new Response('Last message must be from the user', { status: 400 })
  }

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
    messages: await convertToModelMessages(trimForModel(messages), { tools: agentTools }),
    tools: agentTools,
    stopWhen: isStepCount(8),
    maxOutputTokens: 8000,
    providerOptions: {
      anthropic: { effort: 'medium' } satisfies AnthropicLanguageModelOptions,
    },
  })

  // Keep generating (and run onEnd → save) even if the admin closes the tab mid-answer.
  void result.consumeStream()

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof agentTools, AgentUIMessage>({
      stream: result.stream,
      tools: agentTools,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
      onEnd: async ({ messages: updated }) => {
        try {
          await saveThreadMessages(threadId, updated)
        } catch (error) {
          console.error('Failed to save agent thread:', error)
        }
      },
    }),
  })
}
