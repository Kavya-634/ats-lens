import type { Analysis } from '../types'
import type { CheckResult, Mode } from './types'
import {
  DATE_RANGE_RE,
  DATE_TOKEN_RE,
  MONTHS,
  classifyDateToken,
  clamp,
  sample,
  type DateStyle,
} from './text'

const STYLE_LABEL: Record<DateStyle, string> = {
  'month-year': 'Month Year (Mar 2022)',
  numeric: 'MM/YYYY (03/2022)',
  'year-only': 'Year only (2022)',
  iso: 'YYYY-MM (2022-03)',
}

/**
 * Dates: every role should have a range, ranges should share a format, and
 * nothing should be in the future or run backwards.
 */
export function checkDates(analysis: Analysis, mode: Mode): CheckResult {
  const issues: CheckResult['issues'] = []
  let score = 100

  let expSections = analysis.sections.filter(
    (s) => s.kind === 'experience' || s.kind === 'volunteering',
  )
  // If no Experience heading was recognised, the work history is probably
  // sitting in an unlabelled block. Judge the dates there rather than
  // pretending the resume has none.
  if (!expSections.length) {
    expSections = analysis.sections.filter((s) => s.kind === 'other' || s.kind === 'contact')
  }
  const eduSections = analysis.sections.filter((s) => s.kind === 'education')
  const dated = [...expSections, ...eduSections]
  const text = dated.map((s) => s.lines.join('\n')).join('\n')

  if (!dated.length) {
    return {
      score: mode === 'fresher' ? 50 : 30,
      summary: 'No Experience or Education section to check dates in.',
      issues: [],
    }
  }

  const ranges = [...text.matchAll(new RegExp(DATE_RANGE_RE.source, 'gi'))]
  const tokens = [...text.matchAll(new RegExp(DATE_TOKEN_RE.source, 'gi'))].map((m) => m[0])

  // Estimate the number of entries: lines that look like a role/company header
  // (short, title-case-ish, no bullet) in experience sections.
  const entryEstimate = estimateEntries(expSections.flatMap((s) => s.lines))

  if (tokens.length === 0) {
    score -= 50
    issues.push({
      id: 'no-dates',
      severity: 'high',
      title: 'No dates found in Experience or Education',
      detail: 'Not a single month, year or “Present” appears in those sections.',
      why: 'ATS products calculate total years of experience and recency from dates. No dates means zero computed experience, which fails most minimum-experience filters.',
      fix: 'Add a start and end date to every role and your graduation year, e.g. “Mar 2022 – Present”.',
    })
    return { score: clamp(score), summary: 'No dates to evaluate.', issues }
  }

  if (expSections.length && ranges.length === 0) {
    score -= 25
    issues.push({
      id: 'no-ranges',
      severity: 'high',
      title: 'Roles have single dates rather than start–end ranges',
      detail: `${tokens.length} date${tokens.length > 1 ? 's' : ''} found but none joined into a “start – end” range.`,
      why: 'Experience length is computed from ranges. A lone year cannot tell the parser whether you spent one month or five years in a role.',
      fix: 'Write both ends for every role: “Jun 2019 – Feb 2022”. Use “Present” for a current job.',
      evidence: sample(tokens),
    })
  } else if (expSections.length && entryEstimate > ranges.length + 1) {
    score -= 15
    issues.push({
      id: 'missing-ranges',
      severity: 'medium',
      uncertain: true,
      title: 'Some roles may be missing dates',
      detail: `About ${entryEstimate} role entries were detected but only ${ranges.length} date range${ranges.length === 1 ? '' : 's'}.`,
      why: 'Undated roles are ignored when computing experience, and recruiters read a missing date as a gap you are hiding.',
      fix: 'Check that every role and degree has its own date range on the same line as the title or company.',
    })
  }

  // Format consistency.
  // Judge consistency on the roles themselves: tokens that are part of a
  // range in Experience. Year-only dates (common for degrees and projects)
  // are compatible with any style, so they are ignored here.
  const expText = expSections.map((s) => s.lines.join('\n')).join('\n')
  const styles = new Map<DateStyle, number>()
  for (const m of expText.matchAll(new RegExp(DATE_RANGE_RE.source, 'gi'))) {
    for (const part of [m[1], m[2]]) {
      const s = classifyDateToken(part)
      if (s && s !== 'year-only') styles.set(s, (styles.get(s) ?? 0) + 1)
    }
  }
  if (styles.size > 1) {
    const sorted = [...styles.entries()].sort((a, b) => b[1] - a[1])
    const minority = sorted.slice(1).reduce((n, [, c]) => n + c, 0)
    if (minority >= 1) {
      score -= 12
      issues.push({
        id: 'mixed-formats',
        severity: 'medium',
        title: 'Dates are written in more than one format',
        detail: sorted.map(([s, c]) => `${STYLE_LABEL[s]} ×${c}`).join(', '),
        why: 'Parsers normalise dates with pattern rules. Mixed formats raise the chance one of them is read wrongly, e.g. “05/2021” taken as May 2021 by one system and as an invalid date by another.',
        fix: `Pick one style and use it everywhere. “${STYLE_LABEL[sorted[0][0]].split(' (')[0]}” is the safest and most widely parsed.`,
      })
    }
  }

  // Month abbreviations with/without period, "Sept".
  const monthForms = new Set(
    (text.match(new RegExp(`\\b${MONTHS}\\b\\.?`, 'gi')) ?? []).map((m) => m.toLowerCase()),
  )
  const abbreviated = [...monthForms].filter((m) => m.replace('.', '').length <= 4).length
  const full = [...monthForms].filter((m) => m.replace('.', '').length > 4).length
  if (abbreviated && full) {
    score -= 4
    issues.push({
      id: 'month-forms',
      severity: 'low',
      title: 'Months are both abbreviated and spelled out',
      detail: `e.g. ${[...monthForms].slice(0, 4).join(', ')}.`,
      why: 'Harmless to most parsers, but it signals inconsistency and “Sept” in particular is not recognised by every system.',
      fix: 'Use three-letter months everywhere (Jan, Feb, Mar… Sep) with no periods.',
    })
  }

  // Sanity: future dates and reversed ranges.
  const nowYear = new Date().getFullYear()
  const futureYears = tokens
    .map((t) => Number(/(19|20)\d{2}/.exec(t)?.[0]))
    .filter((y) => y && y > nowYear + 1)
  if (futureYears.length) {
    score -= 10
    issues.push({
      id: 'future-dates',
      severity: 'medium',
      title: 'A date is in the future',
      detail: `Year${futureYears.length > 1 ? 's' : ''} found: ${[...new Set(futureYears)].join(', ')}.`,
      why: 'Future dates are usually typos and some parsers reject the whole entry as invalid.',
      fix:
        mode === 'fresher'
          ? 'If this is an expected graduation, write “Expected May 2027” so it is read as intended.'
          : 'Correct the typo.',
    })
  }
  const reversed = ranges.filter((m) => {
    const a = Number(/(19|20)\d{2}/.exec(m[1])?.[0])
    const b = Number(/(19|20)\d{2}/.exec(m[2])?.[0])
    return a && b && b < a
  })
  if (reversed.length) {
    score -= 10
    issues.push({
      id: 'reversed-range',
      severity: 'medium',
      title: 'A date range runs backwards',
      detail: reversed.map((m) => m[0]).join('; '),
      why: 'End-before-start ranges compute as negative experience and are commonly discarded.',
      fix: 'Swap the dates so the earlier one comes first.',
    })
  }

  // Chronological order of experience entries: expect newest first.
  const startYears = ranges
    .filter((m) => expSections.some((s) => s.lines.join('\n').includes(m[0])))
    .map((m) => Number(/(19|20)\d{2}/.exec(m[1])?.[0]))
    .filter(Boolean)
  if (startYears.length >= 2) {
    const ascending = startYears.every((y, i) => i === 0 || y >= startYears[i - 1])
    const descending = startYears.every((y, i) => i === 0 || y <= startYears[i - 1])
    if (ascending && !descending) {
      score -= 6
      issues.push({
        id: 'oldest-first',
        severity: 'low',
        title: 'Experience is listed oldest-first',
        detail: `Start years in order: ${startYears.join(' → ')}.`,
        why: 'Reverse-chronological is the format parsers and recruiters assume. Oldest-first can make your most recent role look like your first.',
        fix: 'Reorder roles so the current or most recent one is at the top.',
      })
    } else if (!ascending && !descending) {
      score -= 8
      issues.push({
        id: 'unordered',
        severity: 'low',
        uncertain: true,
        title: 'Roles may not be in chronological order',
        detail: `Start years in order: ${startYears.join(' → ')}.`,
        why: 'Out-of-order roles confuse gap and tenure calculations.',
        fix: 'Sort roles newest-first. If you group by type (e.g. “Freelance”), keep each group in order.',
      })
    }
  }

  const summary =
    issues.length === 0
      ? `${ranges.length} date range${ranges.length === 1 ? '' : 's'} found, all in one format.`
      : `${ranges.length} range${ranges.length === 1 ? '' : 's'}, ${tokens.length} dates; ${issues.length} inconsistenc${issues.length > 1 ? 'ies' : 'y'}.`
  return { score: clamp(score), summary, issues }
}

function estimateEntries(lines: string[]): number {
  let n = 0
  for (const line of lines) {
    const t = line.trim()
    if (!t || /^[•·▪■●◦\-–—*]/.test(t)) continue
    if (t.length > 70) continue
    // Role headers usually contain a date range or a company/title pattern.
    if (new RegExp(DATE_RANGE_RE.source, 'i').test(t)) n++
    else if (
      /\b(engineer|developer|manager|analyst|intern|designer|consultant|associate|lead|director|specialist|coordinator|assistant|officer|executive|head|architect|scientist|teacher|nurse|accountant)\b/i.test(
        t,
      ) &&
      !/\.$/.test(t)
    )
      n++
  }
  return n
}
