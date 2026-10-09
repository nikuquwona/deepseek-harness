/** On-demand map of native conversations, with editable summaries and result previews. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import { Button, Input, StateDot, IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionSearchResultItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { TreeState } from './model.ts'
import type { createTreeViewStore } from './view-store.ts'
import { CARD, ancestorPath, layoutForest, visibleTree } from './layout.ts'
import { DiagramPreview } from './DiagramPreview.tsx'
import { CardDetails, artifactLabel } from './CardDetails.tsx'
import type { NS } from './locales.ts'
import css from './TreePanel.module.css'

/** Native navigation and plugin-owned annotation callbacks supplied at registration. */
export interface TreeInjected {
  readonly hooks: {
    readonly tree: ObservableSnapshot<TreeState>
    readonly theme: ObservableSnapshot<ThemeSnapshot>
    readonly navigation: ObservableSnapshot<{ readonly sessionId: SessionId; readonly seq: number } | null>
  }
  readonly refresh: () => Promise<void>
  readonly create: () => void
  readonly open: (id: SessionId) => void
  readonly annotate: (id: SessionId, title: string, summary: string) => Promise<void>
  readonly search: (query: string, signal: AbortSignal) => Promise<{ items: SessionSearchResultItem[]; hasMore: boolean }>
}

/** Framework-derived map props. */
export type TreePanelProps = PropsRuntime<'main'> & PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createTreeViewStore>> & InjectFace<TreeInjected>

type LocalStyle = CSSProperties & Record<`--tree-${string}`, string | number>

/**
 * Render related conversations without duplicating the native chat or its branch action.
 * @param props - framework hooks and service callbacks.
 * @returns a navigable map with optional card details.
 */
