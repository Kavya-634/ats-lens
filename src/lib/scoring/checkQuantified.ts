import type { Analysis } from '../types'
import type { CheckResult, Mode } from './types'
import { bulletLines, clamp, pct, sample, truncate } from './text'

/**
 * Numbers that prove impact: percentages, currency, multipliers, counts
 * with a unit. Years on their own don't count.
 */
const QUANT_RE =
  /(\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*(?:percent|pct)\b|[$€£₹]\s?\d[\d,.]*\s*(?:k|m|b|mn|bn|million|billion|crore|lakh|cr|l)?\b|\b\d[\d,.]*\s*(?:k|m|b|mn|bn|million|billion|crore|lakh|cr|l)\b|\b\d+(?:\.\d+)?x\b|\b\d[\d,]*\+?\s*(?:users|customers|clients|people|employees|engineers|members|students|accounts|transactions|requests|events|records|orders|leads|downloads|visitors|views|followers|stars|tickets|bugs|hours|hrs|days|weeks|months|minutes|mins|seconds|ms|teams|projects|stores|locations|countries|markets|servers|clinics|reports|pages|lines|tests|devices|units|pieces|sqft|tonnes|tons|kg|kb|mb|gb|tb)\b|\b(?:from|to)\s+\d[\d,.]*\s*(?:to|→|->)\s*\d[\d,.]*|\b(?:doubled|tripled|halved|quadrupled)\b|\b(?:top|rank(?:ed)?)\s+\d+\b|\b\d+(?:st|nd|rd|th)\s+(?:place|rank|position|percentile)\b|\bp\d{2}\b)/i

export function checkQuantified(analysis: Analysis, mode: Mode): CheckResult {
  const issues: CheckResult['issues'] = []
  const bullets = bulletLines(analysis)

  if (bullets.length === 0) {
    return {
      score: mode === 'fresher' ? 50 : 35,
      summary: 'No bullets to look for numbers in.',
      issues: [
        {
          id: 'no-bullets-for-numbers',
          severity: mode === 'fresher' ? 'medium' : 'high',
          title: 'No achievement bullets to quantify',
          detail: 'Experience and Projects contain no statements long enough to carry a result.',
          why: 'Numbers are the fastest way for a recruiter to see scale and for ranking models to distinguish achievements from duties.',
          fix: 'Add bullets with a measurable outcome: users served, time saved, revenue, accuracy, rank in a competition.',
        },
      ],
    }
  }

  const quantified = bullets.filter((b) => QUANT_RE.test(b))
  const unquantified = bullets.filter((b) => !QUANT_RE.test(b))
  const ratio = pct(quantified.length, bullets.length)

  // Target differs by mode: freshers have fewer numbers available.
  const target = mode === 'fresher' ? 0.35 : 0.55
  let score = clamp(40 + (ratio / target) * 60)

  if (ratio < target) {
    const gap = Math.max(0, Math.ceil(bullets.length * target) - quantified.length)
    issues.push({
      id: 'few-numbers',
      severity: ratio < target / 2 ? 'high' : 'medium',
      title: `${quantified.length} of ${bullets.length} bullets contain a number`,
      detail: `${Math.round(ratio * 100)}% of achievement bullets are quantified. A good ${mode} resume has at least ${Math.round(target * 100)}%.`,
      why: 'Recruiters scan for digits; they stand out visually and signal scale. Ranking features in several ATS products also count numeric tokens in experience sections as an impact proxy.',
      fix:
        mode === 'fresher'
          ? `Add a number to about ${gap} more bullet${gap === 1 ? '' : 's'}. Freshers can quantify team size, dataset size, accuracy, marks, rank, users of a project, hours saved for a club, or event attendance.`
          : `Add a number to about ${gap} more bullet${gap === 1 ? '' : 's'}: revenue or cost impact, % improvement, time saved, team size, scale (users, requests, records), or before→after.`,
      evidence: sample(unquantified.map((b) => truncate(b, 100))),
    })
  }

  // Vague intensifiers without numbers.
  const vague = bullets.filter(
    (b) =>
      !QUANT_RE.test(b) &&
      /\b(significantly|substantially|greatly|dramatically|many|numerous|various|several|multiple|a lot|huge|massive|improved efficiency|increased productivity)\b/i.test(
        b,
      ),
  )
  if (vague.length) {
    score -= Math.min(12, vague.length * 3)
    issues.push({
      id: 'vague-claims',
      severity: 'low',
      title: `${vague.length} bullet${vague.length > 1 ? 's use' : ' uses'} vague words instead of numbers`,
      detail:
        '“Significantly improved”, “various projects”, “many clients” — each hides a number you probably know.',
      why: 'Unquantified intensifiers are the most common sign of a weak bullet; they add length without evidence.',
      fix: 'Replace the adverb with the figure: “significantly reduced load time” → “reduced load time from 4.1 s to 0.9 s”.',
      evidence: sample(vague.map((b) => truncate(b, 100))),
    })
  }

  const summary =
    ratio >= target
      ? `${quantified.length} of ${bullets.length} bullets include a measurable result.`
      : `${quantified.length} of ${bullets.length} bullets include a number; aim for ${Math.round(target * 100)}%.`
  return { score: clamp(score), summary, issues }
}
