import { FileText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { OriginalPreview } from '../lib/types'

interface Props {
  preview: OriginalPreview
  fileName: string
}

export function OriginalPanel({ preview, fileName }: Props) {
  return (
    <section className="panel" aria-labelledby="original-title">
      <header className="panel__head">
        <h2 className="panel__title" id="original-title">
          <FileText size={18} />
          Your resume
        </h2>
        <span className="panel__sub">As you see it</span>
      </header>
      <div className="panel__body panel__scroll">
        {preview.kind === 'pdf' ? (
          <PdfPages data={preview.data} fileName={fileName} />
        ) : (
          <div
            className="docx-preview"
            // Sanitised in parseDocx: no scripts, no live links, data: images only.
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        )}
      </div>
    </section>
  )
}

const MAX_PREVIEW_PAGES = 6

function PdfPages({ data, fileName }: { data: ArrayBuffer; fileName: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    container.replaceChildren()
    setState('loading')

    ;(async () => {
      try {
        const { openPdf } = await import('../lib/parsePdf')
        // Copy: pdf.js transfers the buffer to its worker.
        const doc = await openPdf(data.slice(0))
        if (cancelled) {
          doc.loadingTask.destroy().catch(() => {})
          return
        }
        setPageCount(doc.numPages)
        const n = Math.min(doc.numPages, MAX_PREVIEW_PAGES)
        const width = Math.max(320, container.clientWidth - 32)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        for (let i = 1; i <= n && !cancelled; i++) {
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const scale = width / base.width
          const viewport = page.getViewport({ scale: scale * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
          canvas.className = 'pdf-page'
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', `${fileName}, page ${i}`)
          await page.render({ canvas, viewport }).promise
          if (!cancelled) container.appendChild(canvas)
          page.cleanup()
        }
        doc.loadingTask.destroy().catch(() => {})
        if (!cancelled) setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [data, fileName])

  return (
    <div className="pdf-pages">
      {state === 'loading' ? (
        <div className="pdf-preview__fallback" role="status">
          <span className="spinner" aria-hidden="true" /> Rendering preview…
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="pdf-preview__fallback">
          The preview couldn’t be rendered in this browser.
        </div>
      ) : null}
      <div ref={containerRef} className="pdf-pages__list" />
      {state === 'ready' && pageCount > MAX_PREVIEW_PAGES ? (
        <div className="pdf-preview__fallback">
          Preview shows the first {MAX_PREVIEW_PAGES} of {pageCount} pages.
        </div>
      ) : null}
    </div>
  )
}
