import {
  Code2,
  Columns2,
  Eye,
  FileText,
  Gauge,
  Layers,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AtsPanel } from './components/AtsPanel'
import { ErrorAlert, WarningAlert } from './components/Alerts'
import { Dropzone } from './components/Dropzone'
import { OriginalPanel } from './components/OriginalPanel'
import { ScorePanel } from './components/ScorePanel'
import { useTheme } from './hooks/useTheme'
import { analyseFile, type AnalysisResult } from './lib/analyze'
import type { Mode } from './lib/scoring'
import { ParseError } from './lib/types'

const REPO_URL = 'https://github.com/Kavya-634/ats-lens'
const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/sample-resume.pdf`

type State =
  | { status: 'idle' }
  | { status: 'busy'; label: string }
  | { status: 'error'; error: ParseError }
  | { status: 'done'; result: AnalysisResult }

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [state, setState] = useState<State>({ status: 'idle' })

  const run = useCallback(async (file: File) => {
    setState({ status: 'busy', label: `Reading ${file.name}…` })
    try {
      const result = await analyseFile(file)
      setState({ status: 'done', result })
    } catch (err) {
      const error =
        err instanceof ParseError
          ? err
          : new ParseError('unknown', err instanceof Error ? err.message : String(err))
      setState({ status: 'error', error })
    }
  }, [])

  const loadSample = useCallback(async () => {
    setState({ status: 'busy', label: 'Loading the sample resume…' })
    try {
      // Same-origin static asset bundled with the site; not a third-party request.
      const res = await fetch(SAMPLE_URL)
      if (!res.ok) throw new Error(`Sample not found (${res.status})`)
      const blob = await res.blob()
      await run(new File([blob], 'sample-resume.pdf', { type: 'application/pdf' }))
    } catch (err) {
      setState({
        status: 'error',
        error: new ParseError('unknown', err instanceof Error ? err.message : String(err)),
      })
    }
  }, [run])

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  // Keep the page from navigating away if a file is dropped outside the dropzone.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const showHome = state.status !== 'done'

  return (
    <div className="app">
      <header className="topbar">
        <div className="container container--wide topbar__inner">
          <button type="button" className="brand" onClick={reset} aria-label="ATS Lens home">
            <span className="brand__mark" aria-hidden="true">
              <Eye size={18} strokeWidth={2.4} />
            </span>
            <span className="brand__text">ATS Lens</span>
          </button>
          <div className="topbar__actions">
            <span className="badge badge--privacy" title="All parsing happens in your browser">
              <ShieldCheck size={15} />
              <span className="badge__text">Your resume never leaves your device</span>
              <span className="badge__text badge__text--short" aria-hidden="true">
                On-device
              </span>
            </span>
            <a
              className="icon-btn"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="View source on GitHub"
            >
              <Code2 size={18} />
            </a>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {showHome ? (
          <div className="container">
            <section className="hero">
              <span className="hero__eyebrow">
                <ShieldCheck size={14} /> 100% private · runs in your browser
              </span>
              <h1>
                See your resume the way <em>an ATS</em> does
              </h1>
              <p>
                Most applications are read by software before a person ever opens them. Upload your
                resume to see exactly what text the machine extracts, and what it might miss.
              </p>
            </section>

            <Dropzone
              busy={state.status === 'busy'}
              busyLabel={state.status === 'busy' ? state.label : undefined}
              onFile={run}
              onSample={loadSample}
            />

            {state.status === 'error' ? <ErrorAlert error={state.error} onRetry={reset} /> : null}

            <section className="features" aria-label="How it works">
              <Feature
                icon={<FileText size={18} />}
                title="PDF and Word"
                body="Reads .pdf and .docx files the same way common parsers do: text only, top to bottom."
              />
              <Feature
                icon={<Layers size={18} />}
                title="Labelled sections"
                body="Contact, Summary, Experience, Education, Skills and more are picked out by heading."
              />
              <Feature
                icon={<WifiOff size={18} />}
                title="Nothing uploaded"
                body="There is no server. Parsing runs on your device, and your file stays in memory only."
              />
            </section>
          </div>
        ) : (
          <Results result={state.result} onReset={reset} />
        )}
      </main>

      <footer className="footer">
        <div className="container container--wide footer__inner">
          <span>
            ATS Lens is a free, open-source tool. It approximates how parsers behave; every ATS is a
            little different.
          </span>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="feature">
      <div className="feature__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

function Results({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const { analysis, preview } = result
  const [tab, setTab] = useState<'score' | 'compare'>('score')
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem('ats-lens-mode') === 'fresher' ? 'fresher' : 'experienced'
    } catch {
      return 'experienced'
    }
  })
  const changeMode = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem('ats-lens-mode', m)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="container container--wide">
      <div className="results__bar">
        <div className="results__file">
          <div className="results__file-icon" aria-hidden="true">
            <FileText size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="results__file-name" title={analysis.fileName}>
              {analysis.fileName}
            </div>
            <div className="results__file-meta">
              {analysis.fileType === 'pdf' ? 'PDF' : 'Word document'} · processed on this device
            </div>
          </div>
        </div>
        <div className="results__actions">
          <div className="panel__tabs results__tabs" role="tablist" aria-label="Results view">
            <button
              type="button"
              role="tab"
              className="panel__tab"
              aria-selected={tab === 'score'}
              onClick={() => setTab('score')}
            >
              <Gauge size={14} aria-hidden="true" /> Score
            </button>
            <button
              type="button"
              role="tab"
              className="panel__tab"
              aria-selected={tab === 'compare'}
              onClick={() => setTab('compare')}
            >
              <Columns2 size={14} aria-hidden="true" /> Side by side
            </button>
          </div>
          <button type="button" className="btn btn--sm" onClick={onReset}>
            <RotateCcw size={15} />
            Check another resume
          </button>
        </div>
      </div>

      {analysis.warnings.length ? (
        <div className="results__warnings">
          {analysis.warnings.map((w, i) => (
            <WarningAlert key={`${w.code}-${i}`} warning={w} />
          ))}
        </div>
      ) : null}

      {tab === 'score' ? (
        <ScorePanel analysis={analysis} mode={mode} onModeChange={changeMode} />
      ) : (
        <div className="panels">
          <OriginalPanel preview={preview} fileName={analysis.fileName} />
          <AtsPanel analysis={analysis} />
        </div>
      )}
    </div>
  )
}
