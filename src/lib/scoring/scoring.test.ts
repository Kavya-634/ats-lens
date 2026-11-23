import { describe, expect, it } from 'vitest'
import { buildAnalysis } from '../analyze'
import type { LayoutSignals } from '../types'
import { scoreResume, scoreBand } from './index'
import { splitSkills } from './checkKeywords'
import { classifyDateToken } from './text'

const STRONG = `Priya Raman
Seattle, WA · priya.raman@example.com · (206) 555-0142 · linkedin.com/in/priyaraman · github.com/priyar

Summary
Product-minded software engineer with 6 years of experience building data-heavy web applications. Led the migration of a monolithic billing system to event-driven services, cutting invoice latency by 70%.

Experience
Senior Software Engineer Mar 2022 – Present
Northwind Analytics Seattle, WA
• Designed and shipped a usage-based billing pipeline (TypeScript, Kafka, Postgres) processing 40M events/day with exactly-once semantics.
• Reduced p95 dashboard load time from 4.1s to 900ms by introducing server-side aggregation and incremental caching.
• Mentored four engineers; introduced lightweight design reviews that cut rework on large features by roughly a third.
Software Engineer Jul 2019 – Feb 2022
Brightline Health Portland, OR
• Built patient-intake forms used by 300+ clinics; drove accessibility work to WCAG 2.1 AA.
• Owned the React component library and migrated it from JavaScript to TypeScript with zero production regressions.
• Set up CI with parallelised test shards, reducing average pipeline time from 28 to 9 minutes.

Education
B.S. Computer Science 2015 – 2019
Oregon State University Corvallis, OR

Skills
Languages: TypeScript, JavaScript, Python, SQL, Go
Frameworks: React, Node.js, Next.js, Express, FastAPI
Infrastructure: PostgreSQL, Kafka, Redis, AWS (ECS, RDS, S3), Terraform, GitHub Actions

Projects
Open-source: tiny-ledger 2023
• A 1,200-line double-entry accounting library for Node with property-based tests; 900+ GitHub stars.

Certifications
• AWS Certified Solutions Architect – Associate (2023)`

const WEAK = `My Journey
I am a hard worker and team player with excelent comunication skills.

Where I've Worked
Some Company
Responsible for managment of various projects and helped the team with many tasks.
Worked on different things and was involved in meetings.
Responsible for reporting.

What I Know
Communication, Teamwork, Leadership, MS Office, Hard working, Quick learner`

