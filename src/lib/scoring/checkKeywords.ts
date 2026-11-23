import type { Analysis } from '../types'
import type { CheckResult, Mode } from './types'
import { clamp, sample, words } from './text'

const STOP = new Set(
  'a an and the of to in for with on at by from as or is are was were be been being this that these those it its into over under about across after before between during through up down out off than then so such not no nor but if while where when which who whom whose what how all any both each few more most other some own same too very can will just also via using used use per etc including include includes'.split(
    ' ',
  ),
)

/**
 * Keyword variety: a skills section exists, has a healthy number of distinct
 * terms, and the skills it names are backed up somewhere in the experience
 * or projects text.
 */
export function checkKeywords(analysis: Analysis, mode: Mode): CheckResult {
  const issues: CheckResult['issues'] = []
  let score = 100

  const skillsSections = analysis.sections.filter((s) => s.kind === 'skills')
  const skillsText = skillsSections.map((s) => s.lines.join('\n')).join('\n')
  const bodyText = analysis.sections
    .filter((s) => s.kind === 'experience' || s.kind === 'projects' || s.kind === 'summary')
    .map((s) => s.lines.join('\n'))
    .join('\n')
    .toLowerCase()

  if (!skillsSections.length) {
    // Already penalised under Headings; here we only grade variety of what exists.
    const uniq = uniqueTerms(analysis.rawText)
    const s = clamp(Math.min(100, (uniq / 120) * 100) * 0.6)
    return {
      score: s,
      summary: 'No Skills section; variety judged on the whole text.',
      issues: [
        {
          id: 'no-skills-for-keywords',
          severity: 'medium',
          title: 'Keywords are scattered rather than listed',
          detail: `${uniq} distinct meaningful words across the resume, but no Skills block to anchor them.`,
          why: 'Recruiters search the ATS with skill keywords. A Skills section is the single highest-density match zone; without it you rely on skills being mentioned in prose.',
          fix: 'Add a “Skills” section grouping 10–25 specific terms: languages, tools, frameworks, methods, domain knowledge.',
        },
      ],
    }
  }

  const skills = splitSkills(skillsText)
  const [minSkills, maxSkills] = mode === 'fresher' ? [8, 30] : [10, 40]

  if (skills.length < minSkills) {
    score -= 30
    issues.push({
      id: 'few-skills',
      severity: skills.length < minSkills / 2 ? 'high' : 'medium',
      title: `Only ${skills.length} skill${skills.length === 1 ? '' : 's'} listed`,
      detail: `A ${mode} resume typically lists ${minSkills}–${maxSkills} specific skills.`,
      why: 'Each specific skill is a potential keyword match against the job description. Fewer terms means fewer chances to rank.',
      fix:
        mode === 'fresher'
          ? 'List every language, tool and framework from coursework and projects, plus methods (unit testing, Git, Agile) and domain terms.'
          : 'Add the tools, platforms, methodologies and domain terms you actually use day to day. Group them by type for readability.',
    })
  } else if (skills.length > maxSkills) {
    score -= 10
    issues.push({
      id: 'skill-dump',
      severity: 'low',
      title: `${skills.length} skills is a long list`,
      detail: `More than ${maxSkills} items reads like a keyword dump.`,
      why: 'Some ATS products down-weight skills sections that look stuffed, and recruiters distrust lists that include everything.',
      fix: 'Keep the ones relevant to the roles you want and that you could discuss in an interview.',
    })
  }

  // Generic / soft skills dominating.
  const soft = skills.filter((s) =>
    /^(communication|teamwork|team work|leadership|problem[- ]solving|time management|hard[- ]working|adaptab|creativ|critical thinking|interpersonal|multitask|organis|organiz|work ethic|positive attitude|quick learner|fast learner|flexib|punctual|dedicated|honest|microsoft office|ms office|ms word|internet|email|typing|computer skills|basic computer)/i.test(
      s,
    ),
  )
  if (soft.length && soft.length / skills.length > 0.4) {
    score -= 15
    issues.push({
      id: 'soft-skills-heavy',
      severity: 'medium',
      title: 'Skills list is mostly generic soft skills',
      detail: `${soft.length} of ${skills.length} items are soft skills or basics like “MS Office”: ${sample(soft).join(', ')}.`,
      why: 'Recruiters almost never search for “communication” or “teamwork”. Those terms match everyone, so they do nothing for ranking.',
      fix: 'Keep at most 2–3 soft skills and fill the rest with specific tools, technologies, methods or domain knowledge.',
    })
  }

  // Specificity: how many skills look like proper nouns / tech terms.
  const specific = skills.filter((s) => /[A-Z0-9.#+/]/.test(s) || s.length > 12)
  if (skills.length >= 6 && specific.length / skills.length < 0.4) {
    score -= 10
    issues.push({
      id: 'generic-terms',
      severity: 'low',
      uncertain: true,
      title: 'Many skills are single generic words',
      detail: `${skills.length - specific.length} of ${skills.length} skills are short common words.`,
      why: 'Specific terms (PostgreSQL, Figma, IFRS, Six Sigma) are what job descriptions name and what recruiters type into search.',
      fix: 'Replace “databases” with the databases you know; “design” with the design tools and methods.',
    })
  }

  // Skills not evidenced anywhere else.
  const unbacked = skills.filter((s) => {
    const key = s
      .toLowerCase()
      .replace(/\s*\(.*\)$/, '')
      .trim()
    if (key.length < 3) return false
    return !bodyText.includes(key)
  })
  if (skills.length >= 6 && unbacked.length / skills.length > 0.7 && bodyText.length > 200) {
    score -= 10
    issues.push({
      id: 'unbacked-skills',
      severity: 'low',
      uncertain: true,
      title: 'Most listed skills never appear in your experience',
      detail: `${unbacked.length} of ${skills.length} skills are not mentioned in any Experience, Projects or Summary line, e.g. ${sample(unbacked).join(', ')}.`,
      why: 'Some ranking models give extra weight to skills that appear in context (inside a role bullet), and recruiters trust a skill more when they can see where you used it.',
      fix: 'Work the key tools into bullets: “Built the ETL pipeline in Python and Airflow” instead of listing Airflow only in Skills.',
    })
  }

  // Duplicate skills.
  const lowerSkills = skills.map((s) => s.toLowerCase())
  const dupes = [...new Set(lowerSkills.filter((s, i) => lowerSkills.indexOf(s) !== i))]
  if (dupes.length) {
    score -= 4
    issues.push({
      id: 'duplicate-skills',
      severity: 'low',
      title: `${dupes.length} skill${dupes.length > 1 ? 's are' : ' is'} listed twice`,
      detail: dupes.map((d) => `“${d}”`).join(', '),
      why: 'Repeats add no weight and look careless.',
      fix: 'Remove duplicates.',
    })
  }

  // Overall lexical variety of the resume.
  const uniq = uniqueTerms(analysis.rawText)
  const total = words(analysis.rawText).filter((w) => !STOP.has(w)).length
  const variety = total ? uniq / total : 0
  if (total > 150 && variety < 0.45) {
    score -= 8
    issues.push({
      id: 'low-variety',
      severity: 'low',
      title: 'The same words are repeated a lot',
      detail: `${uniq} distinct terms across ${total} meaningful words (${Math.round(variety * 100)}% variety).`,
      why: 'Keyword matching rewards breadth. Repeating the same few terms means fewer distinct matches against a job description.',
      fix: 'Vary vocabulary across bullets; name specific tools, methods and outcomes rather than reusing one phrase.',
    })
  }

  const summary =
    issues.length === 0
      ? `${skills.length} specific skills listed, with good variety across the text.`
      : `${skills.length} skills listed; ${issues.length} note${issues.length > 1 ? 's' : ''} on variety.`
  return { score: clamp(score), summary, issues }
}

/** Break a skills block into individual terms. */
export function splitSkills(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[^:]{1,40}:\s*/, '')) // drop "Languages:" labels
    .join('\n')
    .split(/[,;|•·▪■●◦\n/]+|\s{2,}|\s+[-–—]\s+/)
    .map((s) => s.replace(/^[\s•·▪■●◦\-–—*]+|[\s.]+$/g, '').trim())
    .filter((s) => s && s.length <= 40 && !/^(and|or|etc)$/i.test(s))
}

function uniqueTerms(text: string): number {
  return new Set(words(text).filter((w) => w.length > 2 && !STOP.has(w))).size
}
