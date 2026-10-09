/** Request-local message search using the public native semantic-text helpers. */
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import {
  buildSessionEventSearchDocuments,
  compileSessionTextFilter,
  filterSessionEventDocuments,
} from '@deepseek-ai/dsh-session-query'

/**
 * Find current user/assistant message text using native literal matching semantics.
 * @param sessionId - owner of the observed events.
 * @param events - one complete, immutable native Session observation.
 * @param query - non-blank literal query; punctuation is data and whitespace is flexible.
 * @param length - maximum snippet Unicode code points, at least three.
 * @returns a snippet from the latest matching message, or null when no message matches.
 */
export function findMessageSnippet(
  sessionId: SessionId,
  events: readonly SessionEvent[],
  query: string,
  length: number,
): string | null {
  const documents = filterSessionEventDocuments(buildSessionEventSearchDocuments(sessionId, events), [
    { kind: 'type', values: ['user/message', 'assistant/message'] },
    { kind: 'surface', values: ['current'] },
    { kind: 'text', text: query },
  ])
  const latest = documents.at(-1)
  if (latest === undefined) return null
  const text = latest.text.replace(/\s+/gu, ' ').trim()
  const points = Array.from(text)
  if (points.length <= length) return text
  // The same whitespace-flexible matcher selected this document above.
  const index = text.search(compileSessionTextFilter(query))
  const position = Array.from(text.slice(0, index)).length
  const start = Math.max(0, position - Math.floor((length - 2) / 3))
  const end = Math.min(points.length, start + length - 2)
  return `${start > 0 ? '…' : ''}${points.slice(start, end).join('')}${end < points.length ? '…' : ''}`
}
