import { SECTION_LABELS } from '../sections'
import type { Analysis, SectionKind } from '../types'
import type { CheckResult, Mode } from './types'
import { clamp } from './text'

/**
 * Standard section headings and their order. Freshers are expected to lead
 * with Education; experienced candidates with Experience.
 */
export function checkHeadings(analysis: Analysis, mode: Mode): CheckResult {
  const issues: CheckResult['issues'] = []
  let score = 100
  const kinds = analysis.sections.map((s) => s.kind)
  const found = new Set(kinds)
  const labelled = kinds.filter((k) => k !== 'contact' && k !== 'other')

  if (labelled.length === 0) {
    issues.push({
      id: 'no-headings',
      severity: 'high',
      title: 'No standard section headings were recognised',
      detail:
        'None of the headings matched the names parsers look for (Experience, Education, Skills, Summary…).',
      why: 'Parsers decide which database field each line belongs to by the nearest heading. Without recognisable headings your experience may be filed as “other” or dropped.',
      fix: 'Rename creative headings to plain ones: “Where I’ve worked” → “Experience”, “What I know” → “Skills”, “My story” → “Summary”.',
      evidence: analysis.sections
        .filter((s) => s.kind === 'other')
        .map((s) => s.heading)
        .slice(0, 3),
    })
    return { score: 10, summary: 'No recognisable sections.', issues }
  }

  // Required sections by mode.
  const required: {
    kind: SectionKind
    severity: 'high' | 'medium'
    penalty: number
    fresher: string
    experienced: string
  }[] = [
    {
      kind: 'experience',
      severity: mode === 'experienced' ? 'high' : 'medium',
      penalty: mode === 'experienced' ? 35 : 15,
      fresher:
        'As a fresher you may not have full-time roles yet, but internships, part-time work, teaching assistantships or freelance gigs all belong under an “Experience” or “Internships” heading.',
      experienced:
        'Experienced candidates are matched on work history first. Without an Experience section the ATS has almost nothing to rank you on.',
    },
    {
      kind: 'education',
      severity: mode === 'fresher' ? 'high' : 'medium',
      penalty: mode === 'fresher' ? 30 : 12,
      fresher:
        'For a fresher, education is the primary qualification recruiters filter on (degree, institution, graduation year).',
      experienced:
        'Most ATS filters still include a minimum degree field; a missing Education section fails that filter.',
    },
    {
      kind: 'skills',
      severity: 'high',
      penalty: 25,
      fresher:
        'A Skills section is where keyword matching happens. Freshers especially need it to show tools and languages learned in coursework and projects.',
      experienced:
        'A dedicated Skills section is the densest source of keywords for matching against the job description.',
    },
  ]
  for (const r of required) {
    if (!found.has(r.kind)) {
      score -= r.penalty
      issues.push({
        id: `missing-${r.kind}`,
        severity: r.severity,
        title: `No “${SECTION_LABELS[r.kind]}” section found`,
        detail: `The resume has ${labelled.map((k) => SECTION_LABELS[k]).join(', ')} but no ${SECTION_LABELS[r.kind]} heading.`,
        why: mode === 'fresher' ? r.fresher : r.experienced,
        fix: `Add a heading that says exactly “${SECTION_LABELS[r.kind]}” and list the relevant items under it.`,
      })
    }
  }

  // Summary is recommended, not required.
  if (!found.has('summary')) {
    score -= 8
    issues.push({
      id: 'missing-summary',
      severity: 'low',
      title: 'No Summary or Objective at the top',
      detail: 'The resume jumps straight into sections without a 2–3 line summary.',
      why: 'Many ATS products extract the first paragraph as the candidate summary that recruiters see in the list view. Without one they see your first job line instead.',
      fix:
        mode === 'fresher'
          ? 'Add a 2-line “Summary” stating your degree, strongest skills and the role you are targeting.'
          : 'Add a 2–3 line “Summary” with your title, years of experience, domain and two headline achievements.',
    })
  }

  // Projects are valuable for freshers.
  if (mode === 'fresher' && !found.has('projects')) {
    score -= 10
    issues.push({
      id: 'missing-projects',
      severity: 'medium',
      title: 'No Projects section',
      detail:
        'Freshers without a Projects section rely entirely on education and internships for keywords.',
      why: 'Academic, capstone and personal projects are where recruiters hiring freshers look for hands-on evidence of the skills you list.',
      fix: 'Add “Projects” with 2–4 entries: name, one-line purpose, tools used, and a measurable outcome.',
    })
  }

  // Order: which comes first, Education or Experience?
  const eduIdx = kinds.indexOf('education')
  const expIdx = kinds.indexOf('experience')
  if (eduIdx !== -1 && expIdx !== -1) {
    if (mode === 'fresher' && expIdx < eduIdx) {
      score -= 6
      issues.push({
        id: 'order-fresher',
        severity: 'low',
        title: 'Experience is listed before Education',
        detail: 'For a fresher profile, recruiters expect to see the degree first.',
        why: 'Not a parsing problem, but recruiters screening entry-level roles filter by degree and graduation year first. Putting it on top matches how they read.',
        fix: 'Move Education above Experience/Internships. Once you have 1–2 years of full-time work, flip the order.',
      })
    }
    if (mode === 'experienced' && eduIdx < expIdx) {
      score -= 8
      issues.push({
        id: 'order-experienced',
        severity: 'low',
        title: 'Education is listed before Experience',
        detail: 'For an experienced profile, work history should lead.',
        why: 'Recruiters spend about six seconds on the first screen. Leading with a years-old degree pushes your most relevant evidence below the fold.',
        fix: 'Move Experience directly after your Summary and put Education near the end.',
      })
    }
  }

  // Non-standard headings that were still classified (shown as info).
  const odd = analysis.sections.filter(
    (s) =>
      s.kind !== 'contact' &&
      s.kind !== 'other' &&
      s.heading.replace(/[^a-z]/gi, '').toLowerCase() !==
        SECTION_LABELS[s.kind].replace(/[^a-z]/gi, '').toLowerCase() &&
      !/^(work |professional |technical |core )?(experience|education|skills|summary|projects|certifications|competencies)$/i.test(
        s.heading.trim(),
      ),
  )
  if (odd.length >= 2) {
    score -= 4
    issues.push({
      id: 'nonstandard-headings',
      severity: 'low',
      uncertain: true,
      title: 'Some headings use non-standard wording',
      detail: `We recognised them, but less forgiving parsers may not: ${odd.map((s) => `“${s.heading}”`).join(', ')}.`,
      why: 'ATS vendors maintain lists of heading synonyms. The further you stray from “Experience” or “Skills”, the more likely a section is missed.',
      fix: 'Prefer the plainest version: Summary, Experience, Education, Skills, Projects, Certifications.',
    })
  }

  // Unlabelled blocks of content.
  const otherBlocks = analysis.sections.filter((s) => s.kind === 'other' && s.lines.length >= 3)
  if (otherBlocks.length) {
    score -= 10
    issues.push({
      id: 'unlabelled-content',
      severity: 'medium',
      title: 'Content exists outside any recognised section',
      detail: `${otherBlocks.reduce((n, s) => n + s.lines.length, 0)} lines appear before the first standard heading or under an unrecognised one.`,
      why: 'Lines that don’t belong to a known section are usually discarded or dumped into a generic field no one searches.',
      fix: 'Give every block a standard heading, or move the lines under the nearest one.',
      evidence: otherBlocks.flatMap((s) => s.lines.slice(0, 2)).slice(0, 3),
    })
  }

  const summary =
    issues.length === 0
      ? `Found ${labelled.length} standard sections in the expected order for ${mode === 'fresher' ? 'a fresher' : 'an experienced'} profile.`
      : `${labelled.length} standard section${labelled.length === 1 ? '' : 's'} found; ${issues.length} thing${issues.length > 1 ? 's' : ''} to tidy.`
  return { score: clamp(score), summary, issues }
}
