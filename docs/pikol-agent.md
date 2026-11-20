# Chat Agent Grounded in Project Data — Technical Blueprint

Generic version of Altar's note-chat pattern (`useNoteChat` + BFF `/v1/agent/chat`), with its known flaws fixed.

## 1. Data layer

- **Entity store** (notes, docs, records) with a stable `id` and a text field the model can read (`body`, `summary`).
- **`threads`** — `id, user_id, scope_id` (what the chat is "about", e.g. a note id).
- **`messages`** — `id, thread_id, prompt, output_text, tool_steps (json), status, context_ids[], created_at`.
- **Link entity → thread** (Altar uses `inventory.chat_thread_id`; a `scope_id` on the thread works too).

## 2. Backend endpoints

| Endpoint | Job |
|---|---|
| `POST /chat` (streaming) | `{message, contextIds[], threadId?}` → creates thread on first call, returns `thread_id` |
| `GET /entity/:id/chat-history` | Returns persisted messages to rebuild the UI on reopen |

### `POST /chat` flow

1. **Auth + ownership** — load context rows with `WHERE id IN (...) AND user_id = ?`. Never trust client ids.
2. **Build system prompt** — role and rules, then an "Attached Context" section (title, id, body per entity). Truncate or summarize to fit a token budget.
3. **Rebuild history** — replay earlier thread messages as user/assistant turns. Use **one** history mechanism: server replay **or** the provider's `previous_response_id`, not both.
4. **Agent loop** — call the LLM with tools → run tool calls → feed results back → repeat until a final answer (cap the iterations).
5. **Stream events** (NDJSON/SSE): `text_delta`, `tool_start`, `tool_done`, `file`, `done{message_id, thread_id}`, `error`.
6. **Persist progress** during streaming and finalize on `done`, so a disconnect or reload doesn't lose the answer.

## 3. Tools (optional, but they make it more than a summarizer)

- **`query_database`** — read-only SQL. Put the schema in the prompt and force a `user_id` filter. Enforce with a **read-only DB role** plus a `SELECT`-only allowlist, not just prompt instructions.
- **`search_items`** — keyword or vector search over entities. Use it instead of prompt-stuffing once the data is larger than a few docs (RAG: embeddings + pgvector or similar).
- **`web_search` / `code_interpreter`** — only if needed.

## 4. Frontend hook

- **State:** `messages[]`, `threadId`, `isStreaming`, `AbortController`.
- **On mount:** fetch history → seed `messages`.
- **`send(prompt)`:**
  1. Add the user bubble and an empty "streaming" agent bubble straight away.
  2. Read the stream and update the agent bubble on each event.
  3. On `done`, swap the temporary id for the server message id.
- **Render** markdown through a sanitizer.

## 5. Lessons from the Altar version

1. **Context freshness** — the agent reads the DB, so unsaved edits are invisible. Save before sending, or send the current draft text in the request.
2. **One history mechanism** — Altar sends `previous_response_id` *and* replays DB history, so history is duplicated.
3. **Token budget** — cap context per item and per thread; summarize old turns once a thread gets long.
4. **Pass all the context explicitly** — related data that's only referenced by id (e.g. Altar's meeting transcript tag) is never seen unless the model queries for it. Resolve it on the server if it matters.
5. **Security** — scope every query to the user, use a read-only DB role for agent SQL, validate all ids.

## Minimum viable version

One `POST /chat` that puts the entity text into the system prompt + server-side history replay + streamed `text_delta`/`done` + `threads`/`messages` tables. Add tools and RAG once that works.
