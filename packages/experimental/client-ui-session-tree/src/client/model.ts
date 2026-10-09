/** React-free mirror of the Host-owned conversation forest. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TreeSnapshot } from '@deepseek-ai/dsh-experimental-session-tree/types'

/** Query status retains the last usable forest when a refresh fails. */
export interface TreeState {
  readonly tree: TreeSnapshot
  readonly loading: boolean
  readonly error: string | null
}

/** Owns refresh ordering and cancellation for one plugin lifetime. */
export class TreeModel {
  /** Last usable forest and its current query status. */
  readonly source = createSnapshotStore<TreeState>({ tree: { nodes: [] }, loading: true, error: null })
  private readonly controller = new AbortController()
  private pending: Promise<void> | undefined
  private again = false

  constructor(private readonly read: (signal: AbortSignal) => Promise<TreeSnapshot>) {}

  /**
   * Coalesce concurrent refreshes while guaranteeing one read after a mid-flight change.
   * @returns completion after all requested refreshes have settled.
   */
  refresh(): Promise<void> {
    if (this.controller.signal.aborted) return Promise.resolve()
    if (this.pending !== undefined) {
      this.again = true
      return this.pending
    }
    this.pending = this.readLoop().finally(() => { this.pending = undefined })
    return this.pending
  }

  private async readLoop(): Promise<void> {
    do {
      this.again = false
      this.source.set({ ...this.source.getSnapshot(), loading: true })
      try {
        const tree = await this.read(this.controller.signal)
        if (!this.controller.signal.aborted) this.source.set({ tree, loading: false, error: null })
      } catch (error) {
        if (!this.controller.signal.aborted) this.source.set({ ...this.source.getSnapshot(), loading: false,
          error: error instanceof Error ? error.message : String(error) })
        this.again = false
      }
    } while (this.hasQueuedRefresh())
  }

  private hasQueuedRefresh(): boolean { return this.again && !this.controller.signal.aborted }

  /** Abort reads and wait for their callbacks before plugin teardown completes. */
  async dispose(): Promise<void> {
    this.controller.abort()
    await this.pending
  }
}
