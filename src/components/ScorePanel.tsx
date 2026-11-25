import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Info,
  ListChecks,
  PenLine,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  CATEGORY_META,
  SEVERITY_LABEL,
  scoreBand,
  scoreResume,
  type CategoryScore,
  type Issue,
  type Mode,
} from '../lib/scoring'
import type { Analysis } from '../lib/types'
import { FIXES, ISSUE_TO_FIX } from '../lib/editor/fixes'

interface Props {
  analysis: Analysis
  mode: Mode
  onModeChange: (mode: Mode) => void
  /** When provided, issue cards get a "Fix it" button that jumps to the editor. */
  onFix?: () => void
}

export function ScorePanel({ analysis, mode, onModeChange, onFix }: Props) {
  const report = useMemo(() => scoreResume(analysis, mode), [analysis, mode])
  const band = scoreBand(report.overall)
  const issueCount = report.categories.reduce((n, c) => n + c.issues.length, 0)
  const uncertainCount = report.categories.reduce(
    (n, c) => n + c.issues.filter((i) => i.uncertain).length,
    0,
  )

  return (
    <section className="score" aria-labelledby="score-title">
      <div className="score__top">
        <div className="score__gauge-wrap">
          <Gauge value={report.overall} tone={band.tone} />
          <div className="score__headline">
            <h2 id="score-title" className="score__title">
              Estimated ATS score
            </h2>
            <p className={`score__band score__band--${band.tone}`}>{band.label}</p>
            <p className="score__meta">
              {issueCount === 0
                ? 'No issues found across 9 checks.'
                : `${issueCount} issue${issueCount === 1 ? '' : 's'} across 9 checks${uncertainCount ? `, ${uncertainCount} marked “possible”` : ''}.`}
            </p>
          </div>
        </div>

        <div className="score__controls">
          <ModeToggle mode={mode} onChange={onModeChange} />
          <p className="score__mode-hint">
            {mode === 'fresher'
              ? 'Expects Education first, one page, projects and internships.'
              : 'Expects Experience first, up to two pages, quantified results.'}
          </p>
        </div>
      </div>

      <p className="score__disclaimer">
        <Info size={14} aria-hidden="true" />
        <span>
          This is an <strong>estimate</strong> based on commonly known ATS practices and recruiter
          conventions, not any specific company’s algorithm. Different systems weigh things
          differently; use it to find fixable problems, not as a pass/fail grade.
        </span>
      </p>

      {report.notes.some((n) => n.startsWith('Capped')) ? (
        <div className="score__gate" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            {report.notes
              .filter((n) => n.startsWith('Capped'))
              .map((n) => (
                <p key={n}>{n}</p>
              ))}
          </div>
        </div>
      ) : null}

      {report.topFixes.length ? (
        <div className="topfixes">
          <h3 className="topfixes__title">
            <Sparkles size={16} aria-hidden="true" />
            {report.topFixes.length === 1
              ? 'The one fix that will raise your score most'
              : `Top ${report.topFixes.length} fixes that will raise your score most`}
          </h3>
          <ol className="topfixes__list">
            {report.topFixes.map((issue, i) => (
              <li key={issue.id} className="topfixes__item">
                <span className="topfixes__rank" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="topfixes__body">
                  <div className="topfixes__head">
                    <span className="topfixes__name">{issue.title}</span>
                    <SeverityPill severity={issue.severity} uncertain={issue.uncertain} />
                  </div>
                  <p className="topfixes__fix">{issue.fix}</p>
                  <span className="topfixes__foot">
                    <span className="topfixes__cat">
                      {CATEGORY_META[issue.category].label} · about +{formatImpact(issue.impact)}{' '}
                      points
                    </span>
                    <FixButton issue={issue} onFix={onFix} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="score__clean">
          <CheckCircle2 size={18} aria-hidden="true" />
          Nothing to fix. This resume should parse cleanly and read well.
        </div>
      )}

      <div className="categories">
        <h3 className="categories__title">
          <ListChecks size={16} aria-hidden="true" />
          Score breakdown
        </h3>
        <div className="categories__grid">
          {report.categories.map((c) => (
            <CategoryCard key={c.id} category={c} onFix={onFix} />
          ))}
        </div>
      </div>
    </section>
  )
}

function formatImpact(n: number): string {
  if (n < 1) return '1'
  return String(Math.round(n))
}

function Gauge({ value, tone }: { value: number; tone: 'good' | 'ok' | 'poor' }) {
  const r = 52
  const c = 2 * Math.PI * r
  const dash = (value / 100) * c
  return (
    <div
      className={`gauge gauge--${tone}`}
      role="img"
      aria-label={`Estimated ATS score ${value} out of 100`}
    >
      <svg viewBox="0 0 120 120" width="132" height="132">
        <circle className="gauge__track" cx="60" cy="60" r={r} />
        <circle
          className="gauge__fill"
          cx="60"
          cy="60"
          r={r}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4}
        />
      </svg>
      <div className="gauge__label">
        <span className="gauge__value">{value}</span>
        <span className="gauge__of">/ 100</span>
      </div>
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mode" role="radiogroup" aria-label="Candidate profile">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'fresher'}
        className="mode__btn"
        onClick={() => onChange('fresher')}
      >
        Fresher
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'experienced'}
        className="mode__btn"
        onClick={() => onChange('experienced')}
      >
        Experienced
      </button>
    </div>
  )
}

function SeverityPill({
  severity,
  uncertain,
}: {
  severity: Issue['severity']
  uncertain?: boolean
}) {
  return (
    <span className="sev-wrap">
      <span className={`sev sev--${severity}`}>{SEVERITY_LABEL[severity]}</span>
      {uncertain ? (
        <span className="sev sev--possible" title="Heuristic check; verify against your resume">
          <CircleHelp size={12} aria-hidden="true" /> Possible issue
        </span>
      ) : null}
    </span>
  )
}

function CategoryCard({ category, onFix }: { category: CategoryScore; onFix?: () => void }) {
  const [open, setOpen] = useState(false)
  const meta = CATEGORY_META[category.id]
  const tone = category.notAssessed
    ? 'na'
    : category.score >= 80
      ? 'good'
      : category.score >= 55
        ? 'ok'
        : 'poor'
  const worst = category.issues.reduce<Issue['severity'] | null>((acc, i) => {
    if (i.severity === 'high') return 'high'
    if (i.severity === 'medium' && acc !== 'high') return 'medium'
    return acc ?? i.severity
  }, null)

  return (
    <article className={`cat cat--${tone}${open ? ' cat--open' : ''}`}>
      <button
        type="button"
        className="cat__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`cat-${category.id}`}
      >
        <div className="cat__row">
          <span className="cat__label">{category.label}</span>
          {category.notAssessed ? (
            <span className="cat__score cat__score--na">—</span>
          ) : (
            <span className="cat__score">
              {category.score}
              <span className="cat__of">/100</span>
            </span>
          )}
        </div>
        <div className="cat__bar" aria-hidden="true">
          <span
            className="cat__bar-fill"
            style={{ width: `${category.notAssessed ? 0 : category.score}%` }}
          />
        </div>
        <div className="cat__row cat__row--sub">
          <span className="cat__summary">{category.summary}</span>
          <span className="cat__right">
            {category.notAssessed ? (
              <span className="cat__count">Not assessed</span>
            ) : category.issues.length ? (
              <span className="cat__count">
                {category.issues.length} issue{category.issues.length === 1 ? '' : 's'}
                {worst ? ` · ${SEVERITY_LABEL[worst]}` : ''}
              </span>
            ) : (
              <span className="cat__count cat__count--ok">
                <CheckCircle2 size={13} aria-hidden="true" /> Clear
              </span>
            )}
            <ChevronDown size={16} className="cat__chev" aria-hidden="true" />
          </span>
        </div>
      </button>
      <div id={`cat-${category.id}`} className="cat__body" hidden={!open}>
        <p className="cat__desc">
          {meta.description} Weight in overall score: {Math.round(category.weight * 100)}%.
        </p>
        {category.notAssessed ? (
          <p className="cat__none cat__none--partial">
            This check needs readable text. Fix the file first, then upload it again.
          </p>
        ) : category.issues.length ? (
          <div className="issues">
            {category.issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onFix={onFix} />
            ))}
          </div>
        ) : category.score < 100 ? (
          <p className="cat__none cat__none--partial">
            No specific problems to fix. The score reflects the ratio in the summary above; raising
            it further is a matter of degree, not a defect.
          </p>
        ) : (
          <p className="cat__none">No problems found in this category.</p>
        )}
      </div>
    </article>
  )
}

