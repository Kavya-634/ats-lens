import type { Analysis } from '../types'
import type { CheckResult } from './types'
import { COMMON_MISSPELLINGS } from './wordlists'
import { clamp, sample } from './text'

/**
 * Spelling. We deliberately use a short, high-confidence list of common
 * resume misspellings plus structural checks (doubled words, inconsistent
 * capitalisation of well-known tech names) instead of a full dictionary,
 * which would flag every company and product name.
 */
export function checkSpelling(analysis: Analysis): CheckResult {
  const issues: CheckResult['issues'] = []
  let score = 100
  const text = analysis.rawText

  // Known misspellings.
  const found = new Map<string, { correct: string; count: number }>()
  for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]+/g)) {
    const w = m[0].toLowerCase()
    const correct = COMMON_MISSPELLINGS[w]
    if (correct) {
      const e = found.get(w)
      if (e) e.count++
      else found.set(w, { correct, count: 1 })
    }
  }
  if (found.size) {
    score -= Math.min(45, found.size * 12)
    issues.push({
      id: 'misspellings',
      severity: found.size >= 3 ? 'high' : 'medium',
      title: `${found.size} likely misspelling${found.size > 1 ? 's' : ''}`,
      detail: [...found.entries()]
        .map(([w, { correct, count }]) => `“${w}” → ${correct}${count > 1 ? ` (×${count})` : ''}`)
        .join(', '),
      why: 'Keyword matching is exact. “Managment” never matches “management”, so the skill vanishes from your profile. Recruiters also treat typos as a proxy for carelessness.',
      fix: 'Correct each word, then run a full spell-check in your editor before exporting.',
    })
  }

  // Doubled words ("the the").
  const doubled = [...text.matchAll(/\b([A-Za-z]{2,})\s+\1\b/gi)]
    .map((m) => m[0])
    .filter((d) => !/^(had had|that that|is is)$/i.test(d))
  if (doubled.length) {
    score -= Math.min(10, doubled.length * 4)
    issues.push({
      id: 'doubled-words',
      severity: 'low',
      title: `${doubled.length} repeated word${doubled.length > 1 ? 's' : ''}`,
      detail: doubled.map((d) => `“${d}”`).join(', '),
      why: 'A classic copy-edit slip that recruiters notice instantly.',
      fix: 'Delete the duplicate.',
    })
  }

  // Inconsistent casing of well-known names.
  const brands: [RegExp, string][] = [
    [/\bjavascript\b/g, 'JavaScript'],
    [/\bTypescript\b|\btypescript\b/g, 'TypeScript'],
    [/\bGithub\b|\bgithub\b(?!\.com)/g, 'GitHub'],
    [/\bLinkedin\b|\blinkedin\b(?!\.com)/g, 'LinkedIn'],
    [/\bPostgresql\b|\bpostgresql\b|\bPostgreSql\b/g, 'PostgreSQL'],
    [/\bMysql\b|\bmysql\b/g, 'MySQL'],
    [/\bNodejs\b|\bnodejs\b|\bNode\.JS\b/g, 'Node.js'],
    [/\bReactjs\b|\breactjs\b|\bReact\.JS\b/g, 'React'],
    [/\bPowerpoint\b|\bpowerpoint\b/g, 'PowerPoint'],
    [/\bExcel\b/g, 'Excel'],
    [/\bphotoshop\b/g, 'Photoshop'],
    [/\bSalesforce\b|\bsalesforce\b|\bSalesForce\b/g, 'Salesforce'],
    [/\bWordpress\b|\bwordpress\b/g, 'WordPress'],
    [/\bYoutube\b|\byoutube\b(?!\.com)/g, 'YouTube'],
    [/\bIos\b|\bIOS\b/g, 'iOS'],
    [/\bMacos\b|\bMacOS\b|\bmacos\b/g, 'macOS'],
    [/\bSql\b|\bsql\b/g, 'SQL'],
    [/\bHtml\b|\bhtml\b/g, 'HTML'],
    [/\bCss\b|\bcss\b/g, 'CSS'],
    [/\bApi\b|\bapi\b/g, 'API'],
    [/\bAws\b|\baws\b/g, 'AWS'],
    [/\bGcp\b|\bgcp\b/g, 'GCP'],
    [/\bCi\/cd\b|\bci\/cd\b|\bCI\/cd\b/g, 'CI/CD'],
    [/\bMongodb\b|\bmongodb\b|\bMongoDb\b/g, 'MongoDB'],
    [/\bKubernetes\b|\bkubernetes\b/g, 'Kubernetes'],
    [/\bDocker\b|\bdocker\b/g, 'Docker'],
    [/\bPython\b|\bpython\b/g, 'Python'],
    [/\bJava\b(?!script)|\bjava\b(?!script)/g, 'Java'],
    [/\bPower bi\b|\bpower bi\b|\bPowerBI\b|\bPower Bi\b/gi, 'Power BI'],
  ]
  const casing: string[] = []
  for (const [re, correct] of brands) {
    const hits = text.match(re) ?? []
    const wrong = [...new Set(hits.filter((h) => h !== correct))]
    // Skip words that are also ordinary English (Excel, Docker, Python, Java
    // in lowercase could be deliberate in prose), only flag clear brand casing.
    if (wrong.length && !/^(Excel|Docker|Python|Java|Kubernetes)$/.test(correct)) {
      casing.push(`${wrong.map((w) => `“${w}”`).join('/')} → ${correct}`)
    }
  }
  if (casing.length) {
    score -= Math.min(12, casing.length * 3)
    issues.push({
      id: 'brand-casing',
      severity: 'low',
      title: `${casing.length} product name${casing.length > 1 ? 's' : ''} with unusual capitalisation`,
      detail: sample(casing, 5).join('; '),
      why: 'Most matching is case-insensitive, so this rarely costs a match, but recruiters in tech read “Javascript” or “Github” as a sign the candidate hasn’t used the tool much.',
      fix: 'Use the official spelling: JavaScript, TypeScript, GitHub, LinkedIn, PostgreSQL, Node.js.',
    })
  }

  // Stray spaces before punctuation / missing space after.
  const spacing = (text.match(/\w\s+[,.;:]\s|[,.;:][A-Za-z]{2,}/g) ?? []).filter(
    (s) =>
      !/\d[.,]\d/.test(s) &&
      !/\.(js|py|net|com|org|io|ai|co|in|ts|css|html|txt|pdf|docx)\b/i.test(s),
  )
  if (spacing.length >= 3) {
    score -= 5
    issues.push({
      id: 'punctuation-spacing',
      severity: 'low',
      uncertain: true,
      title: 'Spacing around punctuation looks inconsistent',
      detail: `${spacing.length} spots like “word ,” or “word.Next”.`,
      why: 'Tokenisers split on spaces. “Python,SQL” can be read as one unknown token instead of two skills.',
      fix: 'Put one space after every comma and full stop, none before.',
      evidence: sample(spacing.map((s) => `“${s.trim()}”`)),
    })
  }

  const summary =
    issues.length === 0
      ? 'No common misspellings, doubled words or brand-casing slips found.'
      : found.size
        ? `${found.size} likely misspelling${found.size > 1 ? 's' : ''} and ${issues.length - 1} other note${issues.length - 1 === 1 ? '' : 's'}.`
        : `No misspellings from our list; ${issues.length} minor note${issues.length > 1 ? 's' : ''}.`
  return { score: clamp(score), summary, issues }
}
