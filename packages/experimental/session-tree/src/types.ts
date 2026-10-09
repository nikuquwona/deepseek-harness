/** Durable presentation metadata and read models for persistent conversation trees. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** User-owned card summary; the native Session owns its title. */
export interface TreeAnnotation {
  readonly summary: string
}

/** A text preview or native file declaration, not a verified external result or file snapshot. */
export type TreeArtifact = {
  /** Text extracted from an assistant message or non-error tool result. */
  readonly kind: 'commit' | 'pull-request' | 'diagram' | 'link'
  readonly label: string
  readonly content: string
  /** Exact source event in the owning Session. */
  readonly seq: number
} | {
  readonly kind: 'file'
  readonly label: string
  /** Declared path, unchanged; native deliverables own file opening. */
  readonly content: string
  /** Native deliverables/presented event. */
  readonly seq: number
  /** Original index in that event's files array. */
  readonly index: number
}

/** A card backed by one durable Harness Session. */
export interface TreeNode {
  readonly sessionId: SessionId
  readonly parentId: SessionId | null
  readonly forkSeq: number | null
  readonly createdAt: number
  readonly title: string
  readonly summary: string
  readonly customSummary: string
  readonly messageCount: number
  readonly inheritedEventCount: number
  readonly lastSeq: number | null
  readonly running: boolean
  readonly artifacts: readonly TreeArtifact[]
}

/** Ordinary native Sessions with their unchanged direct-parent relationships. */
export interface TreeSnapshot {
  readonly nodes: readonly TreeNode[]
}

/** One ordinary, list-visible Session with matching current message text. */
export interface TreeSearchItem {
  readonly sessionId: SessionId
  /** Bounded plain text around a match in the latest matching message. */
  readonly snippet: string
}

/** Newest-first conversation matches; message text is retained only for this request. */
export interface TreeSearchResult {
  readonly items: TreeSearchItem[]
  /** Another matching conversation exists beyond the configured result limit. */
  readonly hasMore: boolean
}
