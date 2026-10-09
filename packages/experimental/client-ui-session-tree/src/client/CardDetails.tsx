/** Optional card metadata and previews; conversation behavior stays in the native chat. */
import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { TreeArtifact, TreeNode } from '@deepseek-ai/dsh-experimental-session-tree/types'
import type { TreeInjected } from './TreePanel.tsx'
import { DiagramPreview } from './DiagramPreview.tsx'
import type { en, NS } from './locales.ts'
import css from './TreePanel.module.css'

const artifactKeys = { diagram:'diagram', commit:'commit', 'pull-request':'pullRequest', file:'file', link:'link' } as const satisfies Record<TreeArtifact['kind'], keyof typeof en>

/**
 * Name the evidence recorded by a preview without claiming verification.
 * @param artifact - persisted result or message reference.
 * @param t - locale translator.
 * @returns a localized result category.
 */
export function artifactLabel(artifact: TreeArtifact, t: TranslateNS<typeof NS>): string {
  return t(artifactKeys[artifact.kind])
}

/**
 * Show editable card copy and result previews in the shared modal.
 * @param props - selected card, native navigation, annotations, and locale.
 * @returns a focus-managed dialog; failed saves retain the draft.
 */
export function CardDetails({ node,t,open,annotate,close,colorScheme }: {
  node: TreeNode
  t: TranslateNS<typeof NS>
  open: TreeInjected['open']
  annotate: TreeInjected['annotate']
  close: () => void
  colorScheme: 'light' | 'dark'
}) {
  const [edit,setEdit] = useState(false)
  const [pending,setPending] = useState(false)
  const [title,setTitle] = useState(node.title)
  const [summary,setSummary] = useState(node.customSummary)
  const parentId = node.parentId
  return <Modal open title={node.title || t('untitled')} onClose={close} closeLabel={t('close')} className={css.detailsModal as string}
    footer={<><Button onClick={() => { setEdit(!edit) }}>{edit ? t('cancel') : t('edit')}</Button><Button variant="primary" onClick={() => { open(node.sessionId) }}>{t('open')}</Button></>}>
    <p className={css.muted}>{node.summary || t('noSummary')}</p>
    {parentId !== null && <Button size="sm" onClick={() => { open(parentId) }}>{t('source')}</Button>}
    {edit && <form className={css.editForm} onSubmit={(event) => {
      event.preventDefault(); setPending(true)
      void annotate(node.sessionId,title,summary).then(() => { setEdit(false) }, (_reportedByController: unknown) => {
        // The frame-wide toast reports failure; keep the user's edits available.
      }).finally(() => { setPending(false) })
    }}>
      <label>{t('cardTitle')}<Input value={title} maxLength={200} required onChange={(event) => { setTitle(event.target.value) }} /></label>
      <label>{t('summary')}<textarea value={summary} maxLength={4000} placeholder={t('auto')} onChange={(event) => { setSummary(event.target.value) }} /></label>
      <Button type="submit" variant="primary" disabled={pending || title.trim() === ''}>{t('save')}</Button>
    </form>}
    {node.artifacts.length > 0 && <section><h3 className={css.resultsHeading}>{t('artifacts')}</h3>{node.artifacts.map(artifact => <div className={css.artifact} key={`${artifact.kind}:${artifact.seq}:${artifact.content}`}>
      <span className={css.eyebrow}>{artifactLabel(artifact,t)} · {artifact.label}</span>
      {artifact.kind === 'diagram' ? <DiagramPreview source={artifact.content} label={t('diagram')} colorScheme={colorScheme} />
        : artifact.kind === 'file' ? <><p>{artifact.content}</p><Button size="sm" onClick={() => { open(node.sessionId) }}>{t('viewFile')}</Button></>
          : artifact.kind === 'commit' ? <p>{artifact.content}</p>
            : <a href={artifact.content} target="_blank" rel="noopener noreferrer">{artifact.content}</a>}
    </div>)}</section>}
  </Modal>
}
