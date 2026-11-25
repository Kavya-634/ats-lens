import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  FileText,
  GripVertical,
  Info,
  List,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SECTION_LABELS } from '../lib/sections'
import type { Analysis, SectionKind } from '../lib/types'
import {
  CATEGORY_META,
  SEVERITY_LABEL,
  scoreBand,
  scoreResume,
  type Issue,
  type Mode,
  type ScoreReport,
} from '../lib/scoring'
import {
  cloneDoc,
  docFromAnalysis,
  uid,
  type EditableItem,
  type EditableSection,
  type ResumeDoc,
} from '../lib/editor/doc'
import {
  FIXES,
  ISSUE_TO_FIX,
  PLACEHOLDER,
  applyFix,
  suggestVerbs,
  type FixId,
  type VerbSuggestion,
} from '../lib/editor/fixes'
import { scoreDoc } from '../lib/editor/rescore'
import { ImproveError, improveBullet, improveStatus } from '../lib/editor/ai'

interface Props {
  analysis: Analysis
  mode: Mode
  onModeChange: (m: Mode) => void
}

const SECTION_KINDS: SectionKind[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'awards',
  'publications',
  'volunteering',
  'languages',
  'interests',
  'references',
  'other',
]

export function Editor({ analysis, mode, onModeChange }: Props) {
  const [doc, setDoc] = useState<ResumeDoc>(() => docFromAnalysis(analysis))
  const [history, setHistory] = useState<ResumeDoc[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  /** Fixes that have run and found nothing more to do on the current doc. */
  const [exhausted, setExhausted] = useState<Set<FixId>>(() => new Set())
  const fileBase = analysis.fileName.replace(/\.(pdf|docx)$/i, '') || 'resume'

  useEffect(() => {
    let alive = true
    improveStatus().then((s) => alive && setAiAvailable(s.available))
    return () => {
      alive = false
    }
  }, [])

  const before = useMemo(() => scoreResume(analysis, mode), [analysis, mode])
  const after = useMemo(
    () => scoreDoc(doc, analysis.fileName, mode),
    [doc, analysis.fileName, mode],
  )
  const verbSuggestions = useMemo(() => suggestVerbs(doc), [doc])

  const commit = useCallback(
    (next: ResumeDoc, message?: string) => {
      setHistory((h) => [...h.slice(-29), cloneDoc(doc)])
      setDoc(next)
      setExhausted(new Set())
      if (message) setToast(message)
    },
    [doc],
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const undo = () => {
    setHistory((h) => {
      const prev = h[h.length - 1]
      if (prev) setDoc(prev)
      return h.slice(0, -1)
    })
    setExhausted(new Set())
  }

  const runFix = (id: FixId) => {
    const r = applyFix(doc, id, mode)
    if (r.count === 0) {
      setToast(r.changed)
      setExhausted((s) => new Set(s).add(id))
      return
    }
    commit(r.doc, r.changed)
    // A fix that only inserted placeholders can't do more until the user
    // types real values; don't offer it again for the same issue.
    if (id === 'label-contact' || id === 'add-missing-sections') {
      setExhausted(new Set([id]))
    }
  }

  const applyVerb = (s: VerbSuggestion, replacement: string) => {
    const next = cloneDoc(doc)
    const sec = next.sections.find((x) => x.id === s.sectionId)
    const it = sec?.items.find((x) => x.id === s.itemId)
    if (it) it.text = replacement
    commit(next, 'Bullet updated.')
  }

  const setItemText = (sectionId: string, itemId: string, text: string) => {
    setDoc((d) => {
      const next = cloneDoc(d)
      const it = next.sections.find((s) => s.id === sectionId)?.items.find((i) => i.id === itemId)
      if (it) it.text = text
      return next
    })
  }

  const replaceItemText = (sectionId: string, itemId: string, text: string, message: string) => {
    const next = cloneDoc(doc)
    const it = next.sections.find((s) => s.id === sectionId)?.items.find((i) => i.id === itemId)
    if (it) it.text = text
    commit(next, message)
  }

  // Issues from the *current* doc that have a one-click fix the user hasn't
  // already exhausted. Placeholder-only issues are excluded because the
  // remaining work is the user's.
  const fixableIssues = useMemo(() => {
    const seen = new Set<FixId>()
    const out: { issue: Issue; fix: FixId }[] = []
    for (const c of after.categories) {
      for (const issue of c.issues) {
        const fix = ISSUE_TO_FIX[issue.id]
        if (fix && !seen.has(fix) && !exhausted.has(fix) && !isPlaceholderOnly(issue, doc)) {
          seen.add(fix)
          out.push({ issue, fix })
        }
      }
    }
    return out.sort((a, b) => b.issue.impact - a.issue.impact)
  }, [after, exhausted, doc])

  // Cheap hygiene fixes that are worth offering even when the scorer's
  // threshold wasn't crossed (one "I am…" line is still one too many).
  const extraFixes = useMemo(() => {
    const out: { id: FixId; title: string }[] = []
    const text = doc.sections.flatMap((s) => s.items.map((i) => i.text)).join('\n')
    const offered = new Set(fixableIssues.map((f) => f.fix))
    if (
      !offered.has('remove-first-person') &&
      !exhausted.has('remove-first-person') &&
      /\b(I am|I'm|I have|I was|\bmy\b)/i.test(text)
    ) {
      out.push({ id: 'remove-first-person', title: 'A line is written in the first person' })
    }
    if (
      !offered.has('normalise-dates') &&
      !exhausted.has('normalise-dates') &&
      /\b\d{1,2}\/(19|20)\d{2}\b|\b(19|20)\d{2}\s*-\s*(19|20)\d{2}\b/.test(text)
    ) {
      out.push({ id: 'normalise-dates', title: 'Some dates could be written more clearly' })
    }
    return out
  }, [doc, fixableIssues, exhausted])

  const remainingIssues = useMemo(
    () =>
      after.categories
        .flatMap((c) => c.issues)
        .filter(
          (i) =>
            (!ISSUE_TO_FIX[i.id] ||
              exhausted.has(ISSUE_TO_FIX[i.id]) ||
              isPlaceholderOnly(i, doc)) &&
            i.id !== 'weak-openers' &&
            i.id !== 'few-action-verbs',
        ),
    [after, exhausted, doc],
  )

  const download = async (kind: 'pdf' | 'docx') => {
    try {
      let blob: Blob
      if (kind === 'pdf') {
        const { exportPdf } = await import('../lib/editor/exportPdf')
        const bytes = await exportPdf(doc)
        blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      } else {
        const { exportDocx } = await import('../lib/editor/exportDocx')
        blob = await exportDocx(doc)
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileBase}-ats-friendly.${kind}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setToast(`Downloaded ${a.download}`)
    } catch (err) {
      setToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const placeholders = countPlaceholders(doc)

  return (
    <div className="editor">
      <ScoreCompare before={before} after={after} mode={mode} onModeChange={onModeChange} />

      <div className="editor__grid">
        <aside className="editor__side">
          <div className="fixcard">
            <h3 className="fixcard__title">
              <Wand2 size={16} aria-hidden="true" /> One-click fixes
            </h3>
            {fixableIssues.length === 0 && extraFixes.length === 0 ? (
              <p className="fixcard__empty">
                <Check size={14} aria-hidden="true" /> Nothing left to auto-fix. Edit freely on the
                right.
              </p>
            ) : (
              <ul className="fixlist">
                {fixableIssues.map(({ issue, fix }) => (
                  <li key={fix} className="fixlist__item">
                    <div className="fixlist__text">
                      <span className="fixlist__issue">{issue.title}</span>
                      <span className="fixlist__desc">{FIXES[fix].description}</span>
                      <span className="fixlist__meta">
                        <span className={`sev sev--${issue.severity}`}>
                          {SEVERITY_LABEL[issue.severity]}
                        </span>
                        {issue.uncertain ? (
                          <span className="sev sev--possible">Possible issue</span>
                        ) : null}
                        <span className="fixlist__cat">{CATEGORY_META[issue.category].label}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      onClick={() => runFix(fix)}
                    >
                      Fix it
                    </button>
                  </li>
                ))}
                {extraFixes.map((f) => (
                  <li key={f.id} className="fixlist__item">
                    <div className="fixlist__text">
                      <span className="fixlist__issue">{f.title}</span>
                      <span className="fixlist__desc">{FIXES[f.id].description}</span>
                      <span className="fixlist__meta">
                        <span className="sev sev--low">Tidy-up</span>
                      </span>
                    </div>
                    <button type="button" className="btn btn--sm" onClick={() => runFix(f.id)}>
                      Fix it
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {verbSuggestions.length ? (
            <div className="fixcard">
              <h3 className="fixcard__title">
                <List size={16} aria-hidden="true" /> Weak openers · pick a stronger verb
              </h3>
              <p className="fixcard__hint">
                We never rewrite a sentence for you without asking. Choose a replacement or edit the
                line yourself.
              </p>
              <ul className="verblist">
                {verbSuggestions.slice(0, 8).map((s) => (
                  <li key={s.itemId} className="verblist__item">
                    <div className="verblist__orig">
                      <mark>{s.weak}</mark>
                      {s.original.slice(s.weak.length)}
                    </div>
                    <div className="verblist__opts">
                      {s.options.map((o) => (
                        <button
                          key={o}
                          type="button"
                          className="chipbtn"
                          onClick={() => applyVerb(s, o)}
                          title={o}
                        >
                          {o.split(' ').slice(0, 2).join(' ')}
                          {o.split(' ').length > 2 ? '…' : ''}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {verbSuggestions.length > 8 ? (
                <p className="fixcard__hint">
                  {verbSuggestions.length - 8} more below in the editor.
                </p>
              ) : null}
            </div>
          ) : null}

          {remainingIssues.length ? (
            <div className="fixcard fixcard--muted">
              <h3 className="fixcard__title">
                <Info size={16} aria-hidden="true" /> Needs your words
              </h3>
              <p className="fixcard__hint">
                These need facts only you have. The editor marks places to add them.
              </p>
              <ul className="remaining">
                {remainingIssues.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <strong>{i.title}.</strong> {i.fix}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="fixcard fixcard--download">
            <h3 className="fixcard__title">
              <Download size={16} aria-hidden="true" /> Download the fixed resume
            </h3>
            <p className="fixcard__hint">
              Single column, Helvetica/Calibri, real bullets, no tables or graphics. Same text the
              score above is based on.
            </p>
            {placeholders > 0 ? (
              <p className="fixcard__warn">
                {placeholders} placeholder{placeholders === 1 ? '' : 's'} like{' '}
                <code>[add number]</code> still in the text. Fill them in before sending.
              </p>
            ) : null}
            <div className="fixcard__actions">
              <button type="button" className="btn btn--primary" onClick={() => download('pdf')}>
                <FileText size={16} /> PDF
              </button>
              <button type="button" className="btn" onClick={() => download('docx')}>
                <FileText size={16} /> Word (.docx)
              </button>
            </div>
          </div>
        </aside>

        <section className="editor__main" aria-label="Resume editor">
          <div className="editor__toolbar">
            <span className="editor__toolbar-title">Edit your resume</span>
            <div className="editor__toolbar-actions">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={undo}
                disabled={!history.length}
              >
                <Undo2 size={14} /> Undo
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  commit(docFromAnalysis(analysis), 'Reset to the parsed original.')
                }}
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>

          <div className="edoc">
            <div className="edoc__header">
              <input
                className="edoc__name"
                value={doc.name}
                placeholder="Your full name"
                onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))}
                aria-label="Full name"
              />
              <div className="edoc__contact">
                {(
                  [
                    ['email', 'Email', 'you@example.com'],
                    ['phone', 'Phone', '+91 98765 43210'],
                    ['linkedin', 'LinkedIn', 'linkedin.com/in/you'],
                    ['location', 'Location', 'City, Country'],
                    ['other', 'Other links', 'github.com/you · portfolio.site'],
                  ] as const
                ).map(([key, label, ph]) => (
                  <label key={key} className="edoc__field">
                    <span>{label}</span>
                    <input
                      value={doc.contact[key]}
                      placeholder={ph}
                      className={isPlaceholder(doc.contact[key]) ? 'is-placeholder' : ''}
                      onChange={(e) =>
                        setDoc((d) => ({ ...d, contact: { ...d.contact, [key]: e.target.value } }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            {doc.sections.map((s, idx) => (
              <SectionEditor
                key={s.id}
                section={s}
                index={idx}
                total={doc.sections.length}
                mode={mode}
                aiAvailable={aiAvailable === true}
                verbSuggestions={verbSuggestions.filter((v) => v.sectionId === s.id)}
                onChange={(next) =>
                  setDoc((d) => ({
                    ...d,
                    sections: d.sections.map((x) => (x.id === s.id ? next : x)),
                  }))
                }
                onCommit={(next, msg) => {
                  const nd = cloneDoc(doc)
                  nd.sections = nd.sections.map((x) => (x.id === s.id ? next : x))
                  commit(nd, msg)
                }}
                onMove={(dir) => {
                  const nd = cloneDoc(doc)
                  const j = idx + dir
                  if (j < 0 || j >= nd.sections.length) return
                  ;[nd.sections[idx], nd.sections[j]] = [nd.sections[j], nd.sections[idx]]
                  commit(nd, 'Section moved.')
                }}
                onDelete={() => {
                  const nd = cloneDoc(doc)
                  nd.sections = nd.sections.filter((x) => x.id !== s.id)
                  commit(nd, `Removed “${s.heading}”.`)
                }}
                onItemText={(itemId, text) => setItemText(s.id, itemId, text)}
                onItemReplace={(itemId, text, msg) => replaceItemText(s.id, itemId, text, msg)}
                onVerb={applyVerb}
              />
            ))}

            <div className="edoc__add">
              <label>
                <Plus size={14} aria-hidden="true" /> Add section
                <select
                  value=""
                  onChange={(e) => {
                    const kind = e.target.value as SectionKind
                    if (!kind) return
                    const nd = cloneDoc(doc)
                    nd.sections.push({
                      id: uid('s'),
                      kind,
                      heading: SECTION_LABELS[kind],
                      items: [
                        {
                          id: uid(),
                          text: '',
                          bullet: kind === 'experience' || kind === 'projects',
                        },
                      ],
                    })
                    commit(nd, `Added “${SECTION_LABELS[kind]}”.`)
                  }}
                >
                  <option value="">Choose…</option>
                  {SECTION_KINDS.filter((k) => k !== 'other').map((k) => (
                    <option key={k} value={k}>
                      {SECTION_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>
      </div>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ScoreCompare({
  before,
  after,
  mode,
  onModeChange,
}: {
  before: ScoreReport
  after: ScoreReport
  mode: Mode
  onModeChange: (m: Mode) => void
}) {
  const delta = after.overall - before.overall
  const bandAfter = scoreBand(after.overall)
  return (
    <div className="compare">
      <div className="compare__scores">
        <div className="compare__col">
          <span className="compare__label">Before</span>
          <span className={`compare__num compare__num--${scoreBand(before.overall).tone}`}>
            {before.overall}
          </span>
        </div>
        <div className="compare__arrow" aria-hidden="true">
          →
        </div>
        <div className="compare__col">
          <span className="compare__label">After your edits</span>
          <span className={`compare__num compare__num--${bandAfter.tone}`}>{after.overall}</span>
        </div>
        <div className="compare__delta-wrap">
          <span className={`compare__delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
          <span className="compare__band">{bandAfter.label}</span>
        </div>
      </div>
      <div className="compare__right">
        <div className="mode" role="radiogroup" aria-label="Candidate profile">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'fresher'}
            className="mode__btn"
            onClick={() => onModeChange('fresher')}
          >
            Fresher
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'experienced'}
            className="mode__btn"
            onClick={() => onModeChange('experienced')}
          >
            Experienced
          </button>
        </div>
        <ul className="compare__cats">
          {after.categories.map((c) => {
            const b = before.categories.find((x) => x.id === c.id)
            const d = c.score - (b?.score ?? 0)
            return (
              <li key={c.id} title={`${c.label}: ${b?.score ?? 0} → ${c.score}`}>
                <span className="compare__cat-label">{shortLabel(c.id)}</span>
                <span className="compare__cat-bar">
                  <span className="compare__cat-before" style={{ width: `${b?.score ?? 0}%` }} />
                  <span className="compare__cat-after" style={{ width: `${c.score}%` }} />
                </span>
                <span className={`compare__cat-delta ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}`}>
                  {d > 0 ? `+${d}` : d || ''}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function shortLabel(id: string): string {
  return (
    (
      {
        parseability: 'Parsing',
        headings: 'Headings',
        contact: 'Contact',
        dates: 'Dates',
        length: 'Length',
        verbs: 'Verbs',
        quantified: 'Numbers',
        spelling: 'Spelling',
        keywords: 'Keywords',
      } as Record<string, string>
    )[id] ?? id
  )
}

// ---------------------------------------------------------------------------

function SectionEditor({
  section,
  index,
  total,
  mode,
  aiAvailable,
  verbSuggestions,
  onChange,
  onCommit,
  onMove,
  onDelete,
  onItemText,
  onItemReplace,
  onVerb,
}: {
  section: EditableSection
  index: number
  total: number
  mode: Mode
  aiAvailable: boolean
  verbSuggestions: VerbSuggestion[]
  onChange: (s: EditableSection) => void
  onCommit: (s: EditableSection, msg: string) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onItemText: (itemId: string, text: string) => void
  onItemReplace: (itemId: string, text: string, msg: string) => void
  onVerb: (s: VerbSuggestion, replacement: string) => void
}) {
  const roleLine = section.items.find((i) => !i.bullet && /(19|20)\d{2}/.test(i.text))?.text
  return (
    <article className="esec" style={{ ['--sec' as string]: `var(--sec-${section.kind})` }}>
      <header className="esec__head">
        <GripVertical size={16} className="esec__grip" aria-hidden="true" />
        <input
          className="esec__heading"
          value={section.heading}
          onChange={(e) => onChange({ ...section, heading: e.target.value })}
          aria-label="Section heading"
        />
        <select
          className="esec__kind"
          value={section.kind}
          onChange={(e) => {
            const kind = e.target.value as SectionKind
            onCommit(
              { ...section, kind, heading: SECTION_LABELS[kind] },
              `Section is now “${SECTION_LABELS[kind]}”.`,
            )
          }}
          aria-label="Section type"
          title="Tell the parser what this section is"
        >
          {SECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {SECTION_LABELS[k]}
            </option>
          ))}
        </select>
        <div className="esec__actions">
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move section up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move section down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm icon-btn--danger"
            onClick={onDelete}
            aria-label="Delete section"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      <ul className="esec__items">
        {section.items.map((it, i) => (
          <ItemEditor
            key={it.id}
            item={it}
            sectionKind={section.kind}
            sectionHeading={section.heading}
            roleLine={roleLine}
            mode={mode}
            aiAvailable={aiAvailable}
            verb={verbSuggestions.find((v) => v.itemId === it.id)}
            onText={(t) => onItemText(it.id, t)}
            onToggleBullet={() =>
              onCommit(
                {
                  ...section,
                  items: section.items.map((x) =>
                    x.id === it.id ? { ...x, bullet: !x.bullet } : x,
                  ),
                },
                it.bullet ? 'Now a paragraph.' : 'Now a bullet.',
              )
            }
            onDelete={() =>
              onCommit(
                { ...section, items: section.items.filter((x) => x.id !== it.id) },
                'Line removed.',
              )
            }
            onInsertAfter={() => {
              const items = [...section.items]
              items.splice(i + 1, 0, { id: uid(), text: '', bullet: it.bullet })
              onCommit({ ...section, items }, 'Line added.')
            }}
            onReplace={(t, msg) => onItemReplace(it.id, t, msg)}
            onVerb={(s, r) => onVerb(s, r)}
          />
        ))}
        {section.items.length === 0 ? (
          <li className="esec__empty">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                onCommit(
                  {
                    ...section,
                    items: [
                      {
                        id: uid(),
                        text: '',
                        bullet: section.kind === 'experience' || section.kind === 'projects',
                      },
                    ],
                  },
                  'Line added.',
                )
              }
            >
              <Plus size={14} /> Add a line
            </button>
          </li>
        ) : null}
      </ul>
    </article>
  )
}

// ---------------------------------------------------------------------------

function ItemEditor({
  item,
  sectionKind,
  sectionHeading,
  roleLine,
  mode,
  aiAvailable,
  verb,
  onText,
  onToggleBullet,
  onDelete,
  onInsertAfter,
  onReplace,
  onVerb,
}: {
  item: EditableItem
  sectionKind: SectionKind
  sectionHeading: string
  roleLine?: string
  mode: Mode
  aiAvailable: boolean
  verb?: VerbSuggestion
  onText: (t: string) => void
  onToggleBullet: () => void
  onDelete: () => void
  onInsertAfter: () => void
  onReplace: (t: string, msg: string) => void
  onVerb: (s: VerbSuggestion, replacement: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [ai, setAi] = useState<{
    status: 'idle' | 'loading' | 'done' | 'error'
    options?: string[]
    error?: string
  }>({ status: 'idle' })
  const [showVerbs, setShowVerbs] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [item.text])

  const canAi =
    aiAvailable &&
    item.bullet &&
    item.text.trim().length >= 12 &&
    (sectionKind === 'experience' ||
      sectionKind === 'projects' ||
      sectionKind === 'volunteering' ||
      sectionKind === 'other')

  const runAi = async () => {
    setAi({ status: 'loading' })
    try {
      const r = await improveBullet({
        bullet: item.text,
        mode,
        context: { section: sectionHeading, role: roleLine },
      })
      setAi({ status: 'done', options: r.suggestions })
    } catch (err) {
      setAi({
        status: 'error',
        error: err instanceof ImproveError ? err.message : 'Could not reach the AI service.',
      })
    }
  }

  return (
    <li className={`eitem${item.bullet ? ' eitem--bullet' : ''}${verb ? ' eitem--weak' : ''}`}>
      <button
        type="button"
        className="eitem__marker"
        onClick={onToggleBullet}
        title={item.bullet ? 'Bullet (click for paragraph)' : 'Paragraph (click for bullet)'}
        aria-label="Toggle bullet"
      >
        {item.bullet ? '•' : '¶'}
      </button>
      <div className="eitem__body">
        <textarea
          ref={ref}
          className={`eitem__text${isPlaceholder(item.text) ? ' has-placeholder' : ''}`}
          value={item.text}
          rows={1}
          onChange={(e) => onText(e.target.value)}
          placeholder={item.bullet ? 'Action verb + what you did + measurable result' : 'Text'}
          aria-label="Line text"
        />
        {verb ? (
          <div className="eitem__verb">
            <button
              type="button"
              className="linkbtn"
              onClick={() => setShowVerbs((v) => !v)}
              aria-expanded={showVerbs}
            >
              Starts with “{verb.weak}” · stronger verb <ChevronDown size={12} />
            </button>
            {showVerbs ? (
              <div className="eitem__verb-opts">
                {verb.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className="chipbtn"
                    onClick={() => {
                      onVerb(verb, o)
                      setShowVerbs(false)
                    }}
                  >
                    {o.split(' ')[0]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {ai.status === 'done' && ai.options ? (
          <div className="eitem__ai">
            <div className="eitem__ai-head">
              <Sparkles size={13} aria-hidden="true" /> Pick a rewrite. Anything in{' '}
              <code>[brackets]</code> is for you to fill in; nothing was invented.
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                onClick={() => setAi({ status: 'idle' })}
                aria-label="Dismiss suggestions"
              >
                <X size={12} />
              </button>
            </div>
            {ai.options.map((o) => (
              <button
                key={o}
                type="button"
                className="eitem__ai-opt"
                onClick={() => {
                  onReplace(o, 'Bullet replaced with AI suggestion.')
                  setAi({ status: 'idle' })
                }}
              >
                {renderPlaceholders(o)}
              </button>
            ))}
          </div>
        ) : null}
        {ai.status === 'error' ? <p className="eitem__ai-err">{ai.error}</p> : null}
      </div>
      <div className="eitem__actions">
        {canAi ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={runAi}
            disabled={ai.status === 'loading'}
            title="Rewrite this bullet with AI (only this line is sent)"
          >
            <Sparkles size={13} /> {ai.status === 'loading' ? 'Thinking…' : 'Improve with AI'}
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={onInsertAfter}
          aria-label="Add line below"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--sm icon-btn--danger"
          onClick={onDelete}
          aria-label="Delete line"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

function isPlaceholder(t: string): boolean {
  return /\[[^\]]+\]/.test(t)
}

/** Contact issues whose field already holds a placeholder: only the user can finish these. */
function isPlaceholderOnly(issue: Issue, doc: ResumeDoc): boolean {
  switch (issue.id) {
    case 'no-email':
      return isPlaceholder(doc.contact.email)
    case 'no-phone':
      return isPlaceholder(doc.contact.phone)
    case 'no-linkedin':
      return isPlaceholder(doc.contact.linkedin)
    case 'no-location':
      return isPlaceholder(doc.contact.location)
    case 'name-not-first':
      return isPlaceholder(doc.name)
    default:
      return false
  }
}

function countPlaceholders(doc: ResumeDoc): number {
  let n = 0
  const count = (t: string) => (t.match(/\[[^\]]+\]/g) ?? []).length
  n += count(doc.name)
  for (const v of Object.values(doc.contact)) n += count(v)
  for (const s of doc.sections) for (const i of s.items) n += count(i.text)
  return n
}

function renderPlaceholders(text: string) {
  const parts = text.split(/(\[[^\]]+\])/g)
  return parts.map((p, i) =>
    /^\[[^\]]+\]$/.test(p) ? (
      <mark key={i} className="ph">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

export { PLACEHOLDER }
