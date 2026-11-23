import type { Analysis, SectionKind } from '../types'

export type Mode = 'fresher' | 'experienced'

export type CategoryId =
  | 'parseability'
  | 'headings'
  | 'contact'
  | 'dates'
  | 'length'
  | 'verbs'
  | 'quantified'
  | 'spelling'
  | 'keywords'

export type Severity = 'high' | 'medium' | 'low'

export interface Issue {
  id: string
  category: CategoryId
  severity: Severity
  /** Short, plain-English statement of what is wrong. */
  title: string
  /** What we observed. */
  detail: string
  /** Why an ATS or recruiter cares. */
  why: string
  /** Concrete steps to fix it. */
  fix: string
  /** True when the check is heuristic and could be wrong. Shown as "Possible issue". */
  uncertain?: boolean
  /** Points this issue is costing; used to rank the Top 5. */
  impact: number
  /** Up to a few quotes from the resume that triggered the issue. */
  evidence?: string[]
}

export interface CategoryScore {
  id: CategoryId
  label: string
  /** 0–100 for this category. */
  score: number
  /** Weight within the overall score (all weights sum to 1). */
  weight: number
  /** One-line summary of what was found, even when everything is fine. */
  summary: string
  issues: Issue[]
  /** True when the check could not run meaningfully (e.g. no text at all). */
  notAssessed?: boolean
}

export interface ScoreReport {
  mode: Mode
  overall: number
  categories: CategoryScore[]
  topFixes: Issue[]
  /** Facts worth surfacing that are not issues. */
  notes: string[]
}

export interface ScoreContext {
  analysis: Analysis
  mode: Mode
}

/** Internal helper every check returns. */
export interface CheckResult {
  score: number
  summary: string
  issues: Omit<Issue, 'category' | 'impact'>[]
}

export const CATEGORY_META: Record<
  CategoryId,
  { label: string; description: string; weights: Record<Mode, number> }
> = {
  parseability: {
    label: 'Readability for parsers',
    description: 'Columns, tables, graphics, odd symbols and fonts that confuse text extraction.',
    weights: { fresher: 0.18, experienced: 0.18 },
  },
  headings: {
    label: 'Standard section headings',
    description: 'Sections an ATS recognises and the order it expects them in.',
    weights: { fresher: 0.14, experienced: 0.12 },
  },
  contact: {
    label: 'Contact details',
    description: 'Email, phone and LinkedIn that a parser can find and read.',
    weights: { fresher: 0.12, experienced: 0.12 },
  },
  dates: {
    label: 'Date consistency',
    description: 'Dates present on every role and written in one consistent format.',
    weights: { fresher: 0.07, experienced: 0.11 },
  },
  length: {
    label: 'Length and format',
    description: 'Page count, word count and bullet structure.',
    weights: { fresher: 0.11, experienced: 0.09 },
  },
  verbs: {
    label: 'Strong action verbs',
    description: 'Bullets that start with a verb instead of "responsible for".',
    weights: { fresher: 0.09, experienced: 0.1 },
  },
  quantified: {
    label: 'Quantified achievements',
    description: 'Numbers, percentages and money that prove impact.',
    weights: { fresher: 0.08, experienced: 0.12 },
  },
  spelling: {
    label: 'Spelling',
    description: 'Common misspellings and typos that break keyword matching.',
    weights: { fresher: 0.09, experienced: 0.07 },
  },
  keywords: {
    label: 'Keyword variety',
    description: 'A skills section with a healthy mix of specific, searchable terms.',
    weights: { fresher: 0.12, experienced: 0.09 },
  },
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const EXPERIENCE_KINDS: SectionKind[] = ['experience']
