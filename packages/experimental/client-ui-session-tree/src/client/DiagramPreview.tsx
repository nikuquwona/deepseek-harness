/** Sandboxed, non-interactive thumbnails of model-authored Mermaid artifacts. */
import { useEffect, useId, useRef, useState } from 'react'
import css from './TreePanel.module.css'

let renderer: Promise<typeof import('mermaid')['default']> | undefined
let rendering = Promise.resolve()

function loadRenderer() {
  renderer ??= import('mermaid').then(module => module.default)
  return renderer
}

/**
 * Render an artifact as an image, with its source retained when parsing fails.
 * @param props - source and localized accessible label.
 * @returns a script-free SVG image or the inspectable source.
 */
export function DiagramPreview({ source, label, colorScheme }: { source: string; label: string; colorScheme: 'light' | 'dark' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const generation = useRef(0)
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    const isAborted = (): boolean => controller.signal.aborted
    setImage(null)
    // Serialize initialization and rendering because Mermaid's configuration is global.
    rendering = rendering.then(async () => {
      if (isAborted()) return
      const mermaid = await loadRenderer()
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
        htmlLabels: false, theme: colorScheme === 'dark' ? 'dark' : 'neutral' })
      const { svg } = await mermaid.render(`tree${id}g${current}`, source)
      // An image document cannot execute Mermaid click handlers or embedded scripts.
      if (!isAborted()) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    }).catch((error: unknown) => {
      // Invalid model output remains visible as source; it must not break the canvas.
      console.warn('[session-tree] Diagram preview could not render', error)
    })
    return () => { controller.abort() }
  }, [id, source, colorScheme])
  return image === null ? <pre className={css.diagramSource}>{source}</pre>
    : <img className={css.diagramImage} src={image} alt={label} />
}
