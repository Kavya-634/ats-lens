import type { Analysis } from '../types'
import type { CheckResult } from './types'
import { clamp } from './text'

const PERSONAL_EMAIL_DOMAINS = /@(gmail|outlook|hotmail|yahoo|icloud|proton(mail)?|live|me)\./i
const UNPROFESSIONAL_EMAIL = /(cool|sexy|hot|babe|dude|gamer|420|69|xoxo|princess|killer|lol)/i

export function checkContact(analysis: Analysis): CheckResult {
  const issues: CheckResult['issues'] = []
  let score = 100
  const { emails, phones, urls } = analysis.contact
  const header = analysis.sections.find((s) => s.kind === 'contact')
  const headerText = header?.lines.join('\n') ?? ''
  const headerIsTop = analysis.sections[0]?.kind === 'contact'

  if (!emails.length) {
    score -= 40
    issues.push({
      id: 'no-email',
      severity: 'high',
      title: 'No email address found',
      detail: 'The extracted text contains nothing shaped like an email.',
      why: 'Email is the primary key most ATS products use to create and de-duplicate your candidate record. Without it, some systems reject the application outright.',
      fix: 'Write your email in plain text near the top, e.g. “priya.raman@example.com”. Don’t hide it behind an icon or an image.',
    })
  } else {
    if (emails.length > 1) {
      score -= 5
      issues.push({
        id: 'many-emails',
        severity: 'low',
        title: `${emails.length} email addresses listed`,
        detail: emails.join(', '),
        why: 'Parsers pick one, and it may not be the one you check.',
        fix: 'Keep a single, current email.',
      })
    }
    const bad = emails.find((e) => UNPROFESSIONAL_EMAIL.test(e.split('@')[0]))
    if (bad) {
      score -= 8
      issues.push({
        id: 'email-tone',
        severity: 'low',
        title: 'Email address may read as unprofessional',
        detail: bad,
        why: 'Not an ATS rule, but the address is shown to every recruiter who opens your record.',
        fix: 'Create a simple firstname.lastname style address for job applications.',
      })
    }
    void PERSONAL_EMAIL_DOMAINS // personal domains are fine; kept for future heuristics
  }

  if (!phones.length) {
    score -= 25
    issues.push({
      id: 'no-phone',
      severity: 'high',
      title: 'No phone number found',
      detail: 'Nothing in the text matched a phone number pattern.',
      why: 'Phone is a required field in most application forms; the ATS tries to pre-fill it from your resume, and recruiters often call before emailing.',
      fix: 'Add your number with country code in a standard format, e.g. “+91 98765 43210” or “(206) 555-0142”.',
    })
  } else if (phones.length > 1) {
    score -= 4
    issues.push({
      id: 'many-phones',
      severity: 'low',
      title: `${phones.length} phone numbers listed`,
      detail: phones.join(', '),
      why: 'Parsers keep the first match; extra numbers add noise and may be misread as dates or IDs.',
      fix: 'List one reachable number.',
    })
  }

  const linkedin = urls.find((u) => /linkedin\.com/i.test(u))
  if (!linkedin) {
    score -= 15
    issues.push({
      id: 'no-linkedin',
      severity: 'medium',
      title: 'No LinkedIn profile URL',
      detail: urls.length
        ? `Links found (${urls.length}) but none to LinkedIn.`
        : 'No profile links were found at all.',
      why: 'Many ATS products have a LinkedIn field and recruiters click through to verify history. It is also the most common “enrichment” source that fills in missing data.',
      fix: 'Add “linkedin.com/in/yourname” as plain text (custom URL, no tracking parameters) on the contact line.',
    })
  } else if (/\?|utm_|trk=/.test(linkedin)) {
    score -= 3
    issues.push({
      id: 'linkedin-params',
      severity: 'low',
      title: 'LinkedIn URL carries tracking parameters',
      detail: linkedin,
      why: 'Long URLs wrap and break across lines when extracted; the clean form is what parsers expect.',
      fix: 'Use the short custom URL from your LinkedIn profile settings.',
    })
  }

  if (!headerIsTop && (emails.length || phones.length)) {
    score -= 10
    issues.push({
      id: 'contact-not-top',
      severity: 'medium',
      uncertain: true,
      title: 'Contact details may not be at the top of the resume',
      detail: 'The first recognised block in the extracted text is not the contact header.',
      why: 'Parsers look for the candidate name and contact block in the first few lines. If a heading comes first, the name may be read as a section title.',
      fix: 'Put your name on line 1 and the contact line directly beneath it, before any heading.',
    })
  }

  // Name heuristic: first non-empty line, short, no digits.
  const firstLine = analysis.rawText.split('\n').find((l) => l.trim()) ?? ''
  const looksLikeName = /^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3}$/.test(firstLine.trim())
  if (!looksLikeName && (emails.length || phones.length)) {
    score -= 6
    issues.push({
      id: 'name-not-first',
      severity: 'low',
      uncertain: true,
      title: 'The first line does not look like a name',
      detail: `First extracted line: “${firstLine.trim().slice(0, 60)}”.`,
      why: 'Most parsers take the first short line as the candidate name. If it is a heading, a tagline or your city, that is what gets stored.',
      fix: 'Make your full name the very first line, on its own, in plain text.',
    })
  }

  // Location: mild recommendation.
  if (
    headerText &&
    !/\b([A-Z][a-z]+,\s*[A-Z]{2}|[A-Z][a-z]+,\s*[A-Z][a-z]+|India|USA|UK|Remote)\b/.test(headerText)
  ) {
    score -= 3
    issues.push({
      id: 'no-location',
      severity: 'low',
      uncertain: true,
      title: 'No city or location on the contact line',
      detail: 'Location filters are common in recruiter searches.',
      why: 'Recruiters filter candidates by city or “willing to relocate”. An empty location field can exclude you from local searches.',
      fix: 'Add “City, Country” (no full street address needed) to the contact line.',
    })
  }

  const parts = [
    emails.length ? 'email' : null,
    phones.length ? 'phone' : null,
    linkedin ? 'LinkedIn' : null,
  ].filter(Boolean)
  // With neither email nor phone the ATS cannot create a reachable record;
  // nothing else in this category can compensate.
  if (!emails.length && !phones.length) score = Math.min(score, 10)
  const summary =
    parts.length === 3
      ? 'Email, phone and LinkedIn all found in the header.'
      : parts.length
        ? `Found ${parts.join(' and ')}; ${3 - parts.length} item${3 - parts.length > 1 ? 's' : ''} missing.`
        : 'No contact details could be read.'
  return { score: clamp(score), summary, issues }
}
