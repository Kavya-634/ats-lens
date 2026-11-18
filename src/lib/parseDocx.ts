import mammoth from 'mammoth'
import { ParseError } from './types'

export interface DocxExtraction {
  text: string
  /** Sanitised HTML for the "original" preview. */
  html: string
  messages: string[]
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
  }
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
