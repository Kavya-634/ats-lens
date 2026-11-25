import { SECTION_LABELS } from '../sections'
import type { Analysis, DetectedSection, SectionKind } from '../types'
import { joinWrappedLines, stripBullet, BULLET_MARK_RE } from '../scoring/text'

/**
 * The editable resume. Flat and serialisable so it can live in React state,
 * be diffed for before/after scoring, and be exported to PDF/DOCX.
 */
export interface ResumeDoc {
  name: string
  /** Free-text contact line(s): email, phone, LinkedIn, location. */
  contact: ContactFields
  sections: EditableSection[]
}

export interface ContactFields {
  email: string
  phone: string
  linkedin: string
  location: string
  /** Anything else from the header we could not classify (website, GitHub…). */
  other: string
}

export interface EditableSection {
  id: string
  kind: SectionKind
  /** Heading text as it will be printed. */
  heading: string
  /** Paragraph lines. Bullets are stored without their marker; `bullet: true`. */
  items: EditableItem[]
}

export interface EditableItem {
  id: string
  text: string
  bullet: boolean
}

let counter = 0
export function uid(prefix = 'i'): string {
  counter += 1
  return `${prefix}${counter.toString(36)}${Date.now().toString(36).slice(-3)}`
}

/** Build the editable document from a parsed analysis. */
export function docFromAnalysis(analysis: Analysis): ResumeDoc {
  // Re-split every block on heading-shaped lines the parser did not
  // recognise ("My Story", "Where I've Worked"). The ATS view deliberately
  // ignores those; the editor should surface them so the user can relabel.
  const blocks = splitOnUnknownHeadings(analysis.sections)
  const header = blocks.find((s) => s.kind === 'contact') ?? inferHeader(blocks)
  const headerLines = (header?.lines ?? []).map((l) => l.trim()).filter(Boolean)

  // Name: first short line without digits or @.
  const nameIdx = headerLines.findIndex(
    (l) => l.length <= 60 && !/[@\d]/.test(l) && l.split(/\s+/).length <= 5,
  )
  const name = nameIdx >= 0 ? headerLines[nameIdx] : ''
  const rest = headerLines.filter((_, i) => i !== nameIdx)

  const contact: ContactFields = {
    email: analysis.contact.emails[0] ?? '',
    phone: analysis.contact.phones[0] ?? '',
    linkedin: analysis.contact.urls.find((u) => /linkedin\.com/i.test(u)) ?? '',
    location: '',
    other: '',
  }
  // Remove the recognised tokens from the header text; what's left is
  // location / other links.
  let leftover = rest.join(' · ')
  for (const tok of [contact.email, contact.phone, contact.linkedin]) {
    if (tok) leftover = leftover.split(tok).join(' ')
  }
  const otherUrls = analysis.contact.urls.filter((u) => u !== contact.linkedin)
  for (const u of otherUrls) leftover = leftover.split(u).join(' ')
  const leftoverParts = leftover
    .split(/\s*[·|•]\s*|\s{2,}|\s+[-–—]\s+/)
    .map((p) => p.replace(/^[\s·|•,-]+|[\s·|•,-]+$/g, '').trim())
    .filter(
      (p) => p && !/^(email|phone|tel|mobile|linkedin|github|portfolio|website)[:\s]*$/i.test(p),
    )
  const locationPart = leftoverParts.find((p) =>
    /^[A-Z][A-Za-z.\s]+,\s*[A-Z][A-Za-z.\s]+$|^(Remote|India|USA|UK|Canada|Australia|Germany|Singapore|UAE)$/.test(
      p,
    ),
  )
  contact.location = locationPart ?? ''
  contact.other = [...otherUrls, ...leftoverParts.filter((p) => p !== locationPart)].join(' · ')

  const sections: EditableSection[] = []
  for (const s of blocks) {
    if (s === header) continue
    sections.push(sectionFromDetected(s))
  }
  return { name, contact, sections }
}

/**
 * A line "looks like a heading" when it is short, has no sentence
 * punctuation, no digits, and is followed by content. Title Case or ALL
 * CAPS strengthens the guess. Used only for the editor's initial split.
 */
