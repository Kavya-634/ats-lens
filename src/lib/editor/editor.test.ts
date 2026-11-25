import { describe, expect, it } from 'vitest'
import { buildAnalysis } from '../analyze'
import { scoreResume } from '../scoring'
import { docFromAnalysis, docToText } from './doc'
import { applyFix, suggestVerbs } from './fixes'
import { scoreDoc } from './rescore'
import { hasOnlyOriginalNumbers, parseSuggestions } from '../../../shared/improve'

const MESSY = `ROHAN MEHTA
Marketing Professional

My Story
I am a passionate, results-driven team player with excelent comunication skills.

Where I’ve Worked
Marketing Executive, Zenith Retail — 03/2021 to Present
§ Responsible for managing social media accounts and various campaigns.
§ Worked on the the newsletter and helped the design team with many tasks.
§ Involved in planning events and was in charge of vendor coordination.
Marketing Intern, Bright Ideas Agency — Jan 2020 – Dec 2020
§ Assisted senior staff with reports.

Education
BBA Marketing, Symbiosis University, 2017-2020

What I Know
Communication, Teamwork, MS Office, Canva, javascript, Github, Canva

Personal Details
Date of Birth: 12 May 1998 | Marital Status: Single | Nationality: Indian`

function messyDoc() {
  return docFromAnalysis(buildAnalysis('messy.docx', 'docx', MESSY))
}

describe('docFromAnalysis', () => {
  it('builds name, contact and sections from a parsed resume', () => {
    const a = buildAnalysis(
      'ok.pdf',
      'pdf',
      'Priya Raman\nSeattle, WA · priya@example.com · (206) 555-0142 · linkedin.com/in/priya · github.com/priyar\n\nExperience\nEngineer, Acme — Mar 2022 – Present\n• Built things used by 300 clinics.\n\nSkills\nTypeScript, React',
    )
    const d = docFromAnalysis(a)
    expect(d.name).toBe('Priya Raman')
    expect(d.contact.email).toBe('priya@example.com')
    expect(d.contact.phone).toBe('(206) 555-0142')
    expect(d.contact.linkedin).toBe('linkedin.com/in/priya')
    expect(d.contact.location).toBe('Seattle, WA')
    expect(d.contact.other).toContain('github.com/priyar')
    expect(d.sections.map((s) => s.kind)).toEqual(['experience', 'skills'])
    expect(d.sections[0].items[1]).toMatchObject({
      text: 'Built things used by 300 clinics.',
      bullet: true,
    })
  })

  it('round-trips to text that re-parses into the same sections', () => {
    const d = messyDoc()
    const text = docToText(d)
    const again = buildAnalysis('x.pdf', 'pdf', text)
    expect(again.sections.map((s) => s.kind)).toContain('education')
  })
})

