/** Layout topology and asynchronous refresh lifecycle regressions. */
import { expect, it, vi } from 'vitest'
import type { TreeNode, TreeSnapshot } from '@deepseek-ai/dsh-experimental-session-tree/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { layoutForest, ancestorPath, visibleTree } from '../src/client/layout.ts'
import { TreeModel } from '../src/client/model.ts'

const id = (value: string) => value as SessionId
const node = (name: string, parent: string | null): TreeNode => ({
  sessionId:id(name),parentId:parent === null ? null : id(parent),createdAt:0,forkSeq:null,
  title:name,summary:'',customSummary:'',messageCount:0,inheritedEventCount:0,
  lastSeq:null,running:false,artifacts:[],
})
const empty: TreeSnapshot = { nodes:[] }

it('places recursive continuations below their parent without overlapping sibling subtrees', () => {
  const nodes = [node('root',null),node('child-a','root'),node('child-b','root'),
    node('grandchild-a','child-b'),node('grandchild-b','child-b'),node('other',null),node('orphan','missing')]
  const placed = layoutForest(nodes)
  const byId = new Map(placed.map(item => [String(item.node.sessionId),item]))
  expect(placed).toHaveLength(nodes.length)
  expect(new Set(placed.map(item => `${item.x}:${item.y}`)).size).toBe(nodes.length)
  expect(byId.get('child-a')?.x).toBe(byId.get('root')?.x)
  expect(byId.get('child-a')?.y).toBeGreaterThan(byId.get('root')?.y ?? Infinity)
  expect(byId.get('child-b')?.x).toBeGreaterThan(byId.get('child-a')?.x ?? Infinity)
  expect(byId.get('child-b')?.y).toBe(byId.get('child-a')?.y)
  const before = structuredClone(nodes)
  expect(ancestorPath(nodes,id('grandchild-a'))).toEqual(new Set(['root','child-b','grandchild-a']))
  expect(nodes).toEqual(before)
})

it('keeps malformed cycles inspectable without recursive loops', () => {
  const nodes = [node('a','b'),node('b','a')]
  expect(layoutForest(nodes)).toHaveLength(2)
  expect(ancestorPath(nodes,id('b'))).toEqual(new Set(['a','b']))
})

it('scopes the map to related conversations and hides descendants without deleting ancestry', () => {
  const nodes = [node('root',null),node('a','root'),node('b','root'),node('deep','a'),node('other',null)]
  expect(visibleTree(nodes,id('a'),[]).map(item => item.sessionId)).toEqual(['root','a','b','deep'])
  expect(visibleTree(nodes,id('a'),[id('a')]).map(item => item.sessionId)).toEqual(['root','a','b'])
  expect(visibleTree(nodes,null,[id('root')]).map(item => item.sessionId)).toEqual(['root','other'])
  expect(visibleTree(nodes,id('other'),[]).map(item => item.sessionId)).toEqual(['other'])
  expect(visibleTree(nodes,id('gone'),[])).toEqual(nodes)
  expect(visibleTree([node('a','b'),node('b','a')],id('a'),[])).toHaveLength(2)
})

it('fans out sibling branches instead of placing one sibling behind another on the same edge', () => {
  const nodes = [node('root',null),node('a','root'),node('b','root'),
    node('a-first','a'),node('a-second','a'),node('a-deep','a-second')]
  const positions = new Map(layoutForest(nodes).map(item => [String(item.node.sessionId),item]))
  expect(positions.get('a')?.y).toBe(positions.get('b')?.y)
  expect(positions.get('b')?.x).toBeGreaterThan(positions.get('a-deep')?.x ?? Infinity)
  expect(positions.get('a-first')?.y).toBe(positions.get('a-second')?.y)
  expect(positions.get('a-deep')?.y).toBeGreaterThan(positions.get('a-second')?.y ?? Infinity)
})

it('retains the last forest after a failed refresh and recovers on retry', async () => {
  const tree = { nodes:[node('saved',null)] }
  const read = vi.fn<() => Promise<TreeSnapshot>>().mockResolvedValueOnce(tree)
    .mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValueOnce(empty)
  const model = new TreeModel(read)
  try {
    await model.refresh()
    await model.refresh()
    expect(model.source.getSnapshot()).toEqual({ tree,loading:false,error:'Disconnected' })
    await model.refresh()
    expect(model.source.getSnapshot()).toEqual({ tree:empty,loading:false,error:null })
  } finally { await model.dispose() }
})

it('coalesces in-flight changes into a fresh read and ignores late data after disposal', async () => {
  let finish: (value: TreeSnapshot) => void = () => {throw new Error('Read has not started')}
  const read = vi.fn<(signal: AbortSignal) => Promise<TreeSnapshot>>()
    .mockImplementationOnce(() => new Promise((resolve) => {finish=resolve}))
    .mockResolvedValueOnce(empty)
  const model = new TreeModel(read)
  const first = model.refresh()
  expect(model.refresh()).toBe(first)
  finish({ nodes:[node('stale',null)] })
  await first
  expect(read).toHaveBeenCalledTimes(2)
  expect(model.source.getSnapshot().tree).toEqual(empty)
  read.mockImplementationOnce(() => new Promise((resolve) => {finish=resolve}))
  const last = model.refresh()
  const disposing = model.dispose()
  expect(read.mock.calls.at(-1)?.[0].aborted).toBe(true)
  finish({ nodes:[node('late',null)] })
  await Promise.all([last,disposing])
  expect(model.source.getSnapshot().tree).toEqual(empty)
  await model.refresh()
  expect(read).toHaveBeenCalledTimes(3)
})
