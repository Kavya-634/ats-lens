import { describe, expect, it } from 'vitest'
import { buildAnalysis } from './analyze'
import { classifyHeading, detectSections, extractContact, normaliseText } from './sections'

describe('classifyHeading', () => {
  it('recognises common headings regardless of case and decoration', () => {
    expect(classifyHeading('EXPERIENCE')).toBe('experience')
    expect(classifyHeading('Work Experience:')).toBe('experience')
    expect(classifyHeading('— Education —')).toBe('education')
    expect(classifyHeading('• Skills')).toBe('skills')
    expect(classifyHeading('Professional Summary')).toBe('summary')
    expect(classifyHeading('Licenses & Certifications')).toBe('certifications')
    expect(classifyHeading('Tools and Technologies')).toBe('skills')
  })

  it('rejects body text that merely contains a heading word', () => {
    expect(classifyHeading('I have five years of experience building APIs.')).toBeNull()
    expect(classifyHeading('Experience with React, Node and Kafka')).toBeNull()
    expect(classifyHeading('Education 2015 – 2019')).toBeNull()
    expect(classifyHeading('')).toBeNull()
  })
})

describe('extractContact', () => {
  it('finds emails, phones and profile links', () => {
    const c = extractContact(
      'Priya Raman\nSeattle, WA · priya.raman@example.com · (206) 555-0142 · linkedin.com/in/priyaraman · github.com/priyar',
    )
    expect(c.emails).toEqual(['priya.raman@example.com'])
    expect(c.phones).toEqual(['(206) 555-0142'])
    expect(c.urls).toEqual(['linkedin.com/in/priyaraman', 'github.com/priyar'])
  })

  it('handles international numbers and ignores date ranges', () => {
    const c = extractContact('Call +44 20 7946 0958\n2019 - 2023')
    expect(c.phones).toEqual(['+44 20 7946 0958'])
  })
})

describe('detectSections', () => {
  const text = normaliseText(`Priya Raman
priya.raman@example.com · (206) 555-0142

SUMMARY
Product-minded engineer.

EXPERIENCE
Senior Engineer — Northwind
Did things.

EDUCATION
B.S. Computer Science

SKILLS
TypeScript, React`)

  it('splits text into a header block followed by labelled sections', () => {
    const sections = detectSections(text)
    expect(sections.map((s) => s.kind)).toEqual([
      'contact',
      'summary',
      'experience',
      'education',
      'skills',
    ])
    expect(sections[1].heading).toBe('SUMMARY')
    expect(sections[2].lines).toEqual(['Senior Engineer — Northwind', 'Did things.'])
  })

  it('keeps everything in one block when no headings exist', () => {
    const sections = detectSections(
      normaliseText('Jane Doe\njane@example.com\nI did many things\nand more things'),
    )
    expect(sections).toHaveLength(1)
    expect(sections[0].kind).toBe('contact')
  })

  it('labels a long preamble without contact details as "other"', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i} of a long story about my career`)
    const sections = detectSections(lines.join('\n'))
    expect(sections[0].kind).toBe('other')
  })

  it('does not treat a skill in a flattened grid as a heading', () => {
    const text = normaliseText(
      'Skills\n\nCommunication\n\nTeamwork\n\nLeadership\n\nMS Office\n\nCanva\n\nEducation\nB.A. 2020',
    )
    const sections = detectSections(text)
    expect(sections.map((s) => s.kind)).toEqual(['skills', 'education'])
    expect(sections[0].lines.filter(Boolean)).toContain('Leadership')
  })

  it('still treats "Leadership" as a heading when it introduces a block', () => {
    const text = normaliseText(
      'Experience\nEngineer at Acme, 2020 – 2022\n\nLeadership\n• Led the robotics club to a national final.\n• Organised a 300-person hackathon.',
    )
    const sections = detectSections(text)
    expect(sections.map((s) => s.kind)).toEqual(['experience', 'volunteering'])
  })
})

describe('buildAnalysis', () => {
  it('builds sections, contact and stats for a well-structured resume', () => {
    const a = buildAnalysis(
      'ok.pdf',
      'pdf',
      'Jane Doe\njane@example.com\n\nExperience\nEngineer at Acme\n\nEducation\nB.S.\n\nSkills\nJS',
    )
    expect(a.warnings).toEqual([])
    expect(a.stats.words).toBeGreaterThan(5)
    expect(a.sections.map((s) => s.kind)).toEqual(['contact', 'experience', 'education', 'skills'])
    expect(a.contact.emails).toEqual(['jane@example.com'])
    expect(a.layout.source).toBe('pdf')
  })
})
