/** Native Session cards with revision-validated previews and persistent annotations. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { setImmediate } from 'node:timers/promises'
import schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { annotationSchema, treeDomain, type StoredTreeAnnotation } from './spec.ts'
import { excerpt, projectArtifacts, projectMessages } from './preview.ts'
import { findMessageSnippet } from './search.ts'
import type { TreeAnnotation, TreeNode, TreeSearchItem, TreeSearchResult, TreeSnapshot } from './types.ts'
import { z } from 'zod'

export type * from './types.ts'

/** Presentation limits; full Session data is owned by the native persistence service. */
export interface Config {
  /** Maximum Unicode code points in an automatic card summary. */
  readonly summaryLength: number
  /** Maximum recent artifacts returned for each conversation card. */
  readonly artifactLimit: number
  /** Maximum conversation matches returned by one message-content search. */
  readonly searchResultLimit: number
  /** Maximum Unicode code points in a message-content search snippet. */
  readonly searchSnippetLength: number
}

const searchQuerySchema = z.string().trim().min(1).max(500)

type NativeCard = Omit<TreeNode, 'customSummary' | 'running'>
type CachedCard = { readonly card: NativeCard } & (
  | { readonly source: 'live'; readonly session: Session; readonly cursor: number }
  | { readonly source: 'prepared'; readonly persistence: symbol; readonly revision: SessionPersistenceRevision }
)

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionTree: SessionTree
  }
}

