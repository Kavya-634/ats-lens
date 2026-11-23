import { computeStats, detectSections, extractContact, normaliseText } from './sections'
import {
  ParseError,
  type Analysis,
  type LayoutSignals,
  type OriginalPreview,
  type Warning,
} from './types'

export const MAX_FILE_BYTES = 15 * 1024 * 1024

export interface AnalysisResult {
  analysis: Analysis
  preview: OriginalPreview
}

export type FileKind = 'pdf' | 'docx' | 'doc' | 'unsupported'

export function detectFileKind(file: File): FileKind {
  const name = file.name.toLowerCase()
  const type = file.type
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  )
    return 'docx'
  if (type === 'application/msword' || name.endsWith('.doc')) return 'doc'
  return 'unsupported'
}

export async function analyseFile(file: File): Promise<AnalysisResult> {
  if (file.size === 0) throw new ParseError('empty-file', 'This file is empty (0 bytes).')
  if (file.size > MAX_FILE_BYTES)
    throw new ParseError('too-large', 'This file is larger than 15 MB.')

  const kind = detectFileKind(file)
  if (kind === 'doc') {
    throw new ParseError(
      'legacy-doc',
      'Old-style .doc files are not supported. Save it as .docx or PDF and try again.',
    )
  }
  if (kind === 'unsupported') {
    throw new ParseError('unsupported', 'Only PDF and Word (.docx) files are supported.')
  }

  const buffer = await file.arrayBuffer()
  return kind === 'pdf' ? analysePdf(file, buffer) : analyseDocx(file, buffer)
}

async function analysePdf(file: File, buffer: ArrayBuffer): Promise<AnalysisResult> {
  // Parsers are code-split so the landing page stays light.
  const { extractPdfText, openPdf, MAX_PDF_PAGES } = await import('./parsePdf')
  // pdf.js transfers the buffer to its worker; keep a copy for the preview.
  const previewData = buffer.slice(0)
  const doc = await openPdf(buffer, { fontExtraProperties: true })
  try {
    const { text, pages, totalPages, layout } = await extractPdfText(doc)
    const analysis = buildAnalysis(file.name, 'pdf', text, layout)
    analysis.pages = pages

    const emptyPages = pages.filter((p) => p.characters < 20)
    if (emptyPages.length === pages.length) {
      analysis.warnings.unshift({ code: 'image-only', pages: pages.length })
    } else if (emptyPages.length > 0) {
      analysis.warnings.unshift({
        code: 'partial-text',
        textPages: pages.length - emptyPages.length,
        emptyPages: emptyPages.length,
      })
    }
    if (totalPages > MAX_PDF_PAGES) {
      analysis.warnings.push({ code: 'truncated', pagesShown: MAX_PDF_PAGES, totalPages })
    }
    return { analysis, preview: { kind: 'pdf', data: previewData } }
  } finally {
    doc.loadingTask.destroy().catch(() => {})
  }
}

async function analyseDocx(file: File, buffer: ArrayBuffer): Promise<AnalysisResult> {
  const { extractDocx } = await import('./parseDocx')
  const { text, html, messages, layout } = await extractDocx(buffer)
  const analysis = buildAnalysis(file.name, 'docx', text, layout)
  if (analysis.stats.words === 0) {
    analysis.warnings.unshift({ code: 'image-only', pages: 1 })
  }
  if (messages.length) analysis.warnings.push({ code: 'docx-messages', messages })
  return { analysis, preview: { kind: 'html', html } }
}

export const EMPTY_LAYOUT: LayoutSignals = {
  source: 'pdf',
  fonts: [],
  symbolFonts: [],
  nonEmbeddedFonts: 0,
  imageCount: 0,
  listLikeLines: 0,
}

export function buildAnalysis(
  fileName: string,
  fileType: 'pdf' | 'docx',
  rawText: string,
  layout: LayoutSignals = { ...EMPTY_LAYOUT, source: fileType },
): Analysis {
  const text = normaliseText(rawText)
  const sections = detectSections(text)
  const contact = extractContact(text)
  const stats = computeStats(text)
  const warnings: Warning[] = []
  return { fileName, fileType, rawText: text, sections, contact, stats, warnings, layout }
}
