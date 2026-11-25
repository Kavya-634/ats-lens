import { SECTION_LABELS } from '../sections'
import type { SectionKind } from '../types'
import { ACTION_VERBS, WEAK_OPENERS } from '../scoring/wordlists'
import { MONTHS, classifyDateToken } from '../scoring/text'
import { cloneDoc, uid, type EditableItem, type ResumeDoc } from './doc'

/**
 * Deterministic fixes. Each one takes the document and returns a new one plus
 * a short description of what changed. No fix ever adds facts: it reorders,
 * relabels, normalises formatting, or inserts a clearly marked placeholder.
 */
export interface FixResult {
  doc: ResumeDoc
  /** Plain-English summary of what changed, for the toast. */
  changed: string
  /** Number of edits made; 0 means the fix found nothing to do. */
  count: number
}

export type FixId =
  | 'standardise-headings'
  | 'clean-bullets'
  | 'normalise-dates'
  | 'label-contact'
  | 'reorder-sections'
  | 'remove-personal-details'
  | 'remove-first-person'
  | 'fix-spelling'
  | 'fix-brand-casing'
  | 'dedupe-skills'
  | 'add-missing-sections'

export interface FixDescriptor {
  id: FixId
  label: string
  description: string
}

/** Which deterministic fix (if any) resolves a given scorer issue id. */
export const ISSUE_TO_FIX: Record<string, FixId> = {
  'no-headings': 'standardise-headings',
  'nonstandard-headings': 'standardise-headings',
  'unlabelled-content': 'standardise-headings',
  'missing-summary': 'add-missing-sections',
  'missing-skills': 'add-missing-sections',
  'missing-education': 'add-missing-sections',
  'missing-experience': 'add-missing-sections',
  'missing-projects': 'add-missing-sections',
  'order-fresher': 'reorder-sections',
  'order-experienced': 'reorder-sections',
  'odd-chars': 'clean-bullets',
  'symbol-fonts': 'clean-bullets',
  'letter-spacing': 'clean-bullets',
  'no-bullets': 'clean-bullets',
  'mixed-formats': 'normalise-dates',
  'month-forms': 'normalise-dates',
  'no-email': 'label-contact',
  'no-phone': 'label-contact',
  'no-linkedin': 'label-contact',
  'contact-not-top': 'label-contact',
  'name-not-first': 'label-contact',
  'no-location': 'label-contact',
  'header-footer': 'label-contact',
  'personal-details': 'remove-personal-details',
  'first-person': 'remove-first-person',
  misspellings: 'fix-spelling',
  'doubled-words': 'fix-spelling',
  'brand-casing': 'fix-brand-casing',
  'duplicate-skills': 'dedupe-skills',
}

export const FIXES: Record<FixId, FixDescriptor> = {
  'standardise-headings': {
    id: 'standardise-headings',
    label: 'Standardise headings',
    description:
      'Rename every section to the plain name parsers expect (Experience, Education, Skills…).',
  },
  'clean-bullets': {
    id: 'clean-bullets',
    label: 'Clean bullets & symbols',
    description:
      'Replace icon-font junk and odd characters with plain bullets; un-space letter-spaced headings.',
  },
  'normalise-dates': {
    id: 'normalise-dates',
    label: 'Make dates consistent',
    description:
      'Rewrite every date as “Mon YYYY” (e.g. Mar 2022) and every range with an en dash.',
  },
  'label-contact': {
    id: 'label-contact',
    label: 'Label contact details',
    description:
      'Put your name on line 1 and a labelled contact line (Email, Phone, LinkedIn) directly under it. Missing items get a placeholder to fill in.',
  },
  'reorder-sections': {
    id: 'reorder-sections',
    label: 'Reorder sections',
    description: 'Move sections into the order recruiters expect for your profile.',
  },
  'remove-personal-details': {
    id: 'remove-personal-details',
    label: 'Remove personal details',
    description: 'Delete date of birth, marital status, nationality, religion and ID numbers.',
  },
  'remove-first-person': {
    id: 'remove-first-person',
    label: 'Drop “I / my”',
    description: 'Rewrite first-person openers into implied first person.',
  },
  'fix-spelling': {
    id: 'fix-spelling',
    label: 'Fix spelling',
    description: 'Correct the misspellings and doubled words we found.',
  },
  'fix-brand-casing': {
    id: 'fix-brand-casing',
    label: 'Fix product names',
    description: 'JavaScript, GitHub, LinkedIn, PostgreSQL… spelled the official way.',
  },
  'dedupe-skills': {
    id: 'dedupe-skills',
    label: 'Remove duplicate skills',
    description: 'Drop repeated entries from the Skills section.',
  },
  'add-missing-sections': {
    id: 'add-missing-sections',
    label: 'Add missing section',
    description:
      'Insert an empty section with a placeholder for you to complete. Nothing is invented.',
  },
}