function FixButton({ issue, onFix }: { issue: Issue; onFix?: () => void }) {
  if (!onFix) return null
  const fix = ISSUE_TO_FIX[issue.id]
  const isVerb = issue.id === 'weak-openers' || issue.id === 'few-action-verbs'
  const isAiCandidate = issue.id === 'few-numbers' || issue.id === 'vague-claims'
  if (fix) {
    return (
      <button
        type="button"
        className="btn btn--sm btn--primary"
        onClick={onFix}
        title={FIXES[fix].description}
      >
        <Wand2 size={13} /> Fix it
      </button>
    )
  }
  if (isVerb) {
    return (
      <button
        type="button"
        className="btn btn--sm"
        onClick={onFix}
        title="Pick stronger verbs in the editor"
      >
        <PenLine size={13} /> Pick stronger verbs
      </button>
    )
  }
  if (isAiCandidate) {
    return (
      <button
        type="button"
        className="btn btn--sm"
        onClick={onFix}
        title="Open the editor; add numbers yourself or ask AI for a rewrite with placeholders"
      >
        <PenLine size={13} /> Edit bullets
      </button>
    )
  }
  return (
    <button type="button" className="btn btn--sm btn--ghost" onClick={onFix}>
      <PenLine size={13} /> Open editor
    </button>
  )
}

function IssueCard({ issue, onFix }: { issue: Issue; onFix?: () => void }) {
  return (
    <article className={`issue issue--${issue.severity}`}>
      <header className="issue__head">
        <h4 className="issue__title">{issue.title}</h4>
        <span className="issue__head-right">
          <SeverityPill severity={issue.severity} uncertain={issue.uncertain} />
          <FixButton issue={issue} onFix={onFix} />
        </span>
      </header>
      <dl className="issue__grid">
        <div>
          <dt>What we found</dt>
          <dd>{issue.detail}</dd>
        </div>
        <div>
          <dt>Why an ATS cares</dt>
          <dd>{issue.why}</dd>
        </div>
        <div>
          <dt>How to fix it</dt>
          <dd>{issue.fix}</dd>
        </div>
      </dl>
      {issue.evidence?.length ? (
        <div className="issue__evidence">
          <span className="issue__evidence-label">From your resume</span>
          <ul>
            {issue.evidence.map((e) => (
              <li key={e}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}
