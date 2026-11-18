import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api'
import { ParseError, type PageTextInfo } from './types'

// Bundle the worker with Vite so nothing is fetched from a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`

/** Pages beyond this are not read; resumes are rarely longer. */
export const MAX_PDF_PAGES = 20

export interface PdfExtraction {
  text: string
  pages: PageTextInfo[]
  totalPages: number
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
    // Never try to reach the network for anything.
    disableAutoFetch: true,
    disableStream: true,
  })
  // Reject immediately on password prompts instead of waiting for input.
  task.onPassword = (_update: (p: string) => void, reason: number) => {
    task.destroy().catch(() => {})
    const needs = reason === pdfjs.PasswordResponses.NEED_PASSWORD
    throw new ParseError(
      'password',
      needs ? 'This PDF is password-protected.' : 'The PDF password could not be verified.',
    )
  }
  try {
    return await task.promise
  } catch (err) {
    throw mapPdfError(err)
  }
}

function mapPdfError(err: unknown): ParseError {
  if (err instanceof ParseError) return err
  const name = (err as { name?: string })?.name ?? ''
  const message = (err as { message?: string })?.message ?? ''
  if (name === 'PasswordException' || /password/i.test(message)) {
    return new ParseError('password', 'This PDF is password-protected.')
  }
  if (name === 'InvalidPDFException' || /invalid|corrupt|header|xref|structure/i.test(message)) {
    return new ParseError('corrupt', 'This file could not be opened as a PDF.')
  }
  if (name === 'MissingPDFException' || name === 'UnexpectedResponseException') {
    return new ParseError('corrupt', 'The PDF data was missing or incomplete.')
  }
  return new ParseError('unknown', message || 'Something went wrong while reading the PDF.')
}

/**
 * Pull text out page-by-page, preserving line breaks the way a simple ATS
 * parser would: items are emitted in content-stream order and joined with
 * newlines when pdf.js reports an end-of-line or when the baseline moves.
 */
export async function extractPdfText(doc: PDFDocumentProxy): Promise<PdfExtraction> {
  const totalPages = doc.numPages
  const pageCount = Math.min(totalPages, MAX_PDF_PAGES)
  const pageTexts: string[] = []
  const pages: PageTextInfo[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lines: string[] = []
    let line = ''
    let lastY: number | null = null
    let lastX: number | null = null

    for (const raw of content.items) {
      if (!('str' in raw)) continue
      const item = raw as TextItem
      const y = item.transform[5] as number
      const x = item.transform[4] as number
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line)
        line = ''
      } else if (
        lastX !== null &&
        line &&
        x - lastX > 1.5 &&
        !line.endsWith(' ') &&
        !item.str.startsWith(' ')
      ) {
        // Noticeable horizontal gap within the same baseline: treat as a space
        // (common when a PDF positions words individually).
        line += ' '
      }
      line += item.str
      lastY = y
      lastX = x + item.width
      if (item.hasEOL) {
        lines.push(line)
        line = ''
        lastY = null
        lastX = null
      }
    }
    if (line) lines.push(line)

    const text = lines.join('\n')
    const hasImages = await pageHasImages(page)
    pages.push({ pageNumber: i, characters: text.replace(/\s/g, '').length, hasImages })
    pageTexts.push(text)
    page.cleanup()
  }

  return { text: pageTexts.join('\n\n'), pages, totalPages }
}

async function pageHasImages(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
): Promise<boolean> {
  try {
    const ops = await page.getOperatorList()
    const imageOps = new Set<number>([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageXObjectRepeat,
      pdfjs.OPS.paintInlineImageXObjectGroup,
    ])
    return ops.fnArray.some((fn: number) => imageOps.has(fn))
  } catch {
    return false
  }
}
