/** Persisted canvas position and selection, independent of Host-owned Session data. */
import { defineStore, type StoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** User-controlled view state. */
export interface TreeViewState {
  selectedId: SessionId | null
  scopeId: SessionId | null
  showAll: boolean
  collapsed: SessionId[]
  x: number
  y: number
  zoom: number
}

type TreeViewActions = {
  select: (draft: TreeViewState, id: SessionId | null) => void
  scope: (draft: TreeViewState, id: SessionId | null) => void
  all: (draft: TreeViewState, value: boolean) => void
  collapse: (draft: TreeViewState, id: SessionId) => void
  viewport: (draft: TreeViewState, x: number, y: number, zoom: number) => void
}

/**
 * Declare the canvas view's complete write set.
 * @returns a root-scoped view store handle for Slot registration.
 */
export function createTreeViewStore(): StoreHandle<TreeViewState, TreeViewActions> {
  return defineStore({
    init: (): TreeViewState => ({ selectedId: null, scopeId: null, showAll: false, collapsed: [], x: 72, y: 70, zoom: 1 }),
    persist: 'dsh.session-tree.map',
    actions: {
      select: (draft: TreeViewState, id: SessionId | null) => { draft.selectedId = id },
      scope: (draft: TreeViewState, id: SessionId | null) => { draft.scopeId = id; draft.showAll = false; draft.collapsed = [] },
      all: (draft: TreeViewState, value: boolean) => { draft.showAll = value },
      collapse: (draft: TreeViewState, id: SessionId) => {
        draft.collapsed = draft.collapsed.includes(id) ? draft.collapsed.filter(value => value !== id) : [...draft.collapsed, id]
      },
      viewport: (draft: TreeViewState, x: number, y: number, zoom: number) => {
        draft.x = x; draft.y = y; draft.zoom = Math.min(2, Math.max(0.15, zoom))
      },
    },
  })
}