/** A plugin-owned sidecar for trees whose ancestry lives in native Session headers. */
export class SessionTree extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionQuery', 'sessions', 'agents', 'sessionController']
  static Config: schema<Config> = schema.object({
    summaryLength: schema.number().min(40).max(2000).default(220),
    artifactLimit: schema.number().min(1).max(50).default(6),
    searchResultLimit: schema.number().min(1).max(200).default(20),
    searchSnippetLength: schema.number().min(3).max(2000).default(240),
  })

  private annotations!: KvTable<SessionId, StoredTreeAnnotation>
  private readonly cards = new Map<SessionId, CachedCard>()
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'sessionTree', { namespace: 'sessionTree' })
  }

  protected async [Service.init](): Promise<void> {
    for (const value of Object.values(this.config)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('session-tree: limits must be positive integers')
    }
    const domain = await this.ctx.storageDomain.open(treeDomain)
    this.ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled(this.pending)
      this.cards.clear()
      await domain.close()
    }, 'session-tree: reads and storage')
    this.annotations = domain.table('annotations')
    await this.operation(async (signal) => {
      for (const [sessionId, annotation] of this.annotations.entries()) {
        if (annotation.title === undefined) continue
        try {
          signal.throwIfAborted()
          if (annotation.title.trim() !== '') await this.renameTitle(sessionId, annotation.title.trim(), signal)
          else await this.ctx.sessionQuery.readTitle(sessionId, signal)
          signal.throwIfAborted()
          await this.annotations.put(sessionId, { summary: annotation.summary })
        } catch (error) {
          throw new Error(`session-tree: could not transfer the legacy title for Session "${sessionId}"; retry initialization after resolving the cause`, { cause: error })
        }
      }
    })
  }

  /**
   * Read ordinary Session cards, including cold Sessions and unannotated native forks.
   * Cached previews require the same live Session and cursor, or the same persistence
   * instance and durable revision. A source without a usable revision is read again.
   * @param signal - cancellation for persistence reads.
   * @returns a forest whose parent ids always come from native Session headers.
   */
  @Remote
  list(signal: AbortSignal): Promise<TreeSnapshot> {
    return this.operation(async (activeSignal) => {
      const records = await this.ctx.sessionQuery.listSessions(activeSignal)
      const ordinary = records.filter(record => record.header.origin !== 'subagent')
      const ids = new Set(ordinary.map(record => record.header.id))
      for (const id of this.cards.keys()) if (!ids.has(id)) this.cards.delete(id)
      const nodes: TreeNode[] = []
      for (const { header } of ordinary) {
        activeSignal.throwIfAborted()
        const card = await this.readCard(header.id, activeSignal)
        const annotation = this.annotations.get(header.id)
        nodes.push({
          ...card,
          summary: annotation?.summary || card.summary,
          customSummary: annotation?.summary ?? '',
          running: this.ctx.agents.get(header.id)?.status === 'running',
        })
      }
      return { nodes }
    }, signal)
  }

  /**
   * Scan current messages through public native observations without opening a search index.
   * Only ordinary Sessions visible in the native conversation list are read. Results follow
   * the native newest-first listing and contain no full transcript or persistent search data.
   * @param query - non-blank literal text, at most 500 UTF-16 code units after trimming.
   * @param signal - cancellation for a superseded query or cold Session read.
   * @returns bounded conversation matches and whether further matches exist.
   */
  @Remote
  search(query: string, signal: AbortSignal): Promise<TreeSearchResult> {
    return this.operation(async (activeSignal) => {
      const normalized = searchQuerySchema.parse(query)
      const records = await this.ctx.sessionQuery.listSessions(activeSignal)
      activeSignal.throwIfAborted()
      const items: TreeSearchItem[] = []
      for (const { header } of records) {
        if (header.origin === 'subagent' || header.cwd === undefined) continue
        await setImmediate(undefined, { signal: activeSignal })
        using observed = await this.ctx.sessionQuery.observeSession(header.id, { signal: activeSignal, projectionMode: 'none' })
        activeSignal.throwIfAborted()
        if (observed.header.origin === 'subagent' || observed.header.cwd === undefined) continue
        const snippet = findMessageSnippet(header.id, observed.events, normalized, this.config.searchSnippetLength)
        if (snippet === null) continue
        if (items.length === this.config.searchResultLimit) return { items, hasMore: true }
        items.push({ sessionId: header.id, snippet })
      }
      return { items, hasMore: false }
    }, signal)
  }

  /**
   * Rename the native Session and save its card summary without issuing a model request.
   * @param sessionId - an existing native Session.
   * @param title - required native title, normalized by the Session Controller.
   * @param summary - custom summary; empty selects the automatic excerpt.
   * @returns the saved summary; the accepted title is read from the native Session.
   */
  @Remote
  annotate(sessionId: SessionId, title: string, summary: string): Promise<TreeAnnotation> {
    return this.operation(async (signal) => {
      const annotation = annotationSchema.parse({ summary: summary.trim() })
      await this.renameTitle(sessionId, title.trim(), signal)
      signal.throwIfAborted()
      await this.annotations.put(sessionId, annotation)
      return annotation
    })
  }

  private async renameTitle(sessionId: SessionId, title: string, signal: AbortSignal): Promise<void> {
    const current = await this.ctx.sessionQuery.readTitle(sessionId, signal)
    const changed = current?.title !== title || current.source.kind !== 'user'
    if (changed) await this.ctx.sessionController.rename({ sessionId, title })
    signal.throwIfAborted()
    const session = this.ctx.sessions.get(sessionId)
    if (session !== undefined) {
      if (!await this.ctx.sessions.flush(session)) throw new Error(`Session "${sessionId}" has no title durability provider`)
    } else if (changed) throw new Error(`Renamed Session "${sessionId}" is unavailable before its title can be flushed`)
    signal.throwIfAborted()
  }

  private async readCard(sessionId: SessionId, signal: AbortSignal): Promise<NativeCard> {
    const cached = this.cards.get(sessionId)
    const live = this.ctx.sessions.get(sessionId)
    if (live !== undefined && cached?.source === 'live'
      && cached.session === live && cached.cursor === live.seq - 1) return cached.card
    const persistence = this.ctx.get('sessionPersistence')
    if (live === undefined && persistence !== undefined && cached?.source === 'prepared'
      && cached.persistence === persistence.identity) {
      const snapshot = await persistence.stat(sessionId, { signal })
      signal.throwIfAborted()
      if (this.ctx.sessions.get(sessionId) === undefined
        && this.ctx.get('sessionPersistence')?.identity === persistence.identity
        && snapshot?.revision === cached.revision) return cached.card
    }
    const sourceSession = this.ctx.sessions.get(sessionId)
    const sourcePersistence = this.ctx.get('sessionPersistence')
    using observed = await this.ctx.sessionQuery.observeSession(sessionId, { signal, projectionMode: 'none' })
    signal.throwIfAborted()
    const { header, inheritedEventCount, events } = observed
    const messages = projectMessages(events, inheritedEventCount)
    const own = messages.filter(message => !message.inherited)
    const title = events.findLast(event => event.type === 'session/title')
    const summary = own.findLast(message => message.role === 'assistant')?.text ?? own[0]?.text ?? ''
    const card: NativeCard = {
      sessionId, parentId: header.parentSession ?? null,
      forkSeq: inheritedEventCount > 0 ? inheritedEventCount - 1 : null,
      createdAt: header.createdAt,
      title: title?.data.title ?? '',
      summary: excerpt(summary, this.config.summaryLength),
      messageCount: own.length, inheritedEventCount,
      lastSeq: observed.cursor < 0 ? null : observed.cursor,
      artifacts: projectArtifacts(events.slice(inheritedEventCount), this.config.artifactLimit),
    }
    this.cards.delete(sessionId)
    if (observed.source === 'live' && sourceSession !== undefined
      && this.ctx.sessions.get(sessionId) === sourceSession && observed.cursor === sourceSession.seq - 1) {
      this.cards.set(sessionId, { card, source: 'live', session: sourceSession, cursor: observed.cursor })
    } else if (observed.source === 'prepared' && sourcePersistence !== undefined && observed.revision !== undefined
      && this.ctx.get('sessionPersistence')?.identity === sourcePersistence.identity
      && this.ctx.sessions.get(sessionId) === undefined) {
      this.cards.set(sessionId, { card, source: 'prepared', persistence: sourcePersistence.identity, revision: observed.revision })
    }
    return card
  }

  private async operation<T>(work: (signal: AbortSignal) => Promise<T>, caller?: AbortSignal): Promise<T> {
    const signal = caller === undefined ? this.lifetime.signal : AbortSignal.any([caller, this.lifetime.signal])
    signal.throwIfAborted()
    const task = work(signal)
    this.pending.add(task)
    try {
      const value = await task
      signal.throwIfAborted()
      return value
    } finally {
      this.pending.delete(task)
    }
  }
}

export default SessionTree
