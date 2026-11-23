import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api'
import { ParseError, type LayoutSignals, type PageTextInfo } from './types'

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
  layout: LayoutSignals
}

export async function openPdf(
  data: ArrayBuffer,
  opts: { fontExtraProperties?: boolean } = {},
): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    cMapUrl: `${ASSET_BASE}cmaps/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
    // Never try to reach the network for anything.
    disableAutoFetch: true,
    disableStream: true,
    // Exposes font names on page.commonObjs so we can report them.
    fontExtraProperties: opts.fontExtraProperties ?? false,
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
  const fonts = new Set<string>()
  const symbolFonts = new Set<string>()
  let nonEmbeddedFonts = 0
  let imageCount = 0
  const pdfPages: NonNullable<LayoutSignals['pdfPages']> = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    // Operator list first: it loads font objects and lets us count images.
    const ops = await safeOperatorList(page)
    imageCount += ops?.images ?? 0
    const content = await page.getTextContent()
    const lines: string[] = []
    let line = ''
    let lastY: number | null = null
    let lastX: number | null = null
    const lineStarts: { x: number; y: number }[] = []
    const seenFontIds = new Set<string>()

    for (const raw of content.items) {
      if (!('str' in raw)) continue
      const item = raw as TextItem
      const y = item.transform[5] as number
      const x = item.transform[4] as number
      if (item.fontName && !seenFontIds.has(item.fontName)) {
        seenFontIds.add(item.fontName)
        const info = describeFont(page, item.fontName)
        if (info) {
          fonts.add(info.family)
          if (info.symbolic) symbolFonts.add(info.family)
          if (!info.embedded) nonEmbeddedFonts++
        }
      }
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
      if (!line && item.str.trim()) lineStarts.push({ x, y })
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
    pages.push({
      pageNumber: i,
      characters: text.replace(/\s/g, '').length,
      hasImages: (ops?.images ?? 0) > 0,
    })
    pageTexts.push(text)
    const vp = page.getViewport({ scale: 1 })
    pdfPages.push({ width: vp.width, height: vp.height, lineStarts })
    page.cleanup()
  }

  // Bullet glyphs drawn as vector paths or via symbol fonts never reach the
  // text layer, but the lines they introduce are still indented relative to
  // the body margin. Count those so the format check doesn't mistake a
  // bulleted PDF for prose.
  const listLikeLines = countIndentedLines(pdfPages)

  return {
    text: pageTexts.join('\n\n'),
    pages,
    totalPages,
    layout: {
      source: 'pdf',
      fonts: [...fonts],
      symbolFonts: [...symbolFonts],
      nonEmbeddedFonts,
      imageCount,
      listLikeLines,
      pdfPages,
    },
  }
}

function countIndentedLines(pages: NonNullable<LayoutSignals['pdfPages']>): number {
  let n = 0
  for (const p of pages) {
    const xs = p.lineStarts.map((l) => Math.round(l.x))
    if (xs.length < 4) continue
    // The body margin is the most common line start on the left half of the page.
    const freq = new Map<number, number>()
    for (const x of xs) if (x < p.width / 2) freq.set(x, (freq.get(x) ?? 0) + 1)
    const margin = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (margin === undefined) continue
    // Indented by 6–40pt from the margin: typical hanging indent of a list.
    n += xs.filter((x) => x - margin >= 6 && x - margin <= 40).length
  }
  return n
}

type PdfPage = Awaited<ReturnType<PDFDocumentProxy['getPage']>>

async function safeOperatorList(page: PdfPage): Promise<{ images: number } | null> {
  try {
    const ops = await page.getOperatorList()
    const imageOps = new Set<number>([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageXObjectRepeat,
      pdfjs.OPS.paintInlineImageXObjectGroup,
    ])
    return { images: ops.fnArray.filter((fn: number) => imageOps.has(fn)).length }
  } catch {
    return null
  }
}

const SYMBOLIC_FONT_RE =
  /wingdings|webdings|symbol|dingbat|zapf|fontawesome|font-awesome|icomoon|material.?icons|glyphicons|segoe.?(mdl2|fluent).?icons|awesome/i

interface FontInfo {
  family: string
  symbolic: boolean
  embedded: boolean
}

/**
 * Read a font's real name from pdf.js's shared object store. Subset prefixes
 * ("ABCDEF+Georgia-Bold") and style suffixes are stripped so we can talk
 * about families, which is what a reader actually perceives.
 */
function describeFont(page: PdfPage, id: string): FontInfo | null {
  try {
    if (!page.commonObjs.has(id)) return null
    const font = page.commonObjs.get(id) as {
      name?: string
      fallbackName?: string
      missingFile?: boolean
      isType3Font?: boolean
    } | null
    if (!font) return null
    const raw = font.name ?? font.fallbackName ?? id
    const family = raw
      .replace(/^[A-Z]{6}\+/, '')
      .replace(
        /[-,_ ]?(Bold|Italic|Oblique|Regular|Light|Medium|Semi[Bb]old|Black|Heavy|Thin|MT|PS|PSMT|Roman|Book|Demi)+$/g,
        '',
      )
      .replace(/[-,_]+$/, '')
      .trim()
    return {
      family: family || raw,
      symbolic: SYMBOLIC_FONT_RE.test(raw) || Boolean(font.isType3Font),
      embedded: !font.missingFile,
    }
  } catch {
    return null
  }
}
