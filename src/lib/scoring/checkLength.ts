import type { Analysis } from '../types'
import type { CheckResult, Mode } from './types'
import {
  BULLET_MARK_RE,
  DATE_LINE_RE,
  bulletLines,
  clamp,
  sample,
  stripBullet,
  truncate,
} from './text'

/** Length and format: page count, word count, bullets, sentence length. */
export function checkLength(analysis: Analysis, mode: Mode): CheckResult {
  const issues: CheckResult['issues'] = []
  let score = 100
  const { words } = analysis.stats
  const pages = analysis.pages?.length ?? estimatePages(words)

  // Page count targets differ by mode.
  const maxPages = mode === 'fresher' ? 1 : 2
  if (pages > maxPages) {
    const over = pages - maxPages
    score -= Math.min(30, 12 + over * 8)
    issues.push({
      id: 'too-long',
      severity: over >= 2 ? 'high' : 'medium',
      title: `${pages} pages is longer than recruiters expect`,
      detail:
        mode === 'fresher'
          ? `Fresher resumes are expected to fit on one page; this one runs to ${pages}.`
          : `Two pages is the norm for experienced candidates; this one runs to ${pages}.`,
      why: 'Some ATS products truncate after a fixed number of pages or characters, and recruiters rarely read past page two. Important content at the end may never be seen.',
      fix:
        mode === 'fresher'
          ? 'Cut to one page: keep the 3–4 strongest projects, trim coursework lists, and drop school-level details.'
          : 'Cut to two pages: summarise roles older than 10 years in one line each and remove outdated tools.',
    })
  }

  // Word count.
  const [minWords, maxWords] = mode === 'fresher' ? [220, 650] : [320, 1100]
  if (words > 0 && words < minWords) {
    const severe = words < minWords * 0.6
    score -= severe ? 35 : 12
    issues.push({
      id: 'too-short',
      severity: severe ? 'high' : 'low',
      title: `Only ${words} words of content`,
      detail: severe
        ? `A ${mode} resume usually carries ${minWords}–${maxWords} words; this one has far less to match on.`
        : `A ${mode} resume usually carries ${minWords}–${maxWords} words. This one is on the lean side, which is fine if every line earns its place.`,
      why: 'Keyword matching is statistical. A very short resume has few chances to match the terms in a job description, so it ranks low even when you are qualified.',
      fix:
        mode === 'fresher'
          ? 'Add detail to projects (tools, what you built, outcome) and list relevant coursework and certifications.'
          : 'Add 2–4 achievement bullets per recent role, each naming the tools and the measurable result.',
    })
  } else if (words > maxWords) {
    score -= 12
    issues.push({
      id: 'wordy',
      severity: 'low',
      title: `${words} words is on the heavy side`,
      detail: `Most ${mode} resumes land between ${minWords} and ${maxWords} words.`,
      why: 'Dense resumes dilute keyword weight and recruiters skim; your strongest points get lost.',
      fix: 'Cut bullets that repeat a skill already shown, and merge roles older than ten years.',
    })
  }

  // Bullets vs paragraphs in experience.
  const expLines = analysis.sections
    .filter((s) => s.kind === 'experience' || s.kind === 'projects')
    .flatMap((s) => s.lines)
    .filter((l) => l.trim())
  // Bullet glyphs in text, plus list structure the parser could see even when
  // the glyph itself was lost (indented PDF lines, Word list paragraphs).
  const bulleted =
    expLines.filter((l) => BULLET_MARK_RE.test(l)).length + analysis.layout.listLikeLines
  const longParas = expLines.filter((l) => stripBullet(l).length > 260)
  if (expLines.length >= 6 && bulleted === 0) {
    score -= 15
    issues.push({
      id: 'no-bullets',
      severity: 'medium',
      uncertain: analysis.fileType === 'pdf',
      title: 'Experience appears to be written as paragraphs',
      detail: `No bullet markers were found across ${expLines.length} lines of experience.`,
      why: 'Parsers split achievements on bullets. A paragraph becomes one long “responsibility” field, and recruiters skip walls of text.',
      fix: 'Break each role into 3–5 bullets, one achievement per bullet, starting with a verb.',
    })
  }
  if (longParas.length) {
    score -= Math.min(12, longParas.length * 4)
    issues.push({
      id: 'long-bullets',
      severity: 'low',
      title: `${longParas.length} very long bullet${longParas.length > 1 ? 's' : ''}`,
      detail: 'Some bullets run past 260 characters (roughly three lines).',
      why: 'Long bullets bury the result. Recruiters read the first line of each bullet and move on.',
      fix: 'Keep each bullet to one or two lines: action, what, measurable result.',
      evidence: sample(longParas.map((l) => truncate(stripBullet(l), 100))),
    })
  }

  // Too many bullets in a single role suggests a list of duties.
  const bullets = bulletLines(analysis)
  const roles = roleCount(analysis)
  if (bullets.length > 0 && expLines.length > 0 && roles !== null) {
    const perRole = bullets.length / roles
    if (perRole > 8) {
      score -= 6
      issues.push({
        id: 'bullet-overload',
        severity: 'low',
        uncertain: true,
        title: 'Roles average more than eight bullets each',
        detail: `${bullets.length} bullets across roughly ${roles} role${roles === 1 ? '' : 's'}.`,
        why: 'Long bullet lists read as job descriptions rather than achievements, and dilute the keywords that matter.',
        fix: 'Keep 3–6 bullets per role, prioritising recent roles and measurable wins.',
      })
    }
  }

  // Personal details that should not be there.
  const personal = findPersonalDetails(analysis.rawText)
  if (personal.length) {
    score -= 8
    issues.push({
      id: 'personal-details',
      severity: 'low',
      title: 'Personal details that most employers don’t want',
      detail: personal.join(', '),
      why: 'Date of birth, marital status, nationality or religion are not used for ranking and can trigger compliance rules that discard the resume in some regions (US, UK, EU).',
      fix: 'Remove them unless the specific market or role explicitly asks.',
    })
  }

  const summary =
    issues.length === 0
      ? `${pages} page${pages === 1 ? '' : 's'}, ${words} words, ${bullets.length} achievement bullets. Right in the expected range.`
      : `${pages} page${pages === 1 ? '' : 's'}, ${words} words; ${issues.length} format note${issues.length > 1 ? 's' : ''}.`
  return { score: clamp(score), summary, issues }
}