export function applyFix(doc: ResumeDoc, id: FixId, mode: 'fresher' | 'experienced'): FixResult {
  switch (id) {
    case 'standardise-headings':
      return standardiseHeadings(doc)
    case 'clean-bullets':
      return cleanBullets(doc)
    case 'normalise-dates':
      return normaliseDates(doc)
    case 'label-contact':
      return labelContact(doc)
    case 'reorder-sections':
      return reorderSections(doc, mode)
    case 'remove-personal-details':
      return removePersonalDetails(doc)
    case 'remove-first-person':
      return removeFirstPerson(doc)
    case 'fix-spelling':
      return fixSpelling(doc)
    case 'fix-brand-casing':
      return fixBrandCasing(doc)
    case 'dedupe-skills':
      return dedupeSkills(doc)
    case 'add-missing-sections':
      return addMissingSections(doc, mode)
  }
}

// ---------------------------------------------------------------------------

function standardiseHeadings(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  const taken = new Set(doc.sections.filter((s) => s.kind !== 'other').map((s) => s.kind))
  for (const s of doc.sections) {
    if (s.kind === 'other') {
      s.kind = guessKind(s, taken)
      taken.add(s.kind)
    }
    if (s.kind === 'other') continue // keep the user's own wording for truly custom blocks
    const std = SECTION_LABELS[s.kind]
    if (s.heading !== std) {
      s.heading = std
      count++
    }
  }
  return {
    doc,
    count,
    changed: count
      ? `Renamed ${count} heading${count > 1 ? 's' : ''}.`
      : 'Headings were already standard.',
  }
}

/**
 * Classify an unlabelled block from its heading words first, then its
 * content shape. Only ever produces a *kind*; the text is untouched.
 */
function guessKind(
  s: { heading: string; items: EditableItem[] },
  taken: Set<SectionKind>,
): SectionKind {
  const h = s.heading.toLowerCase()
  if (/work|career|employ|experience|journey|professional|position|role/.test(h))
    return 'experience'
  if (/stor(y|ies)|about|profile|summary|objective|who i am|intro/.test(h)) return 'summary'
  if (/know|skill|tool|tech|stack|compet|expert|strength/.test(h)) return 'skills'
  if (/educat|academ|school|universit|degree|qualif/.test(h)) return 'education'
  if (/project|portfolio|built|work samples/.test(h)) return 'projects'
  if (/certif|licen|course|training/.test(h)) return 'certifications'
  if (/award|honou?r|achievement|recogni/.test(h)) return 'awards'
  if (/volunteer|community|leadership|activit|extracurric/.test(h)) return 'volunteering'
  if (/language/.test(h)) return 'languages'
  if (/interest|hobb/.test(h)) return 'interests'
  if (/personal|details|information/.test(h)) return 'other'

  const text = s.items.map((i) => i.text).join('\n')
  const hasDates = /(19|20)\d{2}/.test(text)
  const bullets = s.items.filter((i) => i.bullet).length
  const parts = text.split(/[,\n]/).filter(Boolean)
  const avgPart = parts.length ? text.length / parts.length : 0
  if (hasDates && bullets >= 1) return 'experience'
  if (parts.length > 6 && avgPart < 25) return 'skills'
  if (
    hasDates &&
    /b\.?(a|s|sc|tech|e)|m\.?(a|s|sc|tech|ba)|university|college|institute|school/i.test(text)
  )
    return 'education'
  if (!taken.has('summary') && s.items.length <= 3 && text.length < 600) return 'summary'
  return 'other'
}

