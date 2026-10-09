/** Deterministic two-axis layout for an unbounded forest of Session cards. */
import type { TreeNode } from '@deepseek-ai/dsh-experimental-session-tree/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Fixed card geometry keeps tree layout independent of transcript length. */
export const CARD = { width: 304, height: 306, gapX: 88, gapY: 72 }

/** A placed card in canvas coordinates. */
export interface PlacedNode {
  readonly node: TreeNode
  readonly x: number
  readonly y: number
}

/**
 * Place children below their parent, with sibling subtrees arranged side by side.
 * Missing ancestors become roots; malformed cycles remain selectable without recursion loops.
 * @param nodes - Session cards in any order.
 * @returns non-overlapping positions with stable chronological sibling order.
 */
export function layoutForest(nodes: readonly TreeNode[]): PlacedNode[] {
  const byId = new Map(nodes.map(node => [node.sessionId, node]))
  const children = new Map<SessionId, TreeNode[]>()
  for (const node of nodes) {
    if (node.parentId === null) continue
    const siblings = children.get(node.parentId) ?? []
    siblings.push(node)
    children.set(node.parentId, siblings)
  }
  for (const siblings of children.values()) siblings.sort((a,b) => a.createdAt - b.createdAt || a.sessionId.localeCompare(b.sessionId))
  const placed: PlacedNode[] = []
  const visited = new Set<SessionId>()
  const place = (node: TreeNode, col: number, row: number): { right: number; bottom: number } => {
    visited.add(node.sessionId)
    placed.push({ node, x: col * (CARD.width + CARD.gapX), y: row * (CARD.height + CARD.gapY) })
    let right = col
    let bottom = row
    let nextChildCol = col
    for (const child of children.get(node.sessionId) ?? []) {
      if (visited.has(child.sessionId)) continue
      const extent = place(child, nextChildCol, row + 1)
      right = Math.max(right, extent.right)
      bottom = Math.max(bottom, extent.bottom)
      nextChildCol = extent.right + 1
    }
    return { right, bottom }
  }
  let nextRow = 0
  const roots = nodes.filter(node => node.parentId === null || !byId.has(node.parentId))
  for (const node of [...roots, ...nodes]) {
    if (visited.has(node.sessionId)) continue
    nextRow = place(node, 0, nextRow).bottom + 2
  }
  return placed
}

/**
 * Trace the current conversation's ancestors without changing saved relationships.
 * @param nodes - complete tree cards.
 * @param current - currently open conversation, or no selection.
 * @returns all cards on the current ancestor path.
 */
export function ancestorPath(nodes: readonly TreeNode[], current: SessionId | null): Set<SessionId> {
  const byId = new Map(nodes.map(node => [node.sessionId, node]))
  const result = new Set<SessionId>()
  if (current !== null) {
    let node = byId.get(current)
    while (node !== undefined && !result.has(node.sessionId)) {
      result.add(node.sessionId)
      node = node.parentId === null ? undefined : byId.get(node.parentId)
    }
  }
  return result
}

/**
 * Limit the map to one connected exploration and hide collapsed descendants.
 * Missing parents and cycles remain browsable as independent components.
 * @param nodes - complete Session cards.
 * @param anchor - a conversation in the requested exploration, or null for all.
 * @param collapsed - conversations whose descendants are hidden.
 * @returns cards to lay out, preserving source order.
 */
export function visibleTree(nodes: readonly TreeNode[], anchor: SessionId | null, collapsed: readonly SessionId[]): TreeNode[] {
  const byId = new Map(nodes.map(node => [node.sessionId,node]))
  const included = new Set<SessionId>()
  if (anchor !== null && byId.has(anchor)) {
    const queue = [anchor]
    const children = new Map<SessionId, SessionId[]>()
    for (const node of nodes) if (node.parentId !== null) {
      const siblings = children.get(node.parentId) ?? []
      siblings.push(node.sessionId); children.set(node.parentId,siblings)
    }
    for (const id of queue) {
      if (included.has(id)) continue
      included.add(id)
      const parent = byId.get(id)?.parentId
      if (parent !== null && parent !== undefined && byId.has(parent)) queue.push(parent)
      queue.push(...children.get(id) ?? [])
    }
  } else for (const node of nodes) included.add(node.sessionId)
  const hidden = new Set<SessionId>()
  for (const node of nodes) {
    const visited = new Set([node.sessionId])
    let parent = node.parentId
    while (parent !== null && !visited.has(parent)) {
      if (collapsed.includes(parent)) { hidden.add(node.sessionId); break }
      visited.add(parent)
      parent = byId.get(parent)?.parentId ?? null
    }
  }
  return nodes.filter(node => included.has(node.sessionId) && !hidden.has(node.sessionId))
}