describe('scoreResume', () => {
  it('scores a well-formed resume highly in experienced mode', () => {
    const a = buildAnalysis('strong.pdf', 'pdf', STRONG)
    const r = scoreResume(a, 'experienced')
    expect(r.overall).toBeGreaterThanOrEqual(80)
    expect(r.categories).toHaveLength(9)
    expect(r.categories.reduce((n, c) => n + c.weight, 0)).toBeCloseTo(1, 5)
    const byId = Object.fromEntries(r.categories.map((c) => [c.id, c]))
    expect(byId.contact.score).toBe(100)
    expect(byId.parseability.score).toBe(100)
    expect(byId.verbs.score).toBeGreaterThanOrEqual(85)
    expect(byId.quantified.score).toBeGreaterThanOrEqual(85)
    expect(byId.spelling.issues).toEqual([])
    expect(r.topFixes.length).toBeLessThanOrEqual(5)
  })

  it('scores a weak resume low and ranks the biggest problems first', () => {
    const a = buildAnalysis('weak.pdf', 'pdf', WEAK)
    const r = scoreResume(a, 'experienced')
    expect(r.overall).toBeLessThan(45)
    expect(r.notes.some((n) => /Capped at 45/.test(n))).toBe(true)
    const ids = r.topFixes.map((f) => f.id)
    // No contact details and no recognised headings must dominate the Top 5.
    expect(ids).toContain('no-email')
    expect(ids).toContain('no-headings')
    expect(r.topFixes[0].impact).toBeGreaterThanOrEqual(r.topFixes[4]?.impact ?? 0)
    const spelling = r.categories.find((c) => c.id === 'spelling')!
    expect(spelling.issues[0].detail).toMatch(/excelent|comunication|managment/)
  })

  it('applies mode-specific expectations', () => {
    // Fresher with Education before Experience is fine; experienced is penalised.
    const text = `Asha Patel
asha@example.com · +91 98765 43210 · linkedin.com/in/ashapatel

Education
B.Tech Computer Science 2021 – 2025
IIT Bombay

Experience
Software Intern Jun 2024 – Aug 2024
• Built a React dashboard used by 40 interns to track onboarding tasks.

Projects
Campus Marketplace 2024
• Developed a Django marketplace with 300 registered users and 95% test coverage.

Skills
Python, Django, React, JavaScript, SQL, Git, Docker, Linux, REST APIs, Unit testing`
    const a = buildAnalysis('asha.pdf', 'pdf', text)
    const fresher = scoreResume(a, 'fresher')
    const experienced = scoreResume(a, 'experienced')
    const fIds = fresher.categories.flatMap((c) => c.issues.map((i) => i.id))
    const eIds = experienced.categories.flatMap((c) => c.issues.map((i) => i.id))
    expect(fIds).not.toContain('order-fresher')
    expect(eIds).toContain('order-experienced')
    const fHeadings = fresher.categories.find((c) => c.id === 'headings')!.score
    const eHeadings = experienced.categories.find((c) => c.id === 'headings')!.score
    expect(fHeadings).toBeGreaterThan(eHeadings)
    expect(fresher.overall).toBeGreaterThanOrEqual(experienced.overall)
  })

  it('returns 0 for image-only files and explains why', () => {
    const a = buildAnalysis('scan.pdf', 'pdf', '')
    const r = scoreResume(a, 'fresher')
    expect(r.overall).toBe(0)
    expect(r.topFixes[0].id).toBe('no-text')
  })

  it('reports layout problems from DOCX structure', () => {
    const layout: LayoutSignals = {
      source: 'docx',
      fonts: ['Calibri', 'Wingdings'],
      symbolFonts: ['Wingdings'],
      nonEmbeddedFonts: 0,
      imageCount: 5,
      listLikeLines: 0,
      docx: {
        tables: 2,
        textBoxes: 1,
        columnSections: 1,
        headerFooterText: 'jane@example.com | 555-0100',
      },
    }
    const a = buildAnalysis('designed.docx', 'docx', STRONG, layout)
    const r = scoreResume(a, 'experienced')
    const parse = r.categories.find((c) => c.id === 'parseability')!
    const ids = parse.issues.map((i) => i.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'columns',
        'tables',
        'textboxes',
        'header-footer',
        'graphics',
        'symbol-fonts',
      ]),
    )
    expect(parse.issues.find((i) => i.id === 'columns')!.uncertain).toBeFalsy()
    expect(parse.issues.find((i) => i.id === 'graphics')!.uncertain).toBe(true)
    expect(parse.score).toBeLessThan(30)
  })

  it('marks PDF column detection as a possible issue when evidence is weak', () => {
    const lineStarts = Array.from({ length: 40 }, (_, i) => ({
      x: i % 4 === 0 ? 330 : 54, // 25% of lines start mid-page (right-aligned dates, perhaps)
      y: 700 - i * 14,
    }))
    const layout: LayoutSignals = {
      source: 'pdf',
      fonts: ['Georgia'],
      symbolFonts: [],
      nonEmbeddedFonts: 0,
      imageCount: 0,
      listLikeLines: 0,
      pdfPages: [{ width: 612, height: 792, lineStarts }],
    }
    const a = buildAnalysis('cols.pdf', 'pdf', STRONG, layout)
    const r = scoreResume(a, 'experienced')
    const col = r.categories
      .find((c) => c.id === 'parseability')!
      .issues.find((i) => i.id === 'columns')
    expect(col).toBeDefined()
    expect(col!.uncertain).toBe(true)
    expect(col!.severity).toBe('medium')
  })

  it('flags mixed date formats', () => {
    const text = `Sam Lee
sam@example.com · (415) 555-0100 · linkedin.com/in/samlee

Experience
Analyst 03/2021 – 06/2023
Acme
• Built reports used by 20 managers.
Associate Jan 2019 – Feb 2021
Beta Corp
• Reduced costs by 15% through vendor consolidation.
Intern 2018 – 2018
Gamma
• Cleaned 10,000 records.

Education
B.A. Economics 2014 – 2018

Skills
Excel, SQL, Tableau, Python, Power BI, Forecasting, Budgeting, Vendor management, SAP, Financial modelling`
    const a = buildAnalysis('dates.pdf', 'pdf', text)
    const r = scoreResume(a, 'experienced')
    const dates = r.categories.find((c) => c.id === 'dates')!
    expect(dates.issues.map((i) => i.id)).toContain('mixed-formats')
  })
})

describe('helpers', () => {
  it('splits a skills block into terms', () => {
    expect(splitSkills('Languages: TypeScript, Python\nTools: Git • Docker | Linux')).toEqual([
      'TypeScript',
      'Python',
      'Git',
      'Docker',
      'Linux',
    ])
  })

  it('classifies date tokens', () => {
    expect(classifyDateToken('Mar 2022')).toBe('month-year')
    expect(classifyDateToken('03/2022')).toBe('numeric')
    expect(classifyDateToken('2022')).toBe('year-only')
    expect(classifyDateToken('2022-03')).toBe('iso')
    expect(classifyDateToken('Present')).toBeNull()
  })

  it('labels score bands', () => {
    expect(scoreBand(90).tone).toBe('good')
    expect(scoreBand(65).tone).toBe('ok')
    expect(scoreBand(20).tone).toBe('poor')
  })
})
