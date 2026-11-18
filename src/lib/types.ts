export type SectionKind =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'awards'
  | 'publications'
  | 'volunteering'
  | 'languages'
  | 'interests'
  | 'references'
  | 'other'

export interface DetectedSection {
  kind: SectionKind
  /** The heading exactly as it appeared in the resume, or a generated label. */
  heading: string
  /** Lines belonging to this section (heading excluded). */
  lines: string[]
}

export interface ContactInfo {
  emails: string[]
  phones: string[]
  urls: string[]
}

export interface Stats {
  words: number
  characters: number
  lines: number
}

export interface PageTextInfo {
  pageNumber: number
  characters: number
  hasImages: boolean
}

export type Warning =
  | { code: 'image-only'; pages: number }
  | { code: 'partial-text'; textPages: number; emptyPages: number }
  | { code: 'no-sections' }
  | { code: 'no-contact' }
  | { code: 'multi-column' }
  | { code: 'docx-messages'; messages: string[] }
  | { code: 'truncated'; pagesShown: number; totalPages: number }

export interface Analysis {
  fileName: string
  fileType: 'pdf' | 'docx'
  rawText: string
  sections: DetectedSection[]
  contact: ContactInfo
  stats: Stats
  warnings: Warning[]
  pages?: PageTextInfo[]
}

export type ParseErrorCode =
  'password' | 'corrupt' | 'unsupported' | 'legacy-doc' | 'too-large' | 'empty-file' | 'unknown'

export class ParseError extends Error {
  code: ParseErrorCode
  constructor(code: ParseErrorCode, message: string) {
    super(message)
    this.name = 'ParseError'
    this.code = code
  }
}

export type OriginalPreview =
  /** PDFs are re-rendered page by page with pdf.js; keep the bytes around. */
  | { kind: 'pdf'; data: ArrayBuffer }
  /** DOCX files are shown as sanitised HTML from mammoth. */
  | { kind: 'html'; html: string }