describe('deterministic fixes', () => {
  it('standardises headings and relabels unknown blocks', () => {
    const r = applyFix(messyDoc(), 'standardise-headings', 'experienced')
    const headings = r.doc.sections.map((s) => s.heading)
    expect(headings).not.toContain('My Story')
    expect(headings).not.toContain('Where I’ve Worked')
    expect(r.doc.sections.some((s) => s.kind === 'experience')).toBe(true)
    expect(r.count).toBeGreaterThan(0)
  })

  it('cleans symbol-font bullets into real bullets', () => {
    const d = messyDoc()
    const exp = d.sections.find((s) => /Worked/.test(s.heading))!
    expect(exp.items.filter((i) => i.bullet).length).toBeGreaterThan(0) // § already recognised at parse time
    const r = applyFix(d, 'clean-bullets', 'experienced')
    for (const it of r.doc.sections.flatMap((s) => s.items)) expect(it.text).not.toMatch(/^§/)
  })

  it('normalises dates to Mon YYYY with an en dash', () => {
    const r = applyFix(messyDoc(), 'normalise-dates', 'experienced')
    const text = docToText(r.doc)
    expect(text).toContain('Mar 2021 – Present')
    expect(text).toContain('Jan 2020 – Dec 2020')
    expect(text).toContain('2017 – 2020')
    expect(text).not.toMatch(/03\/2021/)
  })

  it('labels contact and inserts placeholders rather than inventing values', () => {
    const r = applyFix(messyDoc(), 'label-contact', 'experienced')
    expect(r.doc.contact.email).toBe('[add email]')
    expect(r.doc.contact.phone).toBe('[add phone]')
    expect(r.doc.contact.linkedin).toBe('[add LinkedIn URL]')
    expect(docToText(r.doc)).toContain('Email: [add email]')
  })

  it('reorders by mode', () => {
    const base = applyFix(messyDoc(), 'standardise-headings', 'experienced').doc
    const f = applyFix(base, 'reorder-sections', 'fresher').doc.sections.map((s) => s.kind)
    const e = applyFix(base, 'reorder-sections', 'experienced').doc.sections.map((s) => s.kind)
    expect(f.indexOf('education')).toBeLessThan(f.indexOf('experience'))
    expect(e.indexOf('experience')).toBeLessThan(e.indexOf('education'))
  })

  it('removes personal details', () => {
    const r = applyFix(messyDoc(), 'remove-personal-details', 'experienced')
    const text = docToText(r.doc)
    expect(text).not.toMatch(/Date of Birth|Marital|Nationality/)
    expect(r.count).toBeGreaterThan(0)
  })

  it('fixes spelling, doubled words and brand casing', () => {
    let d = applyFix(messyDoc(), 'fix-spelling', 'experienced').doc
    d = applyFix(d, 'fix-brand-casing', 'experienced').doc
    const text = docToText(d)
    expect(text).toContain('excellent communication')
    expect(text).not.toMatch(/\bthe the\b/)
    expect(text).toContain('JavaScript')
    expect(text).toContain('GitHub')
  })

  it('dedupes skills', () => {
    const d = applyFix(messyDoc(), 'standardise-headings', 'experienced').doc
    const r = applyFix(d, 'dedupe-skills', 'experienced')
    const skills = r.doc.sections.find((s) => s.kind === 'skills')!
    expect(
      skills.items
        .map((i) => i.text)
        .join(',')
        .match(/Canva/g)?.length,
    ).toBe(1)
  })

  it('removes first person', () => {
    const r = applyFix(messyDoc(), 'remove-first-person', 'experienced')
    expect(docToText(r.doc)).not.toMatch(/\bI am\b/)
  })

  it('adds missing sections with placeholders only', () => {
    const d = applyFix(messyDoc(), 'standardise-headings', 'experienced').doc
    const r = applyFix(d, 'add-missing-sections', 'fresher')
    const projects = r.doc.sections.find((s) => s.kind === 'projects')
    expect(projects).toBeDefined()
    expect(projects!.items.every((i) => /\[/.test(i.text))).toBe(true)
  })

  it('suggests stronger verbs without rewriting', () => {
    const d = messyDoc()
    const s = suggestVerbs(d)
    expect(s.length).toBeGreaterThanOrEqual(3)
    const resp = s.find((x) => /^Responsible for/i.test(x.original))!
    expect(resp.options[0]).toMatch(/^(Managed|Owned|Led|Delivered|Oversaw) social media/)
    // The original text is untouched until the user picks.
    expect(docToText(d)).toContain('Responsible for')
  })
})

describe('live re-scoring', () => {
  it('score goes up after applying the deterministic fixes', () => {
    const a = buildAnalysis('messy.docx', 'docx', MESSY)
    const before = scoreResume(a, 'experienced').overall
    let d = docFromAnalysis(a)
    for (const id of [
      'standardise-headings',
      'clean-bullets',
      'normalise-dates',
      'label-contact',
      'remove-personal-details',
      'fix-spelling',
      'fix-brand-casing',
      'dedupe-skills',
      'remove-first-person',
      'reorder-sections',
    ] as const) {
      d = applyFix(d, id, 'experienced').doc
    }
    // The user fills the contact placeholders; we never invent them.
    d.contact = {
      ...d.contact,
      email: 'rohan@example.com',
      phone: '+91 98765 43210',
      linkedin: 'linkedin.com/in/rohanmehta',
    }
    const after = scoreDoc(d, 'messy.docx', 'experienced')
    expect(after.overall).toBeGreaterThan(before + 20)
    const ids = after.categories.flatMap((c) => c.issues.map((i) => i.id))
    expect(ids).not.toContain('no-headings')
    expect(ids).not.toContain('mixed-formats')
    expect(ids).not.toContain('personal-details')
    expect(ids).not.toContain('misspellings')
  })
})

describe('AI guard rails', () => {
  it('parses a JSON array even inside a code fence', () => {
    expect(
      parseSuggestions(
        '```json\n["Led a team of [add number] engineers", "Built the X pipeline", "short"]\n```',
      ),
    ).toEqual(['Led a team of [add number] engineers', 'Built the X pipeline'])
  })

  it('rejects suggestions that introduce numbers not in the original', () => {
    const original = 'Responsible for managing social media accounts.'
    expect(
      hasOnlyOriginalNumbers(
        original,
        'Managed social media accounts, growing followers by [add %]',
      ),
    ).toBe(true)
    expect(
      hasOnlyOriginalNumbers(original, 'Managed social media accounts, growing followers by 40%'),
    ).toBe(false)
    expect(
      hasOnlyOriginalNumbers('Served 300 clinics', 'Supported 300 clinics with intake forms'),
    ).toBe(true)
  })
})
