# Admin AI Assistant ("Ask Pikol")
Read-only chat drawer on `/admin` that answers questions about bookings, revenue, availability and the action queue using Claude Sonnet 5.5.

## Key files
- `src/components/admin/agent/AgentDrawer.tsx` — floating drawer; renders only after the admin check; chat lazy-loaded on first open
- `src/components/admin/agent/AgentChat.tsx`, `AgentMessage.tsx`, `AgentThreadList.tsx`, `AgentUsageBar.tsx` — UI
- `src/app/api/admin/agent/route.ts` — `POST` streaming chat (`streamText`, `claude-sonnet-5-5`)
- `src/app/api/admin/agent/history/route.ts`, `threads/route.ts`, `usage/route.ts` — `GET` restore / list / budget
- `src/lib/agent/tools.ts` — tools; `summaries.ts` — data shaping (no emails/phones)
- `src/lib/agent/history.ts` — `planTurn`, replay, `listThreads`, `threadTitle`
- `src/lib/agent/prompt.ts` (static, cached), `pricingNote.ts` (per request), `usage.ts` (cost + budget gate), `auth.ts`
- `src/hooks/useAgentThread.ts`, `useAgentThreads.ts`, `useAgentUsage.ts`

## How it works
1. Client sends `{ id, text, regenerate? }`; server builds the user message (server-generated id) and replays history from `agent_messages`. Retry (`regenerate`) reuses the stored question and replaces the failed answer (`planTurn`).
2. Token budget: last 20 messages replayed; tool outputs older than the last 2 assistant turns become a stub.
3. System = cached static prompt (no prices) + uncached context note and pricing note (live + scheduled versions from `pricing_schedules`).
4. Tools (all read-only, reuse `financeUtils` so numbers match Finance): `listBookings`, `getRevenueSummary`, `getSlotAvailability`, `getActionQueue`.
5. Replies are saved on stream end even if the tab closes (`consumeSseStream`); after Stop the full answer is still saved, so the next turn may include text the admin didn't see (acceptable).
6. "Previous chats": the admin's own threads (up to 50, newest `updated_at` first), titled from the first user message, empty threads skipped, no delete, admins never see each other's chats. Fetched only while that view is open; invalidated after every answer.
7. Budget meter: `onEnd` converts `totalUsage` to USD (Sonnet 5.5 prices in `usage.ts`; update if the model/prices change) and inserts into `agent_usage`. `GET /usage` returns this Manila month's spend across admins vs budget; bar is amber at 80%, red at 100%.
8. When the month's total reaches the budget, `POST` returns 402 `{ error: 'budget_exceeded', resetsOn }` and the input is disabled until the 1st (Manila). No budget set → gate skipped (no query). Usage unreadable → 503 `{ error: 'budget_unavailable' }` (`checkBudgetGate`).

## Data
- Tables: `agent_threads`, `agent_messages` (`sql/admin-agent-migration.sql`), `agent_usage` (`sql/agent-usage-migration.sql`); RLS on, no policies.
- Query keys: `['agentHistory', threadId]` (gcTime 0), `['agentThreads']`, `['agentUsage']` (refreshed after every answer).
- Thread id in localStorage: `pikol-agent-thread-id:<userId>`.
- Env: `ANTHROPIC_API_KEY`, `AGENT_MONTHLY_BUDGET_PHP` (unset/invalid = no limit), `AGENT_USD_TO_PHP` (default 58).

## Rules (don't break)
- All routes need `Authorization: Bearer <access_token>`; `lib/agent/auth.ts` → 401/403.
- Emails and phone numbers are never sent to the model; markdown images are blocked in rendered replies (exfiltration guard).
- Keep the static prompt free of live data (prices, dates) so caching works.
- To add a tool: add it to `agentTools`, add a `case 'tool-<name>'` + label in `AgentMessage.tsx`, mention it in the prompt only if it needs usage rules.

## Gotchas / known gaps
- Self-metered: the check runs before a turn, so one in-flight turn can overshoot (~₱5–20); crashed turns before `onEnd` aren't recorded. Keep the Anthropic Console spend limit as the hard backstop.
- Local dev: run with `env -u ANTHROPIC_API_KEY` if a shell key shadows `.env.local`.
