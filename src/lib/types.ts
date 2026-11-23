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

/** Where each text line starts on a PDF page, in PDF points. */
export interface PageLineStart {
  x: number
  y: number
}

/**
 * Structural facts about the file that plain text can't reveal. Everything
 * here is observed directly (fonts used, XML elements present); the scorer
 * decides how confident to be about what it *means*.
 */
export interface LayoutSignals {
  source: 'pdf' | 'docx'
  /** Distinct font families seen in body text. */
  fonts: string[]
  /** Fonts that map to symbols/icons rather than letters (Wingdings, icon fonts…). */
  symbolFonts: string[]
  /** PDF only: fonts whose file is not embedded. */
  nonEmbeddedFonts: number
  /** Count of raster images or drawings. */
  imageCount: number
  /**
   * Lines that are structurally list items even when no bullet glyph made it
   * into the text: indented line starts (PDF) or numbered paragraphs (DOCX).
   */
  listLikeLines: number
  /** PDF only: page size and where lines begin, for column heuristics. */
  pdfPages?: { width: number; height: number; lineStarts: PageLineStart[] }[]
  /** DOCX only. */
  docx?: {
    tables: number
    textBoxes: number
    /** Sections laid out with more than one column. */
    columnSections: number
    /** Plain text found in headers and footers. */
    headerFooterText: string
  }
}

export type Warning =
  | { code: 'image-only'; pages: number }
  | { code: 'partial-text'; textPages: number; emptyPages: number }
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
  layout: LayoutSignals
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