const JUNK_BULLET_RE = /^[\s]*(?:[§¡¶ü¨Ø¤·▪■●◦‣⁃○➢➤►▶✓✔✗❖◆◇♦\-–—*>+]|[qvo]\s(?=[A-Z]))\s*/
// eslint-disable-next-line no-control-regex
const ODD_CHAR_RE = /[\uE000-\uF8FF\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

function cleanBullets(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  const unspace = (t: string) =>
    t.replace(/\b((?:[A-Z] ){3,}[A-Z])\b/g, (m) => {
      count++
      return m.replace(/ /g, '')
    })
  doc.name = unspace(doc.name)
  for (const s of doc.sections) {
    s.heading = unspace(s.heading)
    for (const it of s.items) {
      let t = it.text
      const before = t
      t = t.replace(ODD_CHAR_RE, '')
      if (JUNK_BULLET_RE.test(t) && !it.bullet) {
        t = t.replace(JUNK_BULLET_RE, '')
        it.bullet = true
      } else {
        t = t.replace(JUNK_BULLET_RE, '')
      }
      t = unspace(t)
      // Normalise fancy quotes/dashes that extract as sequences.
      t = t
        .replace(/\s{2,}/g, ' ')
        .replace(/\u00a0/g, ' ')
        .trim()
      if (t !== before) count++
      it.text = t
    }
    // In Experience/Projects, sentences without a marker that follow a role
    // header are almost certainly bullets.
    if (s.kind === 'experience' || s.kind === 'projects' || s.kind === 'volunteering') {
      for (const it of s.items) {
        if (
          !it.bullet &&
          it.text.length > 60 &&
          /[.;!]$/.test(it.text) &&
          !/(19|20)\d{2}/.test(it.text.slice(-12))
        ) {
          it.bullet = true
          count++
        }
      }
    }
  }
  return {
    doc,
    count,
    changed: count ? `Cleaned ${count} line${count > 1 ? 's' : ''}.` : 'No stray symbols found.',
  }
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MONTH_RE = new RegExp(`^${MONTHS}`, 'i')

function monthIndex(name: string): number {
  const m = MONTH_RE.exec(name)?.[0].toLowerCase().slice(0, 3)
  return m
    ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        m,
      )
    : -1
}

/** Rewrite one date token as "Mon YYYY" or leave year-only as is. */
function canonDate(token: string): string {
  const t = token.trim()
  const style = classifyDateToken(t)
  if (!style)
    return /^(present|current|now|ongoing|till date|to date|today)$/i.test(t) ? 'Present' : t
  if (style === 'year-only') return t
  if (style === 'month-year') {
    const [mon, year] = t.replace(/[.,]/g, '').split(/\s+/)
    const i = monthIndex(mon)
    return i >= 0 ? `${MONTH_NAMES[i]} ${year}` : t
  }
  if (style === 'numeric') {
    const [mm, yyyy] = t.split(/[/.-]/)
    const i = Number(mm) - 1
    return i >= 0 && i < 12 ? `${MONTH_NAMES[i]} ${yyyy}` : t
  }
  if (style === 'iso') {
    const [yyyy, mm] = t.split(/[/.-]/)
    const i = Number(mm) - 1
    return i >= 0 && i < 12 ? `${MONTH_NAMES[i]} ${yyyy}` : t
  }
  return t
}

const YEAR = '(?:19|20)\\d{2}'
const TOKEN = `(?:${MONTHS}\\.?,?\\s+${YEAR}|\\d{1,2}[/.-]${YEAR}|${YEAR}[/.-]\\d{1,2}|${YEAR}|present|current|now|ongoing|till date|to date|today)`
const RANGE_RE = new RegExp(`\\b(${TOKEN})\\s*(?:-|–|—|to|until|through|~)\\s*(${TOKEN})\\b`, 'gi')
const SINGLE_RE = new RegExp(
  `\\b(${MONTHS}\\.?,?\\s+${YEAR}|\\d{1,2}[/.-]${YEAR}|${YEAR}[/.-]\\d{1,2})\\b`,
  'gi',
)

function normaliseDates(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  for (const s of doc.sections) {
    for (const it of s.items) {
      const before = it.text
      let t = it.text.replace(
        RANGE_RE,
        (_m, a: string, b: string) => `${canonDate(a)} – ${canonDate(b)}`,
      )
      t = t.replace(SINGLE_RE, (m) => canonDate(m))
      if (t !== before) {
        it.text = t
        count++
      }
    }
  }
  return {
    doc,
    count,
    changed: count
      ? `Rewrote dates on ${count} line${count > 1 ? 's' : ''}.`
      : 'Dates were already consistent.',
  }
}

export const PLACEHOLDER = {
  email: '[add email]',
  phone: '[add phone]',
  linkedin: '[add LinkedIn URL]',
  location: '[City, Country]',
  name: '[Your Name]',
  number: '[add number]',
}

function labelContact(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  if (!doc.name.trim()) {
    doc.name = PLACEHOLDER.name
    count++
  }
  for (const key of ['email', 'phone', 'linkedin', 'location'] as const) {
    if (!doc.contact[key].trim()) {
      doc.contact[key] = PLACEHOLDER[key]
      count++
    }
  }
  // Pull any email/phone/LinkedIn that got stuck inside a section body up
  // into the contact fields.
  for (const s of doc.sections) {
    for (const it of s.items) {
      const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(it.text)?.[0]
      if (email && (doc.contact.email === PLACEHOLDER.email || !doc.contact.email)) {
        doc.contact.email = email
        it.text = it.text
          .replace(email, '')
          .replace(/\s*[·|,]\s*$/, '')
          .trim()
        count++
      }
      const li = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,;)>]+/i.exec(it.text)?.[0]
      if (li && (doc.contact.linkedin === PLACEHOLDER.linkedin || !doc.contact.linkedin)) {
        doc.contact.linkedin = li
        it.text = it.text
          .replace(li, '')
          .replace(/\s*[·|,]\s*$/, '')
          .trim()
        count++
      }
    }
    s.items = s.items.filter((i) => i.text.trim())
  }
  return {
    doc,
    count,
    changed: count
      ? `Contact block set up; ${count} field${count > 1 ? 's' : ''} filled or marked for you to complete.`
      : 'Contact block already complete.',
  }
}