export function TreePanel(props: TreePanelProps) {
  const { t, actions, useStore, useTree, useNavigation } = props
  const state = useTree(value => value)
  const navigation = useNavigation(value => value)
  const currentId = props.useSessions(list => Object.values(list.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id ?? null)
  const colorScheme = props.useTheme(value => value.active.colorScheme)
  const view = useStore(value => value)
  const [query, setQuery] = useState('')
  const [contentSearch, setContentSearch] = useState({
    query: '', items: [] as SessionSearchResultItem[], hasMore: false, pending: false, error: false,
  })
  const [focusAfterLoad, setFocusAfterLoad] = useState<SessionId | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const initialPlacement = useRef(false)
  const anchor = view.scopeId ?? currentId
  const visible = useMemo(() => visibleTree(state.tree.nodes, view.showAll ? null : anchor, view.collapsed),
    [state.tree.nodes, view.showAll, anchor, view.collapsed])
  const placed = useMemo(() => layoutForest(visible), [visible])
  const positions = useMemo(() => new Map(placed.map(item => [item.node.sessionId, item])), [placed])
  const currentPath = useMemo(() => ancestorPath(state.tree.nodes,currentId), [state.tree.nodes,currentId])
  const byId = useMemo(() => new Map(state.tree.nodes.map(node => [node.sessionId,node])), [state.tree.nodes])
  const selected = view.selectedId === null ? undefined : byId.get(view.selectedId)
  const normalized = query.trim().toLocaleLowerCase()
  const contentHits = new Map(contentSearch.query === normalized ? contentSearch.items.map(item => [item.sessionId,item.snippet]) : [])
  const matches = state.tree.nodes.filter(node => contentHits.has(node.sessionId)
    || `${node.title} ${node.summary}`.toLocaleLowerCase().includes(normalized))
  const searching = normalized !== '' && (contentSearch.query !== normalized || contentSearch.pending)
  const children = useMemo(() => {
    const counts = new Map<SessionId, number>()
    for (const node of state.tree.nodes) if (node.parentId !== null) counts.set(node.parentId,(counts.get(node.parentId) ?? 0)+1)
    return counts
  }, [state.tree.nodes])
  useEffect(() => { void props.refresh() }, [props.refresh])
  useEffect(() => {
    if (normalized === '') return
    const controller = new AbortController()
    setContentSearch({ query: normalized, items: [], hasMore: false, pending: true, error: false })
    const timer = setTimeout(() => {
      void props.search(normalized,controller.signal).then((result) => {
        if (!controller.signal.aborted) setContentSearch({ query: normalized, ...result, pending: false, error: false })
      }, () => {
        if (!controller.signal.aborted) setContentSearch({ query: normalized, items: [], hasMore: false, pending: false, error: true })
      })
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [normalized, props.search])
  useEffect(() => {
    if (currentId !== null) actions.scope(currentId)
  }, [currentId, actions])
  useEffect(() => {
    const element = viewport.current
    if (element === null) return
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const bounds = element.getBoundingClientRect()
        const zoom = Math.min(2, Math.max(0.15, view.zoom * (event.deltaY < 0 ? 1.1 : 0.9)))
        const ratio = zoom / view.zoom
        const x = event.clientX - bounds.left, y = event.clientY - bounds.top
        actions.viewport(x - (x - view.x) * ratio, y - (y - view.y) * ratio, zoom)
      } else actions.viewport(view.x - event.deltaX, view.y - event.deltaY, view.zoom)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { element.removeEventListener('wheel', wheel) }
  }, [actions, view.x, view.y, view.zoom])
  useEffect(() => {
    if (navigation === null) return
    actions.select(null)
    actions.scope(navigation.sessionId)
    setFocusAfterLoad(navigation.sessionId)
  }, [navigation, actions])
  useEffect(() => {
    if (focusAfterLoad === null) return
    const position = positions.get(focusAfterLoad)
    if (position === undefined) return
    const width = viewport.current?.clientWidth ?? 0
    actions.viewport(Math.max(32, (width - CARD.width) / 2) - position.x, 50 - position.y, 1)
    setFocusAfterLoad(null)
  }, [focusAfterLoad, positions, actions])
  const fit = (): void => {
    if (placed.length === 0 || viewport.current === null) return
    const maxX = Math.max(...placed.map(item => item.x + CARD.width))
    const maxY = Math.max(...placed.map(item => item.y + CARD.height))
    const zoom = Math.min(1, (viewport.current.clientWidth - 120) / maxX, (viewport.current.clientHeight - 120) / maxY)
    actions.viewport((viewport.current.clientWidth - maxX * zoom) / 2, (viewport.current.clientHeight - maxY * zoom) / 2, zoom)
  }
  const zoomTo = (value: number): void => {
    const zoom = Math.min(2,Math.max(0.15,value)), ratio = zoom / view.zoom
    const x = (viewport.current?.clientWidth ?? 0) / 2, y = (viewport.current?.clientHeight ?? 0) / 2
    actions.viewport(x - (x - view.x) * ratio, y - (y - view.y) * ratio, zoom)
  }
  useEffect(() => {
    if (initialPlacement.current || placed.length === 0 || !viewport.current?.clientWidth) return
    initialPlacement.current = true
    if (navigation !== null) return
    if (currentId !== null) setFocusAfterLoad(currentId)
    else fit()
  })
  const focus = (id: SessionId): void => { actions.scope(id); setFocusAfterLoad(id); setQuery('') }
  const open = (id: SessionId): void => { actions.select(null); props.open(id) }

  return <section className={css.root} aria-label={t('title')}>
    <header className={css.header}>
      <div><h1>{t('title')}</h1><p>{t('guide')}</p></div>
      <div className={css.headerActions}>
        {currentId !== null && <Button variant="outline" onClick={() => { open(currentId) }}>{t('back')}</Button>}
        <Button onClick={props.create}>{t('new')}</Button>
      </div>
    </header>
    <div className={css.toolbar}>
      <span className={css.forestLabel}><IconBranchOutlineRegular size={16} />{view.showAll || anchor === null ? t('forest') : t('exploration')}<span className={css.count}>{visible.length}</span></span>
      {anchor !== null && <Button size="sm" onClick={() => { actions.all(!view.showAll) }}>{view.showAll ? t('related') : t('showAll')}</Button>}
      <Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} onKeyDown={(event) => {
        if (event.key === 'Escape') setQuery('')
        const first = matches[0]
        if (event.key === 'Enter' && normalized !== '' && first !== undefined) { event.preventDefault(); focus(first.sessionId) }
      }} />
      <div className={css.zoomControls}>
        <Button size="sm" aria-label={t('zoomOut')} onClick={() => { zoomTo(view.zoom / 1.2) }}>−</Button>
        <span aria-label={t('zoom')}>{Math.round(view.zoom * 100)}%</span>
        <Button size="sm" aria-label={t('zoomIn')} onClick={() => { zoomTo(view.zoom * 1.2) }}>+</Button>
        <Button size="sm" onClick={fit}>{t('fit')}</Button>
        <Button size="sm" onClick={() => { void props.refresh() }} disabled={state.loading}>{t('refresh')}</Button>
      </div>
    </div>
    {state.error !== null && <div className={css.error} role="alert">{t('failed')}<Button size="sm" onClick={() => { void props.refresh() }}>{t('retry')}</Button><details><summary>{t('errorDetails')}</summary>{state.error}</details></div>}
    <div ref={viewport} className={css.viewport} tabIndex={0} role="region" aria-label={t('canvas')}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest('article,button,input'))) return
        drag.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (drag.current) actions.viewport(drag.current.originX + event.clientX - drag.current.x,
          drag.current.originY + event.clientY - drag.current.y, view.zoom)
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        const delta = 60
        if (event.key === 'ArrowLeft') actions.viewport(view.x + delta, view.y, view.zoom)
        else if (event.key === 'ArrowRight') actions.viewport(view.x - delta, view.y, view.zoom)
        else if (event.key === 'ArrowUp') actions.viewport(view.x, view.y + delta, view.zoom)
        else if (event.key === 'ArrowDown') actions.viewport(view.x, view.y - delta, view.zoom)
        else return
        event.preventDefault()
      }}>
      {state.tree.nodes.length === 0 ? <div className={css.empty}>
        {state.loading ? <span role="status" aria-label={t('loading')}><StateDot state="ongoing" size={24} /></span>
          : <><IconBranchOutlineRegular size={32} /><h2>{t('empty')}</h2><p>{t('emptyBody')}</p></>}
      </div> : <div className={clsx(css.world, view.zoom < 0.55 && css.overview)} style={{
        '--tree-x': `${view.x}px`, '--tree-y': `${view.y}px`, '--tree-zoom': view.zoom,
        '--tree-title-lines': Math.max(1,Math.min(4,Math.floor((CARD.height * view.zoom - 12) / 16.2))),
      } as LocalStyle}>
        <svg className={css.edges} aria-hidden="true">
          {placed.map((item) => {
            const parent = item.node.parentId === null ? undefined : positions.get(item.node.parentId)
            if (!parent) return null
            const x1 = parent.x + CARD.width / 2, y1 = parent.y + CARD.height
            const x2 = item.x + CARD.width / 2, y2 = item.y
            return <path key={item.node.sessionId} d={`M${x1},${y1} V${y2-CARD.gapY/2} H${x2} V${y2}`}
              className={currentPath.has(item.node.sessionId) ? css.currentEdge : undefined} />
          })}
        </svg>
        {placed.map(({ node,x,y }) => {
          const parent = node.parentId === null ? undefined : byId.get(node.parentId)
          const count = children.get(node.sessionId) ?? 0
          return <article key={node.sessionId} className={clsx(css.card, node.sessionId === currentId && css.currentCard,
            normalized && !matches.includes(node) && css.dimmed)}
          style={{ '--tree-card-x': `${x}px`, '--tree-card-y': `${y}px` } as LocalStyle} data-session-id={node.sessionId}>
            <div className={css.cardMeta}>
              {parent ? <button type="button" onClick={() => { open(parent.sessionId) }}>{t('from',{ title:parent.title || t('untitled') })}</button> : <span />}
              <span>{node.running ? t('running') : node.sessionId === currentId ? t('current') : ''}</span>
            </div>
            <button type="button" className={css.cardSelect} title={node.title || t('untitled')} onClick={() => { open(node.sessionId) }} aria-label={t('openNamed',{ title:node.title || t('untitled') })}>
              <h2>{node.title || t('untitled')}</h2><p>{node.summary || t('noSummary')}</p>
            </button>
            {node.artifacts.length > 0 && <div className={css.artifactStrip}>{node.artifacts.slice(-2).map(artifact => <button key={`${artifact.kind}:${artifact.seq}:${artifact.label}`} type="button" className={artifact.kind === 'diagram' ? css.diagramTile : undefined} onClick={() => { actions.select(node.sessionId) }} aria-label={t('previewNamed',{ title:artifact.label })}>
              {artifact.kind === 'diagram' ? <DiagramPreview source={artifact.content} label={t('diagram')} colorScheme={colorScheme} />
                : <><span>{artifactLabel(artifact,t)} · {artifact.label}</span><span>{artifact.content}</span></>}
            </button>)}</div>}
            <footer className={css.cardFooter}>
              {count > 0 && <Button size="sm" aria-expanded={!view.collapsed.includes(node.sessionId)} onClick={() => { actions.collapse(node.sessionId) }}>{view.collapsed.includes(node.sessionId) ? t('expand',{ count }) : t('collapse')}</Button>}
              <Button size="sm" className={css.detailsButton} onClick={() => { actions.select(node.sessionId) }}>{t('details')}</Button>
            </footer>
          </article>
        })}
      </div>}
      {normalized && <div className={css.searchResults} role="region" aria-label={t('searchResults')}>
        {matches.map(node => <button type="button" key={node.sessionId} className={css.searchResult} onClick={() => { focus(node.sessionId) }}
          aria-label={node.title || t('untitled')} aria-description={contentHits.get(node.sessionId)}>
          <strong>{node.title || t('untitled')}</strong>
          {contentHits.has(node.sessionId) && <span>{contentHits.get(node.sessionId)}</span>}
        </button>)}
        <span role="status">{searching ? t('searching') : contentSearch.error ? t('searchFailed')
          : matches.length === 0 ? t('noMatches') : contentSearch.hasMore ? t('moreMatches') : ''}</span>
      </div>}
    </div>
    {selected && <CardDetails key={selected.sessionId} node={selected} t={t} open={open} annotate={props.annotate}
      colorScheme={colorScheme} close={() => { actions.select(null) }} />}
  </section>
}
