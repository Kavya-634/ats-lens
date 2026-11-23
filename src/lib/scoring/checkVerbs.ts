import type { Analysis } from '../types'
import type { CheckResult } from './types'
import { ACTION_VERBS, BUZZWORDS, WEAK_OPENERS } from './wordlists'
import { bulletLines, clamp, firstWord, pct, sample, truncate } from './text'

/** Strong action verbs at the start of bullets; weak openers; buzzwords. */
export function checkVerbs(analysis: Analysis): CheckResult {
  const issues: CheckResult['issues'] = []
  const bullets = bulletLines(analysis)

  if (bullets.length === 0) {
    return {
      score: 40,
      summary: 'No experience or project bullets to evaluate.',
      issues: [
        {
          id: 'no-bullets-for-verbs',
          severity: 'medium',
          title: 'No achievement bullets found',
          detail:
            'There are no Experience or Projects lines long enough to be achievement statements.',
          why: 'Action-verb bullets are the main place parsers and recruiters look for skills in context.',
          fix: 'Under each role or project, add 3–5 bullets that begin with a verb (Built, Led, Reduced…).',
        },
      ],
    }
  }

  let strong = 0
  const weak: string[] = []
  const neither: string[] = []
  const openers = new Map<string, number>()

  for (const b of bullets) {
    const w = firstWord(b)
    if (!w) continue
    openers.set(w, (openers.get(w) ?? 0) + 1)
    if (ACTION_VERBS.has(w)) strong++
    else if (WEAK_OPENERS.has(w)) weak.push(b)
    else neither.push(b)
  }

  const ratio = pct(strong, bullets.length)
  let score = clamp(ratio * 100 + 15)

  if (weak.length) {
    const share = pct(weak.length, bullets.length)
    score -= Math.min(25, share * 60)
    issues.push({
      id: 'weak-openers',
      severity: share > 0.3 ? 'high' : share > 0.1 ? 'medium' : 'low',
      title: `${weak.length} bullet${weak.length > 1 ? 's start' : ' starts'} with a weak phrase`,
      detail:
        'Openers like “Responsible for”, “Worked on” and “Helped with” describe a duty, not a result.',
      why: 'Many ranking models weight the first words of each bullet. Verbs like “Led” and “Reduced” score; “Responsible for” is treated as filler, and recruiters read it as a job description copied from a posting.',
      fix: 'Rewrite as “[Verb] [what] [measurable result]”: “Responsible for reporting” → “Automated weekly reporting, saving 6 hours per week.”',
      evidence: sample(weak.map((b) => truncate(b, 100))),
    })
  }

  if (ratio < 0.5 && neither.length) {
    issues.push({
      id: 'few-action-verbs',
      severity: ratio < 0.25 ? 'high' : 'medium',
      title: `Only ${Math.round(ratio * 100)}% of bullets open with an action verb`,
      detail: `${strong} of ${bullets.length} bullets start with a recognised action verb.`,
      why: 'Parsers look for verb-led statements to extract skills in context. Noun-led lines (“Python scripts for…”) are often filed as skills rather than achievements.',
      fix: 'Start every bullet with a past-tense verb for previous roles (Built, Designed, Cut) and present tense for your current one (Lead, Own, Manage).',
      evidence: sample(neither.map((b) => truncate(b, 100))),
    })
  }

  // Repetition of the same opener.
  const repeated = [...openers.entries()].filter(([, n]) => n >= 4 && bullets.length >= 8)
  if (repeated.length) {
    score -= 6
    issues.push({
      id: 'repeated-verbs',
      severity: 'low',
      title: 'The same verb opens several bullets',
      detail: repeated.map(([w, n]) => `“${capitalise(w)}” ×${n}`).join(', '),
      why: 'Variety signals range. Repeating one verb reads as a list of similar tasks and wastes chances to match different skill keywords.',
      fix: 'Swap repeats for more specific verbs: Managed → Coordinated, Oversaw, Directed, Budgeted.',
    })
  }

  // Buzzwords anywhere in the text.
  const lower = analysis.rawText.toLowerCase()
  const buzz = BUZZWORDS.filter((b) => lower.includes(b))
  if (buzz.length) {
    score -= Math.min(10, buzz.length * 3)
    issues.push({
      id: 'buzzwords',
      severity: 'low',
      title: `${buzz.length} buzzword${buzz.length > 1 ? 's' : ''} that add no information`,
      detail: buzz.map((b) => `“${b}”`).join(', '),
      why: 'Phrases like “team player” and “results-driven” appear on almost every resume, so they carry zero signal in ranking and recruiters tune them out.',
      fix: 'Replace each with evidence: instead of “detail-oriented”, write the bullet where attention to detail caught a costly bug.',
    })
  }

  // First-person pronouns.
  const pronouns = (analysis.rawText.match(/\b(I|me|my|myself)\b/g) ?? []).length
  if (pronouns >= 3) {
    score -= 5
    issues.push({
      id: 'first-person',
      severity: 'low',
      title: 'First-person pronouns are used',
      detail: `“I”, “me” or “my” appear ${pronouns} times.`,
      why: 'Convention is implied first person (“Led a team” not “I led a team”). Pronouns waste the high-value first word of each bullet.',
      fix: 'Delete the pronoun and start with the verb.',
    })
  }

  const summary =
    strong === bullets.length
      ? `All ${bullets.length} bullets open with a strong action verb.`
      : `${strong} of ${bullets.length} bullets open with a strong action verb.`
  return { score: clamp(score), summary, issues }
}

function capitalise(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}
