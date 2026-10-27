import type { InferUITools, UIDataTypes, UIMessage } from 'ai'
import type { AgentTools } from './tools'

/** Typed chat message shared by the route, history store and UI. */
export type AgentUIMessage = UIMessage<never, UIDataTypes, InferUITools<AgentTools>>