const ORDER: Record<'fresher' | 'experienced', SectionKind[]> = {
  fresher: [
    'summary',
    'education',
    'skills',
    'projects',
    'experience',
    'certifications',
    'awards',
    'publications',
    'volunteering',
    'languages',
    'interests',
    'references',
    'other',
  ],
  experienced: [
    'summary',
    'experience',
    'skills',
    'projects',
    'education',
    'certifications',
    'awards',
    'publications',
    'volunteering',
    'languages',
    'interests',
    'references',
    'other',
  ],
}

function reorderSections(input: ResumeDoc, mode: 'fresher' | 'experienced'): FixResult {
  const doc = cloneDoc(input)
  const rank = (k: SectionKind) => {
    const i = ORDER[mode].indexOf(k)
    return i === -1 ? 99 : i
  }
  const before = doc.sections.map((s) => s.id).join(',')
  doc.sections = [...doc.sections].sort((a, b) => rank(a.kind) - rank(b.kind))
  const changed = doc.sections.map((s) => s.id).join(',') !== before
  return {
    doc,
    count: changed ? 1 : 0,
    changed: changed
      ? `Sections reordered for ${mode === 'fresher' ? 'a fresher' : 'an experienced'} profile.`
      : 'Order was already right.',
  }
}

const PERSONAL_RE =
  /\b(date of birth|d\.?o\.?b\.?|born on|marital status|nationality|citizenship|religion|caste|father'?s name|mother'?s name|spouse|gender|sex|passport|aadhaar|aadhar|pan)\b\s*[-:]?\s*[^|·;\n]{0,40}/gi

function removePersonalDetails(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  for (const s of doc.sections) {
    for (const it of s.items) {
      const before = it.text
      it.text = it.text
        .replace(PERSONAL_RE, '')
        .replace(/\s*[|·;]\s*(?=[|·;]|$)/g, '')
        .replace(/^\s*[|·;]\s*|\s*[|·;]\s*$/g, '')
        .trim()
      if (it.text !== before) count++
    }
    s.items = s.items.filter((i) => i.text.trim())
  }
  doc.sections = doc.sections.filter(
    (s) => s.items.length > 0 || !/personal (details|information|profile)/i.test(s.heading),
  )
  return {
    doc,
    count,
    changed: count
      ? `Removed ${count} personal detail${count > 1 ? 's' : ''}.`
      : 'No personal details found.',
  }
}

