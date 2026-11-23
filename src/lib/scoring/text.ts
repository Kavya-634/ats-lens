import type { Analysis } from '../types'

/**
 * Bullet glyphs, including the junk that Wingdings/Symbol bullets turn into
 * when extracted (§ ü ¡ ■ q v Ø …). A single such character followed by
 * whitespace at the start of a line is treated as a marker.
 */
export const BULLET_MARK_RE = /^[\s]*(?:[•·▪■●◦‣⁃○\-–—*>+➢➤►▶✓✔✗❖◆◇♦]|[§¡¶ü¨Ø¤]\s|[qvo]\s(?=[A-Z]))/

/**
 * Lines that look like achievement statements. When a section uses explicit
 * bullet markers we trust them; otherwise we fall back to sentence-shaped
 * lines (long, or ending in a full stop) and skip role/company/date headers.
 */
export function bulletLines(analysis: Analysis): string[] {
  const out: string[] = []
  const preferred = analysis.sections.filter(
    (s) => s.kind === 'experience' || s.kind === 'projects' || s.kind === 'volunteering',
  )
  // With no recognised sections, judge whatever prose exists so the
  // verb/number checks still have something useful to say.
  const pool = preferred.length
    ? preferred
    : analysis.sections.filter((s) => s.kind === 'other' || s.kind === 'contact')
  for (const s of pool) {
    const lines = joinWrappedLines(s.lines)
    const marked = lines.filter((l) => BULLET_MARK_RE.test(l))
    const candidates = marked.length >= 2 ? marked : lines
    for (const raw of candidates) {
      const line = stripBullet(raw)
      if (!line) continue
      if (line.length < 25) continue
      if (marked.length < 2) {
        // Unmarked section: be stricter about what counts as a statement.
        if (DATE_LINE_RE.test(line) && line.length < 80) continue
        if (!/[.;!]$/.test(line) && line.length < 60) continue
        if (looksLikeHeaderLine(line)) continue
      }
      out.push(line)
    }
  }
  return out
}

/**
 * PDF extraction yields one line per visual line, so a bullet that wraps
 * arrives as two lines, the second starting lowercase. Re-join those so a
 * continuation isn't judged as its own weak-verb, number-free bullet.
 */
export function joinWrappedLines(lines: string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    const prev = out[out.length - 1]
    const continuation =
      prev !== undefined &&
      !BULLET_MARK_RE.test(raw) &&
      /^[a-z(]/.test(t) &&
      !/[.;!?:]$/.test(prev) &&
      !DATE_LINE_RE.test(t.slice(0, 20))
    if (continuation) out[out.length - 1] = `${prev} ${t}`
    else out.push(raw)
  }
  return out
}

/** "Company Name City, ST" or "Job Title at Company" style lines. */
function looksLikeHeaderLine(line: string): boolean {
  const w = line.split(/\s+/)
  if (w.length > 8) return false
  const capitalised = w.filter((x) => /^[A-Z(]/.test(x)).length
  return capitalised / w.length > 0.7 && !/[.;!]$/.test(line)
}

export function stripBullet(line: string): string {
  return line
    .replace(/^[\s]*(?:[•·▪■●◦‣⁃○\-–—*>+➢➤►▶✓✔✗❖◆◇♦]+|[§¡¶ü¨Ø¤]\s|[qvo]\s(?=[A-Z]))\s*/, '')
    .trim()
}

export function firstWord(line: string): string {
  const m = /^[A-Za-z][A-Za-z'’-]*/.exec(line)
  return m ? m[0].toLowerCase() : ''
}

/** Words in body text, lowercased, letters only. */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'’-]{1,}/g) ?? []).map((w) =>
    w.replace(/^['’-]+|['’-]+$/g, ''),
  )
}

export const MONTHS =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

const YEAR = '(?:19|20)\\d{2}'
const PRESENT = '(?:present|current|now|ongoing|till date|to date|today)'

/** Any single date token: "Mar 2022", "03/2022", "2022", "2022-03", "Present". */
export const DATE_TOKEN_RE = new RegExp(
  `\\b(?:${MONTHS}\\.?,?\\s+${YEAR}|\\d{1,2}[/.-]${YEAR}|${YEAR}[/.-]\\d{1,2}|${YEAR}|${PRESENT})\\b`,
  'gi',
)

/** A range: two tokens joined by a dash, "to", or "–". */
export const DATE_RANGE_RE = new RegExp(
  `(${MONTHS}\\.?,?\\s+${YEAR}|\\d{1,2}[/.-]${YEAR}|${YEAR}[/.-]\\d{1,2}|${YEAR})\\s*(?:-|–|—|to|until|through|~)\\s*(${MONTHS}\\.?,?\\s+${YEAR}|\\d{1,2}[/.-]${YEAR}|${YEAR}[/.-]\\d{1,2}|${YEAR}|${PRESENT})`,
  'gi',
)

export const DATE_LINE_RE = new RegExp(DATE_TOKEN_RE.source, 'i')

export type DateStyle = 'month-year' | 'numeric' | 'year-only' | 'iso'

export function classifyDateToken(token: string): DateStyle | null {
  const t = token.trim()
  if (new RegExp(`^${MONTHS}\\.?,?\\s+${YEAR}$`, 'i').test(t)) return 'month-year'
  if (new RegExp(`^\\d{1,2}[/.-]${YEAR}$`).test(t)) return 'numeric'
  if (new RegExp(`^${YEAR}[/.-]\\d{1,2}$`).test(t)) return 'iso'
  if (new RegExp(`^${YEAR}$`).test(t)) return 'year-only'
  return null
}

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

export function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole
}

export function sample<T>(items: T[], n = 3): T[] {
  return items.slice(0, n)
}

export function truncate(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}
