import { AtSign, Bot, Link2, Phone, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { SECTION_LABELS } from '../lib/sections'
import type { Analysis, DetectedSection, SectionKind } from '../lib/types'

interface Props {
  analysis: Analysis
}

const CORE: SectionKind[] = ['contact', 'summary', 'experience', 'education', 'skills']

export function AtsPanel({ analysis }: Props) {
  const [view, setView] = useState<'sections' | 'raw'>('sections')
  const empty = analysis.stats.words === 0
  const found = new Set(analysis.sections.map((s) => s.kind))
  if (analysis.contact.emails.length || analysis.contact.phones.length) found.add('contact')

  return (
    <section className="panel" aria-labelledby="ats-title">
      <header className="panel__head">
        <h2 className="panel__title" id="ats-title">
          <Bot size={18} />
          What an ATS sees
        </h2>
        {!empty ? (
          <div className="panel__tabs" role="tablist" aria-label="ATS view mode">
            <button
              type="button"
              role="tab"
              className="panel__tab"
              aria-selected={view === 'sections'}
              onClick={() => setView('sections')}
            >
              Sections
            </button>
            <button
              type="button"
              role="tab"
              className="panel__tab"
              aria-selected={view === 'raw'}
              onClick={() => setView('raw')}
            >
              Raw text
            </button>
          </div>
        ) : null}
      </header>
      <div className="panel__body panel__scroll">
        {empty ? (
          <EmptyState />
        ) : view === 'raw' ? (
          <pre className="raw-text">{analysis.rawText}</pre>
        ) : (
          <div className="ats-view">
            <div className="ats-stats" aria-label="Extraction statistics">
              <span className="stat">
                <strong>{analysis.stats.words.toLocaleString()}</strong> words
              </span>
              <span className="stat">
                <strong>{analysis.stats.lines.toLocaleString()}</strong> lines
              </span>
              {analysis.pages ? (
                <span className="stat">
                  <strong>{analysis.pages.length}</strong> page
                  {analysis.pages.length === 1 ? '' : 's'}
                </span>
              ) : null}
              <span className="stat">
                <strong>
                  {
                    analysis.sections.filter((s) => s.kind !== 'contact' && s.kind !== 'other')
                      .length
                  }
                </strong>{' '}
                sections detected
              </span>
            </div>

            <div className="section-summary" aria-label="Core sections">
              {CORE.map((kind) => {
                const ok = found.has(kind)
                return (
                  <span
                    key={kind}
                    className={`section-summary__pill ${ok ? 'section-summary__pill--found' : 'section-summary__pill--missing'}`}
                    style={{ ['--sec' as string]: `var(--sec-${kind})` }}
                    title={
                      ok
                        ? `${SECTION_LABELS[kind]} detected`
                        : `${SECTION_LABELS[kind]} not detected`
                    }
                  >
                    {ok ? '✓' : '–'} {SECTION_LABELS[kind]}
                  </span>
                )
              })}
            </div>

            {analysis.sections.map((section, i) => (
              <SectionBlock key={`${section.kind}-${i}`} section={section} analysis={analysis} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SectionBlock({ section, analysis }: { section: DetectedSection; analysis: Analysis }) {
  const label = SECTION_LABELS[section.kind]
  const style = { ['--sec' as string]: `var(--sec-${section.kind})` }
  const isHeader = section.kind === 'contact'
  return (
    <article
      className={`section-block${section.kind === 'other' ? ' section-block--muted' : ''}`}
      style={style}
      aria-label={`${label} section`}
    >
      <header className="section-block__head">
        <span className="section-block__label">{label}</span>
        {section.heading && section.heading !== label ? (
          <span className="section-block__heading" title={section.heading}>
            “{section.heading}”
          </span>
        ) : null}
      </header>
      {isHeader ? <ContactChips analysis={analysis} /> : null}
      <pre>{section.lines.join('\n')}</pre>
    </article>
  )
}

function ContactChips({ analysis }: { analysis: Analysis }) {
  const { emails, phones, urls } = analysis.contact
  if (!emails.length && !phones.length && !urls.length) return null
  return (
    <div className="contact-chips" aria-label="Detected contact details">
      {emails.map((e) => (
        <span className="chip" key={e} title="Email detected">
          <AtSign size={13} /> {e}
        </span>
      ))}
      {phones.map((p) => (
        <span className="chip" key={p} title="Phone detected">
          <Phone size={13} /> {p}
        </span>
      ))}
      {urls.map((u) => (
        <span className="chip" key={u} title="Link detected">
          <Link2 size={13} /> {u}
        </span>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <ScanLine size={26} />
      </div>
      <h3>Nothing. The ATS sees a blank page.</h3>
      <p>
        There is no selectable text in this file, only an image. Every word on your resume is
        invisible to automated screening until it’s exported as real text.
      </p>
    </div>
  )
}
