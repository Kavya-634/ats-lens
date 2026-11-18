import { FileText, Sparkles, Upload } from 'lucide-react'
import { useCallback, useId, useRef, useState, type DragEvent } from 'react'

interface Props {
  busy: boolean
  busyLabel?: string
  onFile: (file: File) => void
  onSample: () => void
}

const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function Dropzone({ busy, busyLabel, onFile, onSample }: Props) {
  const [active, setActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setActive(false)
    if (busy) return
    handleFiles(e.dataTransfer.files)
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!active) setActive(true)
  }

  return (
    <section
      className={`dropzone${active ? ' dropzone--active' : ''}${busy ? ' dropzone--busy' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setActive(false)}
      aria-busy={busy}
    >
      <input
        ref={inputRef}
        id={inputId}
        className="dropzone__input"
        type="file"
        accept={ACCEPT}
        aria-label="Upload your resume (PDF or Word)"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
        disabled={busy}
      />
      <div className="dropzone__icon" aria-hidden="true">
        <Upload size={28} strokeWidth={2.2} />
      </div>
      {busy ? (
        <div className="dropzone__busy" role="status">
          <span className="spinner" aria-hidden="true" />
          {busyLabel ?? 'Reading your resume…'}
        </div>
      ) : (
        <>
          <h2>Upload your resume</h2>
          <p>Drag and drop a PDF or Word file here, or choose one from your device.</p>
        </>
      )}
      <div className="dropzone__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <FileText size={18} />
          Choose a file
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onSample}>
          <Sparkles size={18} />
          Try a sample resume
        </button>
      </div>
      <p className="dropzone__hint">PDF or .docx · up to 15 MB · nothing is uploaded anywhere</p>
    </section>
  )
}
