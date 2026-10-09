/** Deterministic card previews over committed Session events; no auxiliary model call. */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import type { TreeArtifact } from './types.ts'

interface CardMessage {
  readonly seq: number
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly inherited: boolean
}

/**
 * Read only visible text blocks; reasoning and tool arguments stay out of card summaries.
 * @param event - committed Session event.
 * @returns user-visible text, or the empty string for a non-text event.
 */
export function visibleText(event: SessionEvent): string {
  if (event.type === 'user/message' && event.data.source.kind !== 'user') return ''
  if ((event.type === 'user/message' || event.type === 'assistant/message' || event.type === 'tool/result')
    && event.surfaceOp !== 'append') return ''
  const blocks = event.type === 'user/message' ? event.data.content
    : event.type === 'assistant/message' ? event.data.message.content
      : event.type === 'tool/result' ? event.data.message.content : []
  return blocks.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim()
}

/**
 * Project message boundaries without changing their original sequence numbers.
 * @param events - exact ordered Session log.
 * @param inheritedEventCount - number of events copied from the parent.
 * @returns user-authored and assistant messages; injected context stays in the Session prefix.
 */
export function projectMessages(events: readonly SessionEvent[], inheritedEventCount: number): CardMessage[] {
  return events.flatMap(event => ((event.type === 'user/message' && event.data.source.kind === 'user') || event.type === 'assistant/message')
    && event.surfaceOp === 'append'
    ? [{ seq: event.seq, role: event.type === 'user/message' ? 'user' as const : 'assistant' as const,
      text: visibleText(event), inherited: event.seq < inheritedEventCount }]
    : [])
}

/**
 * Collect native file declarations and text previews with their source event. Git-looking
 * output and links do not verify commits or pull requests; declared files are not copied.
 * @param events - branch-owned committed events, excluding its inherited prefix.
 * @param limit - maximum number of latest artifacts displayed on a card.
 * @returns deduplicated artifacts in source order, cropped from the end.
 */
export function projectArtifacts(events: readonly SessionEvent[], limit: number): TreeArtifact[] {
  const artifacts = new Map<string, TreeArtifact>()
  const add = (artifact: TreeArtifact): void => {
    const key = `${artifact.kind}:${artifact.kind === 'commit' ? artifact.label : artifact.content}`
    artifacts.delete(key)
    artifacts.set(key, artifact)
  }
  for (const event of events) {
    if (event.type === 'deliverables/presented') {
      event.data.files.forEach((file, index) => {
        const basename = file.path.slice(Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\')) + 1)
        add({ kind: 'file', label: file.description?.trim() || basename, content: file.path, seq: event.seq, index })
      })
      continue
    }
    if (event.type !== 'assistant/message' && event.type !== 'tool/result') continue
    if (event.surfaceOp !== 'append') continue
    if (event.type === 'tool/result' && (event.data.error !== undefined || event.data.message.isError === true)) continue
    const text = visibleText(event)
    for (const match of text.matchAll(/```mermaid[^\S\n]*\n([\s\S]*?)```/g)) {
      const content = match[1]
      if (content !== undefined) add({ kind: 'diagram', label: 'Mermaid', content: content.trim(), seq: event.seq })
    }
    for (const match of text.matchAll(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/g)) {
      add({ kind: 'pull-request', label: match[0].split('/').slice(-3).join('/'), content: match[0], seq: event.seq })
    }
    for (const match of text.matchAll(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/commit\/([a-f0-9]{7,40})/g)) {
      const commit = match[1]
      if (commit !== undefined) add({ kind: 'link', label: commit.slice(0,8), content: match[0], seq: event.seq })
    }
    if (event.type === 'tool/result') {
      for (const match of text.matchAll(/^\[[^\]\n]+ ([a-f0-9]{7,40})\]\s+(.+)$/gm)) {
        const [,commit,subject] = match
        if (commit !== undefined && subject !== undefined) add({ kind: 'commit', label: commit, content: subject, seq: event.seq })
      }
    }
  }
  return [...artifacts.values()].slice(-limit)
}

/**
 * Produce a short plain-text excerpt while leaving the original message in the transcript.
 * @param text - source message.
 * @param length - maximum Unicode code points in the excerpt.
 * @returns a single-line excerpt, with an ellipsis when cropped.
 */
export function excerpt(text: string, length: number): string {
  const points = Array.from(text.replace(/```[\s\S]*?```/g, '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim())
  return points.length <= length ? points.join('') : `${points.slice(0, length - 1).join('')}…`
}