function looksLikeHeading(
  line: string,
  next: string | undefined,
  prev: string | undefined,
): boolean {
  const t = line.trim()
  if (!t || t.length > 40) return false
  if (/[.,;:!?]$/.test(t) || /\d|@|\//.test(t)) return false
  if (BULLET_MARK_RE.test(line)) return false
  const words = t.split(/\s+/)
  if (words.length > 6) return false
  const allCaps = t === t.toUpperCase() && /[A-Z]/.test(t)
  const titleCase =
    words.filter((w) => /^[A-Z]/.test(w) || /^(and|of|the|&|i|i['’]ve|a)$/i.test(w)).length ===
    words.length
  if (!allCaps && !titleCase) return false
  const n = next?.trim() ?? ''
  if (!n) return false
  const p = prev?.trim() ?? ''
  // Inside a flattened skills grid both neighbours are short terms; that is a
  // list item, not a heading. A heading may introduce such a list, though,
  // as long as what came before it was not itself a list item.
  if (isShortTerm(n) && (!p || isShortTerm(p))) return false
  if (!isShortTerm(n) && n.length <= t.length) return false
  return true
}

/** A skills-grid cell: one to three words, no punctuation. */
function isShortTerm(t: string): boolean {
  return t.length <= 24 && t.split(/\s+/).length <= 3 && !/[.;:!?]$/.test(t)
}

function splitOnUnknownHeadings(sections: DetectedSection[]): DetectedSection[] {
  const out: DetectedSection[] = []
  for (const s of sections) {
    let cur: DetectedSection = { ...s, lines: [] }
    const lines = s.lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const next = lines.slice(i + 1).find((l) => l.trim())
      const prev = [...lines.slice(0, i)].reverse().find((l) => l.trim())
      // Never split the first line of a recognised section (that's its content),
      // and never split inside Skills (short capitalised terms are normal there).
      const splittable = s.kind !== 'skills' && cur.lines.some((l) => l.trim())
      if (splittable && looksLikeHeading(line, next, prev) && !isNameLine(line, cur, s)) {
        out.push(cur)
        cur = { kind: 'other', heading: line.trim(), lines: [] }
        continue
      }
      cur.lines.push(line)
    }
    out.push(cur)
  }
  return out.filter((b) => b.lines.some((l) => l.trim()) || b.kind !== 'other')
}

/** The very first line of the document is a name, not a heading. */
function isNameLine(line: string, cur: DetectedSection, parent: DetectedSection): boolean {
  return (
    parent.kind === 'contact' &&
    cur.lines.filter((l) => l.trim()).length === 0 &&
    /^[A-Z][A-Za-z'’.-]+(\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(line.trim())
  )
}

/**
 * When no contact block was detected, the first "other" block often holds
 * the name and a tagline. Treat its leading non-sentence lines as the header.
 */
function inferHeader(blocks: DetectedSection[]): DetectedSection | undefined {
  const first = blocks[0]
  if (!first || first.kind !== 'other') return undefined
  const lines = first.lines.filter((l) => l.trim())
  const head: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const t = l.trim()
    if (t.length > 70 || /[.;!?]$/.test(t) || BULLET_MARK_RE.test(l)) break
    // Stop at anything that reads as a heading for what follows.
    if (head.length > 0 && looksLikeHeading(l, lines[i + 1], lines[i - 1])) break
    head.push(t)
    if (head.length >= 3) break
  }
  if (!head.length) return undefined
  // Remove exactly the leading header lines (not every equal line) so the
  // rest of the block is preserved in order.
  let removed = 0
  first.lines = first.lines.filter((l) => {
    if (removed < head.length && l.trim() === head[removed]) {
      removed++
      return false
    }
    return true
  })
  const header: DetectedSection = { kind: 'contact', heading: 'Header', lines: head }
  blocks.unshift(header)
  if (!first.lines.some((l) => l.trim())) blocks.splice(blocks.indexOf(first), 1)
  return header
}

function sectionFromDetected(s: DetectedSection): EditableSection {
  const lines = joinWrappedLines(s.lines)
  let items: EditableItem[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    const bullet = BULLET_MARK_RE.test(raw)
    items.push({ id: uid(), text: bullet ? stripBullet(raw) : t, bullet })
  }
  // A skills grid or table flattens to one short term per line. Fold runs
  // of 4+ such lines into one comma-separated line: that is how the clean
  // export should read, and it stops each cell being scored as a bullet.
  if (items.length >= 4 && items.every((i) => !i.bullet && isShortTerm(i.text))) {
    items = [{ id: uid(), text: items.map((i) => i.text).join(', '), bullet: false }]
  }
  return {
    id: uid('s'),
    kind: s.kind,
    heading: s.kind === 'other' && s.heading === 'Before first heading' ? 'Summary' : s.heading,
    items,
  }
}

/** Render the document back to the plain text an ATS would see. */
export function docToText(doc: ResumeDoc): string {
  const out: string[] = []
  if (doc.name) out.push(doc.name)
  const c = doc.contact
  const contactBits = [
    c.location,
    c.email ? `Email: ${c.email}` : '',
    c.phone ? `Phone: ${c.phone}` : '',
    c.linkedin ? `LinkedIn: ${c.linkedin}` : '',
    c.other,
  ].filter(Boolean)
  if (contactBits.length) out.push(contactBits.join(' · '))
  for (const s of doc.sections) {
    out.push('')
    out.push(s.heading)
    for (const it of s.items) {
      if (!it.text.trim()) continue
      out.push(it.bullet ? `• ${it.text}` : it.text)
    }
  }
  return out.join('\n')
}

export function standardHeading(kind: SectionKind): string {
  return SECTION_LABELS[kind]
}

export function cloneDoc(doc: ResumeDoc): ResumeDoc {
  return {
    name: doc.name,
    contact: { ...doc.contact },
    sections: doc.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })),
  }
}
