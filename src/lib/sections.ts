import type { ContactInfo, DetectedSection, SectionKind, Stats, Warning } from './types'

/**
 * Heading vocabulary. This mirrors what mainstream ATS parsers key on:
 * a short line, usually on its own, that matches a known section name.
 * Order matters only for display; matching is exact on a normalised key.
 */
const HEADINGS: Record<Exclude<SectionKind, 'contact' | 'other'>, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'career summary',
    'executive summary',
    'profile',
    'professional profile',
    'personal profile',
    'about',
    'about me',
    'objective',
    'career objective',
    'overview',
    'highlights',
    'career highlights',
    'qualifications',
    'summary of qualifications',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
    'work history',
    'career history',
    'relevant experience',
    'industry experience',
    'positions held',
    'professional background',
    'internships',
    'internship experience',
  ],
  education: [
    'education',
    'education and training',
    'education & training',
    'academic background',
    'academic history',
    'academics',
    'qualifications and education',
    'training',
  ],
  skills: [
    'skills',
    'technical skills',
    'core skills',
    'key skills',
    'core competencies',
    'competencies',
    'areas of expertise',
    'expertise',
    'technologies',
    'tools',
    'tools and technologies',
    'tools & technologies',
    'technical proficiencies',
    'proficiencies',
    'skills and tools',
    'skills & tools',
    'tech stack',
    'strengths',
  ],
  projects: [
    'projects',
    'personal projects',
    'selected projects',
    'key projects',
    'side projects',
    'academic projects',
    'portfolio',
    'open source',
  ],
  certifications: [
    'certifications',
    'certificates',
    'certification',
    'licenses',
    'licences',
    'licenses and certifications',
    'licenses & certifications',
    'credentials',
    'professional development',
    'courses',
    'coursework',
    'relevant coursework',
  ],
  awards: [
    'awards',
    'honors',
    'honours',
    'awards and honors',
    'awards & honors',
    'achievements',
    'accomplishments',
    'recognition',
  ],
  publications: ['publications', 'research', 'papers', 'talks', 'presentations', 'patents'],
  volunteering: [
    'volunteering',
    'volunteer experience',
    'volunteer work',
    'community',
    'community involvement',
    'leadership',
    'activities',
    'extracurricular activities',
    'extracurriculars',
  ],
  languages: ['languages', 'language skills'],
  interests: [
    'interests',
    'hobbies',
    'hobbies and interests',
    'hobbies & interests',
    'personal interests',
  ],
  references: ['references', 'referees'],
}

const HEADING_LOOKUP: Map<string, SectionKind> = new Map()
for (const [kind, names] of Object.entries(HEADINGS) as [SectionKind, string[]][]) {
  for (const n of names) HEADING_LOOKUP.set(n, kind)
}

export const SECTION_LABELS: Record<SectionKind, string> = {
  contact: 'Contact',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  publications: 'Publications',
  volunteering: 'Volunteering & Leadership',
  languages: 'Languages',
  interests: 'Interests',
  references: 'References',
  other: 'Unlabelled',
}

/** Normalise a candidate heading for lookup. */
function headingKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-') // fancy dashes
    .replace(/[:|•·▪■●◦\-–—_*#>]+$/g, '') // trailing punctuation / rules
    .replace(/^[•·▪■●◦\-–—_*#>\s]+/g, '') // leading bullets
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Decide whether a line is a section heading. ATS parsers are usually
 * conservative: the line must be short and match a known section name.
 */
export function classifyHeading(line: string): SectionKind | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.length > 48) return null
  // Headings don't end in sentence punctuation and rarely contain digits.
  if (/[.,;]$/.test(trimmed)) return null
  if (/\d/.test(trimmed)) return null

  const key = headingKey(trimmed)
  if (!key) return null
  const direct = HEADING_LOOKUP.get(key)
  if (direct) return direct

  // Tolerate decorations like "— EXPERIENCE —" or "EXPERIENCE:" already stripped;
  // also handle "Experience (5 years)" style by trimming parentheticals.
  const noParen = key.replace(/\s*\(.*?\)\s*$/, '').trim()
  if (noParen !== key) {
    const k = HEADING_LOOKUP.get(noParen)
    if (k) return k
  }
  return null
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// Permissive international phone matcher: optional +country, then 2–5 groups
// of digits separated by spaces, dots, dashes or parentheses. Digit-count
// checks below keep this from matching dates and IDs.
const PHONE_RE = /\+?\(?\d{1,4}\)?(?:[ \t.-]?\(?\d{1,4}\)?){2,5}/g
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s|,;)>]+|(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com)\/[^\s|,;)>]+/gi

export function extractContact(text: string): ContactInfo {
  const emails = uniq(text.match(EMAIL_RE) ?? [])
  const urls = uniq((text.match(URL_RE) ?? []).map((u) => u.replace(/[.)]+$/, '')))
  const phones = uniq(
    (text.match(PHONE_RE) ?? [])
      .map((p) => p.trim())
      .filter((p) => {
        const digits = p.replace(/\D/g, '')
        if (digits.length < 9 || digits.length > 15) return false
        // Reject things that look like years or date ranges, e.g. "2019 - 2023".
        if (/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(p)) return false
        return true
      }),
  )
  return { emails, phones, urls }
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items))
}

/** Tidy raw extracted text: normalise whitespace while keeping line structure. */
export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function computeStats(text: string): Stats {
  const words = text.split(/\s+/).filter(Boolean).length
  const lines = text.split('\n').filter((l) => l.trim()).length
  return { words, characters: text.length, lines }
}

/**
 * Split normalised text into labelled sections. Lines before the first
 * recognised heading are treated as the contact/header block.
 */
export function detectSections(text: string): DetectedSection[] {
  const lines = text.split('\n')
  const sections: DetectedSection[] = []
  let current: DetectedSection = { kind: 'contact', heading: 'Header', lines: [] }

  for (const line of lines) {
    const kind = classifyHeading(line)
    if (kind) {
      if (current.lines.some((l) => l.trim())) sections.push(current)
      current = { kind, heading: line.trim(), lines: [] }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.some((l) => l.trim())) sections.push(current)

  // Trim leading/trailing blank lines inside each section.
  for (const s of sections) {
    while (s.lines.length && !s.lines[0].trim()) s.lines.shift()
    while (s.lines.length && !s.lines[s.lines.length - 1].trim()) s.lines.pop()
  }

  // If the very first block has no contact-ish data and is long, call it "other".
  if (sections.length && sections[0].kind === 'contact') {
    const header = sections[0]
    const headerText = header.lines.join('\n')
    const c = extractContact(headerText)
    const looksLikeContact =
      c.emails.length || c.phones.length || c.urls.length || header.lines.length <= 6
    if (!looksLikeContact) {
      header.kind = 'other'
      header.heading = 'Before first heading'
    }
  }
  return sections
}

/** Heuristic: text that reads column-by-column often has many very short lines. */
export function looksMultiColumn(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 30) return false
  const short = lines.filter((l) => l.length <= 18).length
  return short / lines.length > 0.55
}

export function buildWarnings(opts: {
  sections: DetectedSection[]
  contact: ContactInfo
  text: string
}): Warning[] {
  const warnings: Warning[] = []
  const labelled = opts.sections.filter((s) => s.kind !== 'contact' && s.kind !== 'other')
  if (labelled.length === 0) warnings.push({ code: 'no-sections' })
  if (!opts.contact.emails.length && !opts.contact.phones.length)
    warnings.push({ code: 'no-contact' })
  if (looksMultiColumn(opts.text)) warnings.push({ code: 'multi-column' })
  return warnings
}
