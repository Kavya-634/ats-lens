import type { Analysis } from '../types'
import { checkContact } from './checkContact'
import { checkDates } from './checkDates'
import { checkHeadings } from './checkHeadings'
import { checkKeywords } from './checkKeywords'
import { checkLength } from './checkLength'
import { checkParseability } from './checkParseability'
import { checkQuantified } from './checkQuantified'
import { checkSpelling } from './checkSpelling'
import { checkVerbs } from './checkVerbs'
import {
  CATEGORY_META,
  type CategoryId,
  type CategoryScore,
  type CheckResult,
  type Issue,
  type Mode,
  type ScoreReport,
} from './types'

export * from './types'

const SEVERITY_WEIGHT = { high: 1, medium: 0.6, low: 0.3 } as const

/**
 * Score a parsed resume. Pure and synchronous, so switching modes in the UI
 * is instant and the result is easy to unit test.
 */
export function scoreResume(analysis: Analysis, mode: Mode): ScoreReport {
  const results: Record<CategoryId, CheckResult> = {
    parseability: checkParseability(analysis),
    headings: checkHeadings(analysis, mode),
    contact: checkContact(analysis),
    dates: checkDates(analysis, mode),
    length: checkLength(analysis, mode),
    verbs: checkVerbs(analysis),
    quantified: checkQuantified(analysis, mode),
    spelling: checkSpelling(analysis),
    keywords: checkKeywords(analysis, mode),
  }

  // Image-only files: nothing but parseability can be judged. Mark the other
  // categories as not assessed instead of reporting hollow 100s and 0s.
  const imageOnly = analysis.stats.words === 0

  const categories: CategoryScore[] = (Object.keys(CATEGORY_META) as CategoryId[]).map((id) => {
    const meta = CATEGORY_META[id]
    const r = results[id]
    const weight = meta.weights[mode]
    if (imageOnly && id !== 'parseability') {
      return {
        id,
        label: meta.label,
        score: 0,
        weight,
        summary: 'Not assessed: there is no text to check.',
        issues: [],
        notAssessed: true,
      }
    }
    const lost = 100 - r.score
    // Distribute the category's lost points across its issues by severity so
    // each issue has an "impact" in overall-score points.
    const totalSev = r.issues.reduce((n, i) => n + SEVERITY_WEIGHT[i.severity], 0) || 1
    const issues: Issue[] = r.issues.map((i) => ({
      ...i,
      category: id,
      impact: round1((lost * weight * SEVERITY_WEIGHT[i.severity]) / totalSev),
    }))
    return { id, label: meta.label, score: r.score, weight, summary: r.summary, issues }
  })

  let overall = imageOnly
    ? 0
    : Math.round(categories.reduce((sum, c) => sum + c.score * c.weight, 0))

  // Gates: a weighted average can hide a single fatal problem. If the ATS
  // cannot reach the candidate or cannot find a single standard section, the
  // resume is at real risk regardless of how clean the rest is, so cap it.
  const byId = Object.fromEntries(categories.map((c) => [c.id, c])) as Record<
    CategoryId,
    CategoryScore
  >
  const noContact = !analysis.contact.emails.length && !analysis.contact.phones.length
  const noHeadings = byId.headings.issues.some((i) => i.id === 'no-headings')
  const gates: string[] = []
  if (!imageOnly && noContact) {
    overall = Math.min(overall, 45)
    gates.push('Capped at 45: no email or phone number could be read.')
  }
  if (!imageOnly && noHeadings) {
    overall = Math.min(overall, 55)
    gates.push('Capped at 55: no standard section headings were recognised.')
  }

  const allIssues = categories.flatMap((c) => c.issues)
  // For an image-only file every other issue is a symptom of the same cause,
  // so the only honest "fix" is the one that restores the text.
  const topFixes = imageOnly
    ? allIssues.filter((i) => i.id === 'no-text')
    : [...allIssues]
        .sort((a, b) => {
          // Certain issues before uncertain ones at equal impact; then by severity.
          if (b.impact !== a.impact) return b.impact - a.impact
          if (Boolean(a.uncertain) !== Boolean(b.uncertain)) return a.uncertain ? 1 : -1
          return SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
        })
        .slice(0, 5)

  const notes: string[] = []
  notes.push(...gates)
  if (analysis.layout.fonts.length) {
    notes.push(
      `Fonts: ${analysis.layout.fonts.slice(0, 4).join(', ')}${analysis.layout.fonts.length > 4 ? '…' : ''}`,
    )
  }
  if (analysis.pages)
    notes.push(`${analysis.pages.length} page${analysis.pages.length === 1 ? '' : 's'}`)
  notes.push(`${analysis.stats.words} words`)

  return { mode, overall, categories, topFixes, notes }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Human label for a score band. */
export function scoreBand(score: number): { label: string; tone: 'good' | 'ok' | 'poor' } {
  if (score >= 80) return { label: 'Strong', tone: 'good' }
  if (score >= 60) return { label: 'Decent, with fixable gaps', tone: 'ok' }
  if (score >= 40) return { label: 'Needs work', tone: 'poor' }
  return { label: 'At risk of being filtered out', tone: 'poor' }
}