function estimatePages(words: number): number {
  return Math.max(1, Math.ceil(words / 550))
}

/** Number of dated role entries, or null when we can't tell. */
function roleCount(analysis: Analysis): number | null {
  const lines = analysis.sections.filter((s) => s.kind === 'experience').flatMap((s) => s.lines)
  // A role header is a short, non-bullet line that carries a date.
  const n = lines.filter((l) => {
    const t = stripBullet(l)
    return t.length <= 90 && !BULLET_MARK_RE.test(l) && DATE_LINE_RE.test(t)
  }).length
  return n === 0 ? null : n
}

function findPersonalDetails(text: string): string[] {
  const out: string[] = []
  if (/\b(date of birth|d\.?o\.?b\.?|born on)\b/i.test(text)) out.push('date of birth')
  if (
    /\b(marital status|married|unmarried|single|divorced)\b/i.test(text) &&
    /\bmarital|status\b/i.test(text)
  )
    out.push('marital status')
  if (/\b(nationality|citizenship)\s*[-:]/i.test(text)) out.push('nationality')
  if (/\b(religion|caste)\s*[-:]/i.test(text)) out.push('religion/caste')
  if (/\b(father'?s name|mother'?s name|spouse)\s*[-:]/i.test(text))
    out.push("parent's/spouse name")
  if (/\b(gender|sex)\s*[-:]\s*(male|female|m|f)\b/i.test(text)) out.push('gender')
  if (/\b(passport|aadhaar|aadhar|pan|ssn|social security)\s*(no|number|#|:)/i.test(text))
    out.push('ID numbers')
  return out
}
