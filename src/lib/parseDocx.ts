import mammoth from 'mammoth'
import JSZip from 'jszip'
import { ParseError, type LayoutSignals } from './types'

export interface DocxExtraction {
  text: string
  /** Sanitised HTML for the "original" preview. */
  html: string
  messages: string[]
  layout: LayoutSignals
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b)
}

export async function extractDocx(data: ArrayBuffer): Promise<DocxExtraction> {
  const head = new Uint8Array(data.slice(0, 8))
  if (startsWith(head, OLE_MAGIC)) {
    throw new ParseError(
      'legacy-doc',
      'This looks like an old-style .doc file. Please save it as .docx or PDF and try again.',
    )
  }
  if (!startsWith(head, ZIP_MAGIC)) {
    throw new ParseError('corrupt', 'This file does not look like a valid Word document.')
  }

  let textResult: Awaited<ReturnType<typeof mammoth.extractRawText>>
  let htmlResult: Awaited<ReturnType<typeof mammoth.convertToHtml>>
  try {
    ;[textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: data }),
      mammoth.convertToHtml({ arrayBuffer: data }, { ignoreEmptyParagraphs: false }),
    ])
  } catch (err) {
    const message = (err as { message?: string })?.message ?? ''
    if (/encrypted|password/i.test(message)) {
      throw new ParseError('password', 'This Word document is password-protected.')
    }
    if (/zip|central directory|end of data|corrupt|invalid|not a valid/i.test(message)) {
      throw new ParseError('corrupt', 'This Word document appears to be damaged or incomplete.')
    }
    throw new ParseError('unknown', message || 'Something went wrong while reading the document.')
  }

  const messages = [...textResult.messages, ...htmlResult.messages]
    .map((m) => m.message)
    .filter((m, i, arr) => arr.indexOf(m) === i)

  return {
    text: textResult.value,
    html: sanitiseHtml(htmlResult.value),
    messages,
    layout: await inspectDocxLayout(data),
  }
}

const SYMBOLIC_FONT_RE =
  /wingdings|webdings|symbol|dingbat|fontawesome|font awesome|icomoon|material icons|segoe (mdl2|fluent) icons/i

/**
 * Peek inside the .docx package for structure mammoth flattens away:
 * tables, text boxes, multi-column sections, header/footer text and fonts.
 * These are the things ATS parsers most often trip over.
 */
async function inspectDocxLayout(data: ArrayBuffer): Promise<LayoutSignals> {
  const layout: LayoutSignals = {
    source: 'docx',
    fonts: [],
    symbolFonts: [],
    nonEmbeddedFonts: 0,
    imageCount: 0,
    listLikeLines: 0,
    docx: { tables: 0, textBoxes: 0, columnSections: 0, headerFooterText: '' },
  }
  try {
    const zip = await JSZip.loadAsync(data)
    const main = await zip.file('word/document.xml')?.async('string')
    if (main) {
      layout.docx!.tables = count(main, /<w:tbl>/g)
      layout.docx!.textBoxes = count(main, /<w:txbxContent>/g) + count(main, /<wps:txbx>/g)
      layout.docx!.columnSections = (main.match(/<w:cols\b[^>]*w:num="(\d+)"/g) ?? []).filter(
        (m) => Number(/w:num="(\d+)"/.exec(m)?.[1] ?? 1) > 1,
      ).length
      layout.imageCount = count(main, /<w:drawing>/g) + count(main, /<w:pict>/g)
      // Paragraphs that carry list numbering (bullets or numbers).
      layout.listLikeLines = count(main, /<w:numPr>/g)

      // Fonts actually referenced in runs (w:rFonts), plus the document default.
      const fonts = new Set<string>()
      for (const m of main.matchAll(/<w:rFonts\b[^>]*w:(?:ascii|hAnsi)="([^"]+)"/g)) fonts.add(m[1])
      const styles = await zip.file('word/styles.xml')?.async('string')
      if (styles) {
        const def = /<w:rPrDefault>[\s\S]*?<w:rFonts\b[^>]*w:ascii="([^"]+)"/.exec(styles)
        if (def) fonts.add(def[1])
        if (!fonts.size) {
          const normal =
            /<w:style\b[^>]*w:styleId="Normal"[\s\S]*?<w:rFonts\b[^>]*w:ascii="([^"]+)"/.exec(
              styles,
            )
          if (normal) fonts.add(normal[1])
        }
      }
      layout.fonts = [...fonts]
      layout.symbolFonts = layout.fonts.filter((f) => SYMBOLIC_FONT_RE.test(f))
    }

    const hf: string[] = []
    for (const name of Object.keys(zip.files)) {
      if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
        const xml = await zip.file(name)!.async('string')
        const text = xml
          .replace(/<w:tab\/>/g, ' ')
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/[ \t]+/g, ' ')
          .trim()
        if (text) hf.push(text)
      }
    }
    layout.docx!.headerFooterText = hf.join('\n')
  } catch {
    // Layout inspection is best-effort; the text analysis still stands.
  }
  return layout
}

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) ?? []).length
}

/**
 * mammoth output is already limited to a small, safe tag set, but it can
 * include <img src="data:..."> and <a href>. We keep images (they're inline
 * data URLs, never network requests) and neutralise links so nothing can
 * navigate away or trigger a request.
 */
function sanitiseHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement | null
  if (!root) return ''
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      if (name === 'href') {
        el.setAttribute('data-href', attr.value)
        el.removeAttribute('href')
      }
      if (name === 'src' && !attr.value.startsWith('data:image/')) el.removeAttribute('src')
    }
    if (el.tagName === 'SCRIPT' || el.tagName === 'IFRAME' || el.tagName === 'OBJECT') el.remove()
  }
  return root.innerHTML
}
