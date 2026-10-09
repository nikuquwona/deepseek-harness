/** Session Tree registration through public Slot and Remote APIs. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button, IconBranchOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import treeRemote from '@deepseek-ai/dsh-experimental-session-tree/remote'
import { en, zh, NS } from './locales.ts'
import { TreeModel } from './model.ts'
import { TreePanel, type TreeInjected } from './TreePanel.tsx'
import { createTreeViewStore } from './view-store.ts'

const PANEL_ID = 'session-tree' as MainPanelId

/** The generated Remote is mounted before the feature's own service injection. */
export const inject = ['remote']

interface Notice { readonly seq: number; readonly text: string; readonly success: boolean }
type NoticeFace = {
  hooks: { notice: ReturnType<typeof createSnapshotStore<Notice | null>> }
  dismiss: () => void
}

function TreeToast({ useNotice, dismiss }: InjectFace<NoticeFace>) {
  const notice = useNotice(value => value)
  return notice === null ? null : <Toast key={notice.seq} text={notice.text} {...notice.success ? { tone:'success' as const } : {}} onDone={dismiss} />
}

function TreeIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconBranchOutlineRegular size={size} />
}

function TreeAction({ t, openTree }: PropsLocale<typeof NS> & { openTree: () => void }) {
  return <Button size="sm" onClick={openTree} icon={<IconBranchOutlineRegular size={14} />}>{t('treeAction')}</Button>
}

function registerTree(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS,{ en,zh }), 'session-tree: dictionaries')
  const t = ctx.locale.bind(NS)
  const notice = createSnapshotStore<Notice | null>(null)
  const navigation = createSnapshotStore<{ sessionId: SessionId; seq: number } | null>(null)
  let sequence = 0
  const openTree = (sessionId: SessionId): void => {
    navigation.set({ sessionId,seq:++sequence })
    ctx.layout.selectPanel(PANEL_ID)
  }
  const show = (text: string, success: boolean): void => { notice.set({ seq:++sequence,text,success }) }
  const model = new TreeModel(async (signal) => {
    const response = await ctx.remote.sessionTree.list(signal)
    if (!response.ok) throw response.error
    return response.value
  })
  ctx.effect(() => () => model.dispose(), 'session-tree: forest mirror')
  const mutation = async <T,>(operation: () => Promise<T>, message: keyof typeof en): Promise<T> => {
    try {
      const value = await operation()
      await ctx.sessions.refresh()
      await model.refresh()
      show(t(message),true)
      return value
    } catch (error) {
      show(`${t('failedAction')}: ${error instanceof Error ? error.message : String(error)}`,false)
      await model.refresh()
      throw error
    }
  }
  const face: TreeInjected = {
    hooks: { tree:model.source, navigation, theme: {
      getSnapshot: () => ctx.theme.getTheme(),
      subscribe: listener => ctx.on('theme/change', listener),
    } },
    refresh: () => model.refresh(),
    open: (id) => { ctx.uiWorkspace.openSession(id) },
    create: () => { ctx.uiWorkspace.startSession() },
    search: async (query,signal) => {
      const result = await ctx.remote.sessionTree.search(query,signal)
      if (!result.ok) throw result.error
      return result.value
    },
    annotate: (id,title,summary) => mutation(async () => {
      const result = await ctx.remote.sessionTree.annotate(id,title,summary)
      if (!result.ok) throw result.error
    },'saved'),
  }
  const refreshWhenVisible = (): void => {
    if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) void model.refresh()
  }
  ctx.effect(() => ctx.sessions.list.subscribe(refreshWhenVisible), 'session-tree: catalog changes')
  ctx.on('connection/reset', refreshWhenVisible)
  ctx.slots.inject('main', () => ctx.slots.register({
    name:'main',key:PANEL_ID,locale:NS,store:createTreeViewStore(),inject:() => face,
  },TreePanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name:'sidebar.panellist',id:PANEL_ID,order:15,label:() => t('title'),locale:NS,
  },TreeIcon))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name:'shell.overlay',id:'session-tree.notice',inject:(): NoticeFace => ({ hooks:{ notice },dismiss:() => {notice.set(null)} }),
  },TreeToast))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name:'conversation.session.header.actions',id:PANEL_ID,locale:NS,
    inject:sessionId => ({ openTree:() => {openTree(sessionId)} }),
  },TreeAction))
}

/**
 * Mount the generated Remote and then the tree UI; unload releases both contributions.
 * @param ctx - browser root with the Remote assembly.
 * @returns the complete plugin disposer.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(treeRemote)
  const ui = ctx.inject(['remote.sessionTree','slots','sessions','layout','uiWorkspace','locale','theme'],registerTree)
  try { await ui } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => { await ui.dispose(); await disposeRemote() }
}
