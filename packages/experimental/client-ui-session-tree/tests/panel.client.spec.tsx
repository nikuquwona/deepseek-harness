// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TreeNode } from '@deepseek-ai/dsh-experimental-session-tree/types'
import { TreePanel, type TreeInjected, type TreePanelProps } from '../src/client/TreePanel.tsx'
import { createTreeViewStore } from '../src/client/view-store.ts'
import { en } from '../src/client/locales.ts'
import type { TreeState } from '../src/client/model.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const id = (value: string) => value as SessionId
const node = (name: string, parent: string | null): TreeNode => ({
  sessionId:id(name), parentId:parent === null ? null : id(parent), forkSeq:parent === null ? null : 3,
  createdAt:0, title:name, summary:`Result of ${name}`, customSummary:'',
  messageCount:2, inheritedEventCount:parent === null ? 0 : 4, lastSeq:10, running:false, artifacts:[],
})
function unused(): never { throw new Error('The map does not read this global source') }
function fixture() {
  const nodes = [node('root',null),node('design','root'),node('test','root'),node('other',null)]
  const tree = createSnapshotStore<TreeState>({ tree:{ nodes }, loading:false, error:null })
  const sessions = createSnapshotStore<SessionListState>({
    ids:nodes.map(item => item.sessionId), byId:Object.fromEntries(nodes.map(item => [item.sessionId,{
      id:item.sessionId, displayTitle:item.title, running:false, retainedBy:item.sessionId === id('design') ? { mainView:1 } : {}, blank:false, updatedAt:0,
    }])), phase:'ready', projectionsBySession:{} })
  const theme = createSnapshotStore<ThemeSnapshot>({ preference:'light', fontSize:14, active:{ id:'light',colorScheme:'light',tokens:{} }, themes:[], revision:0 })
  const navigation = createSnapshotStore<{ sessionId: SessionId; seq: number } | null>(null)
  const view = createTreeViewStore().create()
  const open = vi.fn(), create = vi.fn(), annotate = vi.fn(async () => {})
  const search = vi.fn<TreeInjected['search']>().mockResolvedValue({ items: [], hasMore: false })
  const props: TreePanelProps = {
    usePanelInfo:unused, useWorkspaces:unused, useSessionStatus:unused, useSessionRetainInfo:unused, useResource:unused,
    useSessions:bindSnapshotSelector(sessions), useTree:bindSnapshotSelector(tree), useTheme:bindSnapshotSelector(theme),
    useNavigation:bindSnapshotSelector(navigation), useStore:bindSnapshotSelector(view), actions:view.actions,
    t:makeTranslate(en), refresh:vi.fn(async () => {}), open, create, annotate, search,
  }
  render(<TreePanel {...props} />)
  return { open,create,annotate,view,tree,navigation,search }
}

it('opens the existing native conversation from a card without creating another one', () => {
  const value = fixture()
  fireEvent.click(screen.getByRole('button',{ name:'Open conversation: design' }))
  expect(value.open).toHaveBeenCalledWith('design')
  expect(value.create).not.toHaveBeenCalled()
  expect(value.tree.getSnapshot().tree.nodes).toHaveLength(4)
  expect(screen.queryByRole('button',{ name:/Continue from|Make main line/ })).toBeNull()
  fireEvent.click(screen.getByRole('button',{ name:en.new }))
  expect(value.create).toHaveBeenCalledOnce()
})

it('scopes, collapses, and searches the map without removing saved conversations', () => {
  const value = fixture()
  expect(screen.queryByRole('button',{ name:'Open conversation: other' })).toBeNull()
  fireEvent.click(screen.getByRole('button',{ name:en.collapse }))
  expect(screen.queryByRole('button',{ name:'Open conversation: design' })).toBeNull()
  expect(value.tree.getSnapshot().tree.nodes).toHaveLength(4)
  fireEvent.change(screen.getByRole('textbox',{ name:en.search }),{ target:{ value:'design' } })
  fireEvent.click(screen.getByRole('button',{ name:'design' }))
  expect(screen.getByRole('button',{ name:'Open conversation: design' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{ name:en.showAll }))
  expect(screen.getByRole('button',{ name:'Open conversation: other' })).toBeTruthy()
})

it('keeps failed annotation edits and uses native conversation navigation for results', async () => {
  const value = fixture()
  act(() => { value.tree.set({ ...value.tree.getSnapshot(), tree:{ nodes:value.tree.getSnapshot().tree.nodes.map(item => item.sessionId !== id('design') ? item : {
    ...item, artifacts:[{ kind:'file',label:'Design notes',content:'design.md',seq:9,index:0 }],
  }) } }) })
  fireEvent.click(screen.getByRole('button',{ name:'Preview: Design notes' }))
  const dialog = screen.getByRole('dialog',{ name:'design' })
  expect(within(dialog).queryByText('Messages')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button',{ name:en.edit }))
  fireEvent.change(within(dialog).getByLabelText(en.summary),{ target:{ value:'Keep this summary' } })
  value.annotate.mockRejectedValueOnce(new Error('Disconnected'))
  fireEvent.click(within(dialog).getByRole('button',{ name:en.save }))
  await waitFor(() => { expect(within(dialog).getByRole<HTMLButtonElement>('button',{ name:en.save }).disabled).toBe(false) })
  expect(within(dialog).getByLabelText<HTMLTextAreaElement>(en.summary).value).toBe('Keep this summary')
  fireEvent.click(within(dialog).getByRole('button',{ name:en.viewFile }))
  expect(value.open).toHaveBeenCalledWith('design')
  expect(value.create).not.toHaveBeenCalled()
})

it('finds message content through native search and makes the selected card readable', async () => {
  const value = fixture()
  value.search.mockResolvedValueOnce({ items: [{ sessionId: id('other'), snippet: 'We discussed cache invalidation here.' }], hasMore: false })
  act(() => { value.view.actions.viewport(0,0,0.22) })
  fireEvent.change(screen.getByRole('textbox',{ name:en.search }),{ target:{ value:'invalidation' } })
  expect(screen.queryByText(en.noMatches)).toBeNull()
  const result = await screen.findByRole('button',{ name:'other' })
  expect(within(result).getByText('We discussed cache invalidation here.')).toBeTruthy()
  expect(value.search).toHaveBeenCalledWith('invalidation',expect.any(AbortSignal))
  fireEvent.click(result)
  expect(value.view.getSnapshot().zoom).toBe(1)
  expect(screen.getByRole('button',{ name:'Open conversation: other' })).toBeTruthy()
  expect(value.create).not.toHaveBeenCalled()
})

it('cancels superseded content queries and distinguishes unavailable search from no matches', async () => {
  const value = fixture()
  let resolveOld: (result: Awaited<ReturnType<TreeInjected['search']>>) => void = () => { throw new Error('Search not started') }
  value.search.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
  fireEvent.change(screen.getByRole('textbox',{ name:en.search }),{ target:{ value:'old query' } })
  await waitFor(() => { expect(value.search).toHaveBeenCalledOnce() })
  const oldSignal = value.search.mock.calls[0]?.[1]
  value.search.mockRejectedValueOnce(new Error('Disconnected'))
  fireEvent.change(screen.getByRole('textbox',{ name:en.search }),{ target:{ value:'new query' } })
  expect(oldSignal?.aborted).toBe(true)
  await act(async () => { resolveOld({ items: [{ sessionId:id('other'),snippet:'stale hit' }],hasMore:false }) })
  expect(await screen.findByText(en.searchFailed)).toBeTruthy()
  expect(screen.queryByText('stale hit')).toBeNull()
  expect(screen.queryByText(en.noMatches)).toBeNull()
})
