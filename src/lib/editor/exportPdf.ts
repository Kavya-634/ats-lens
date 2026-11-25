import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ResumeDoc } from './doc'

/**
 * ATS-friendly PDF: US Letter, single column, Helvetica, real text (no
 * outlines, no images), standard bullets, left-aligned dates. Every string
 * is written with pdf.js-friendly WinAnsi encoding; characters outside it
 * are replaced so the export never throws.
 */
export async function exportPdf(
  doc: ResumeDoc,
  opts: { useObjectStreams?: boolean } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${doc.name || 'Resume'} – Resume`)
  pdf.setProducer('ATS Lens')
  pdf.setCreator('ATS Lens')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const W = 612
  const H = 792
  const M = 54 // 0.75in margins
  const contentW = W - 2 * M
  const black = rgb(0.08, 0.09, 0.12)
  const grey = rgb(0.33, 0.36, 0.42)
  const rule = rgb(0.78, 0.8, 0.84)

  let page = pdf.addPage([W, H])
  let y = H - M

  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H])
      y = H - M
    }
  }

  const write = (
    text: string,
    font: PDFFont,
    size: number,
    opts: { x?: number; color?: typeof black; maxW?: number; lineGap?: number } = {},
  ) => {
    const x = opts.x ?? M
    const maxW = opts.maxW ?? contentW - (x - M)
    const lines = wrap(sanitise(text), font, size, maxW)
    const lh = size * (opts.lineGap ?? 1.32)
    for (const line of lines) {
      ensure(lh)
      page.drawText(line, { x, y: y - size, size, font, color: opts.color ?? black })
      y -= lh
    }
  }

  // Name
  if (doc.name) write(doc.name, bold, 20, { lineGap: 1.2 })
  // Contact line(s)
  const c = doc.contact
  const contactBits = [
    c.location,
    c.email ? `Email: ${c.email}` : '',
    c.phone ? `Phone: ${c.phone}` : '',
    c.linkedin ? `LinkedIn: ${c.linkedin}` : '',
    c.other,
  ].filter(Boolean)
  if (contactBits.length) {
    y -= 2
    write(contactBits.join('  |  '), regular, 9.5, { color: grey })
  }
  y -= 6

  for (const s of doc.sections) {
    const items = s.items.filter((i) => i.text.trim())
    if (!items.length) continue
    // Heading with rule
    ensure(26)
    y -= 8
    page.drawText(sanitise(s.heading).toUpperCase(), {
      x: M,
      y: y - 10,
      size: 10.5,
      font: bold,
      color: black,
    })
    y -= 14
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rule })
    y -= 7

    for (const it of items) {
      if (it.bullet) {
        const indent = 14
        const size = 10
        const lines = wrap(sanitise(it.text), regular, size, contentW - indent)
        const lh = size * 1.32
        ensure(lh)
        page.drawText('\u2022', { x: M + 3, y: y - size, size, font: regular, color: black })
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) ensure(lh)
          page.drawText(lines[i], { x: M + indent, y: y - size, size, font: regular, color: black })
          y -= lh
        }
        y -= 1.5
      } else {
        // Role/company header lines get a touch of weight.
        const isHeaderish =
          it.text.length <= 90 && /(19|20)\d{2}|—|–/.test(it.text) && !/[.;!]$/.test(it.text)
        write(it.text, isHeaderish ? bold : regular, 10, { lineGap: 1.32 })
        y -= 1.5
      }
    }
  }

  // Page numbers if more than one page.
  const pages = pdf.getPages()
  if (pages.length > 1) {
    pages.forEach((p: PDFPage, i: number) => {
      const label = `${i + 1} / ${pages.length}`
      const w = regular.widthOfTextAtSize(label, 8)
      p.drawText(label, { x: W - M - w, y: M / 2, size: 8, font: regular, color: grey })
    })
  }

  return pdf.save({ useObjectStreams: opts.useObjectStreams ?? true })
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(candidate, size) <= maxW) {
      cur = candidate
    } else {
      if (cur) lines.push(cur)
      // Very long tokens (URLs) get hard-split.
      if (font.widthOfTextAtSize(w, size) > maxW) {
        let chunk = ''
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxW) {
            lines.push(chunk)
            chunk = ch
          } else chunk += ch
        }
        cur = chunk
      } else cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

/** Map characters outside WinAnsi to safe equivalents. */
export function sanitise(text: string): string {
  return text
    .replace(/[\u2010-\u2012]/g, '-')
    .replace(/\u2013/g, '\u2013') // en dash is in WinAnsi
    .replace(/\u2014/g, '\u2014') // em dash too
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF\u25AA\u25A0\u25E6\u2023\u2043]/g, '\u2022')
    .replace(/\u2192/g, '->')
    .replace(/\u2713|\u2714/g, 'yes')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u20AC\u2122]/g, (ch) => {
      // Common Indian Rupee sign and others fall outside WinAnsi.
      if (ch === '\u20B9') return 'Rs.'
      return '?'
    })
}