function removeFirstPerson(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  for (const s of doc.sections) {
    for (const it of s.items) {
      const before = it.text
      it.text = it.text
        .replace(/^(I am|I'm|I was|I have been|I have|I)\s+(an?\s+)?/i, '')
        .replace(/\b(my|myself)\b\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (it.text !== before) {
        it.text = it.text.charAt(0).toUpperCase() + it.text.slice(1)
        count++
      }
    }
  }
  return {
    doc,
    count,
    changed: count
      ? `Rewrote ${count} line${count > 1 ? 's' : ''} without pronouns.`
      : 'No first-person pronouns found.',
  }
}

import { COMMON_MISSPELLINGS } from '../scoring/wordlists'

function fixSpelling(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  const fixWord = (w: string) => {
    const lower = w.toLowerCase()
    const correct = COMMON_MISSPELLINGS[lower]
    if (!correct) return w
    count++
    if (w === w.toUpperCase()) return correct.toUpperCase()
    if (w[0] === w[0].toUpperCase()) return correct[0].toUpperCase() + correct.slice(1)
    return correct
  }
  const run = (t: string) =>
    t
      .replace(/[A-Za-z][A-Za-z'’-]+/g, fixWord)
      .replace(/\b([A-Za-z]{2,})\s+\1\b/gi, (m, w: string) => {
        if (/^(had had|that that|is is)$/i.test(m)) return m
        count++
        return w
      })
  for (const s of doc.sections) for (const it of s.items) it.text = run(it.text)
  return {
    doc,
    count,
    changed: count
      ? `Fixed ${count} spelling slip${count > 1 ? 's' : ''}.`
      : 'No misspellings from our list.',
  }
}

const BRANDS: [RegExp, string][] = [
  [/\bjavascript\b/gi, 'JavaScript'],
  [/\btypescript\b/gi, 'TypeScript'],
  [/\bgithub\b(?!\.com)/gi, 'GitHub'],
  [/\blinkedin\b(?!\.com)/gi, 'LinkedIn'],
  [/\bpostgresql\b/gi, 'PostgreSQL'],
  [/\bmysql\b/gi, 'MySQL'],
  [/\bnode\.?js\b/gi, 'Node.js'],
  [/\breact\.?js\b/gi, 'React'],
  [/\bpowerpoint\b/gi, 'PowerPoint'],
  [/\bsalesforce\b/gi, 'Salesforce'],
  [/\bwordpress\b/gi, 'WordPress'],
  [/\byoutube\b(?!\.com)/gi, 'YouTube'],
  [/\bios\b/g, 'iOS'],
  [/\bIos\b|\bIOS\b/g, 'iOS'],
  [/\bmacos\b/gi, 'macOS'],
  [/\bsql\b/gi, 'SQL'],
  [/\bhtml\b/gi, 'HTML'],
  [/\bcss\b/gi, 'CSS'],
  [/\bapi\b/gi, 'API'],
  [/\bapis\b/gi, 'APIs'],
  [/\baws\b/gi, 'AWS'],
  [/\bgcp\b/gi, 'GCP'],
  [/\bci\/cd\b/gi, 'CI/CD'],
  [/\bmongodb\b/gi, 'MongoDB'],
  [/\bpower\s?bi\b/gi, 'Power BI'],
]

function fixBrandCasing(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  const run = (t: string) => {
    let out = t
    for (const [re, correct] of BRANDS) {
      out = out.replace(re, (m) => {
        if (m === correct) return m
        count++
        return correct
      })
    }
    return out
  }
  for (const s of doc.sections) for (const it of s.items) it.text = run(it.text)
  return {
    doc,
    count,
    changed: count
      ? `Corrected ${count} product name${count > 1 ? 's' : ''}.`
      : 'Product names already correct.',
  }
}

function dedupeSkills(input: ResumeDoc): FixResult {
  const doc = cloneDoc(input)
  let count = 0
  for (const s of doc.sections) {
    if (s.kind !== 'skills') continue
    const seen = new Set<string>()
    for (const it of s.items) {
      const label = /^([^:]{1,40}):\s*/.exec(it.text)?.[0] ?? ''
      const body = it.text.slice(label.length)
      const parts = body.split(/\s*[,;|•·]\s*/).filter(Boolean)
      const kept: string[] = []
      for (const p of parts) {
        const k = p.toLowerCase().trim()
        if (seen.has(k)) {
          count++
          continue
        }
        seen.add(k)
        kept.push(p.trim())
      }
      it.text = label + kept.join(', ')
    }
    s.items = s.items.filter((i) => i.text.replace(/^[^:]{1,40}:\s*/, '').trim())
  }
  return {
    doc,
    count,
    changed: count
      ? `Removed ${count} duplicate skill${count > 1 ? 's' : ''}.`
      : 'No duplicates found.',
  }
}

const TEMPLATES: Partial<Record<SectionKind, (mode: 'fresher' | 'experienced') => EditableItem[]>> =
  {
    summary: (mode) => [
      {
        id: uid(),
        bullet: false,
        text:
          mode === 'fresher'
            ? '[Degree] graduate with hands-on experience in [top 2–3 skills], seeking a [target role] where I can [what you want to contribute].'
            : '[Job title] with [N] years of experience in [domain]. Known for [headline achievement with a number]. Skilled in [top 3 skills].',
      },
    ],
    skills: () => [
      { id: uid(), bullet: false, text: 'Languages: [add]' },
      { id: uid(), bullet: false, text: 'Tools & Frameworks: [add]' },
      { id: uid(), bullet: false, text: 'Methods & Domain: [add]' },
    ],
    education: () => [
      { id: uid(), bullet: false, text: '[Degree], [Institution] — [Mon YYYY] – [Mon YYYY]' },
    ],
    experience: () => [
      { id: uid(), bullet: false, text: '[Job title], [Company] — [Mon YYYY] – Present' },
      {
        id: uid(),
        bullet: true,
        text: '[Action verb] [what you did] resulting in [add number] [outcome].',
      },
    ],
    projects: () => [
      { id: uid(), bullet: false, text: '[Project name] — [YYYY]' },
      {
        id: uid(),
        bullet: true,
        text: '[Built/Designed] [what] using [tools]; [add number] [users / accuracy / time saved].',
      },
    ],
  }

function addMissingSections(input: ResumeDoc, mode: 'fresher' | 'experienced'): FixResult {
  // First give every unlabelled block its best-guess kind; an existing
  // "Where I've Worked" block *is* the Experience section, and must never be
  // shadowed by an empty template.
  const relabelled = standardiseHeadings(input)
  const doc = relabelled.doc
  const have = new Set(doc.sections.map((s) => s.kind))
  const wanted: SectionKind[] =
    mode === 'fresher'
      ? ['summary', 'education', 'skills', 'projects', 'experience']
      : ['summary', 'experience', 'skills', 'education']
  let count = relabelled.count
  const added: string[] = []
  for (const kind of wanted) {
    if (have.has(kind)) continue
    const items = TEMPLATES[kind]?.(mode) ?? []
    doc.sections.push({ id: uid('s'), kind, heading: SECTION_LABELS[kind], items })
    added.push(SECTION_LABELS[kind])
    count++
  }
  if (count) {
    const r = reorderSections(doc, mode)
    const parts: string[] = []
    if (relabelled.count)
      parts.push(`relabelled ${relabelled.count} heading${relabelled.count > 1 ? 's' : ''}`)
    if (added.length) parts.push(`added ${added.join(', ')} with placeholders for you to fill in`)
    return {
      doc: r.doc,
      count,
      changed: parts.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.',
    }
  }
  return { doc, count: 0, changed: 'All core sections present.' }
}

// ---------------------------------------------------------------------------
// Weak verbs: suggestions the user picks from. No rewriting without consent.

export interface VerbSuggestion {
  itemId: string
  sectionId: string
  original: string
  /** The weak opener we matched. */
  weak: string
  /** Candidate rewrites; each is the original with only the opener changed. */
  options: string[]
}

const VERB_ALTERNATIVES: Record<string, string[]> = {
  'responsible for': ['Managed', 'Owned', 'Led', 'Delivered', 'Oversaw'],
  'responsibilities included': ['Managed', 'Owned', 'Led', 'Delivered'],
  'duties included': ['Managed', 'Handled', 'Delivered', 'Executed'],
  'worked on': ['Built', 'Developed', 'Delivered', 'Engineered', 'Designed'],
  'worked with': ['Partnered with', 'Collaborated with', 'Coordinated with'],
  'worked as': ['Served as', 'Acted as'],
  worked: ['Built', 'Developed', 'Delivered', 'Collaborated'],
  'helped with': ['Supported', 'Contributed to', 'Drove', 'Enabled'],
  'helped to': ['Enabled', 'Drove', 'Accelerated', 'Supported'],
  helped: ['Supported', 'Enabled', 'Drove', 'Contributed to'],
  'assisted with': ['Supported', 'Coordinated', 'Facilitated', 'Contributed to'],
  'assisted in': ['Supported', 'Contributed to', 'Co-led', 'Facilitated'],
  assisted: ['Supported', 'Facilitated', 'Coordinated'],
  'involved in': ['Contributed to', 'Drove', 'Co-led', 'Participated in'],
  'participated in': ['Contributed to', 'Co-led', 'Joined', 'Represented the team in'],
  'tasked with': ['Owned', 'Led', 'Delivered'],
  'in charge of': ['Led', 'Managed', 'Owned', 'Directed'],
  'was responsible for': ['Managed', 'Owned', 'Led', 'Delivered'],
  'was involved in': ['Contributed to', 'Drove', 'Co-led'],
  handled: ['Managed', 'Resolved', 'Processed', 'Coordinated'],
  did: ['Completed', 'Performed', 'Delivered', 'Executed'],
  made: ['Created', 'Built', 'Produced', 'Designed'],
  got: ['Achieved', 'Secured', 'Earned', 'Obtained'],
  used: ['Applied', 'Leveraged', 'Utilised', 'Deployed'],
}

/** Find bullets with weak openers and propose stronger verbs. */
export function suggestVerbs(doc: ResumeDoc): VerbSuggestion[] {
  const out: VerbSuggestion[] = []
  const phrases = Object.keys(VERB_ALTERNATIVES).sort((a, b) => b.length - a.length)
  for (const s of doc.sections) {
    if (
      s.kind !== 'experience' &&
      s.kind !== 'projects' &&
      s.kind !== 'volunteering' &&
      s.kind !== 'other'
    )
      continue
    for (const it of s.items) {
      const text = it.text.trim()
      const lower = text.toLowerCase()
      const phrase = phrases.find((p) => lower.startsWith(p + ' ') || lower.startsWith(p + ':'))
      if (phrase) {
        const rest = text.slice(phrase.length).replace(/^[\s:]+/, '')
        out.push({
          itemId: it.id,
          sectionId: s.id,
          original: text,
          weak: text.slice(0, phrase.length),
          options: VERB_ALTERNATIVES[phrase].map((v) => `${v} ${lowerFirstIfGerund(rest)}`),
        })
        continue
      }
      const first = /^[A-Za-z][A-Za-z'’-]*/.exec(text)?.[0].toLowerCase()
      if (
        first &&
        WEAK_OPENERS.has(first) &&
        !ACTION_VERBS.has(first) &&
        !VERB_ALTERNATIVES[first]
      ) {
        const rest = text.slice(first.length).trim()
        out.push({
          itemId: it.id,
          sectionId: s.id,
          original: text,
          weak: text.slice(0, first.length),
          options: ['Led', 'Delivered', 'Managed', 'Built'].map((v) => `${v} ${rest}`),
        })
      }
    }
  }
  return out
}

/** "Responsible for Managing X" → "Managed managing X" reads badly; drop a leading gerund. */
function lowerFirstIfGerund(rest: string): string {
  const m = /^([A-Za-z]+ing)\s+(.*)$/.exec(rest)
  if (m && m[1].length > 5) return m[2]
  return rest.charAt(0).toLowerCase() + rest.slice(1)
}
