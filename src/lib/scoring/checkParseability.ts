import type { Analysis } from '../types'
import type { CheckResult } from './types'
import { clamp, sample, truncate } from './text'

/**
 * Readability for parsers. Most of these are inferred from layout signals,
 * so several are flagged as uncertain ("possible issue").
 */
export function checkParseability(analysis: Analysis): CheckResult {
  const issues: CheckResult['issues'] = []
  const { layout, rawText, stats } = analysis
  let score = 100

  // --- Image-only / no text at all -----------------------------------------
  if (stats.words === 0) {
    issues.push({
      id: 'no-text',
      severity: 'high',
      title: 'The file contains no readable text',
      detail: 'Every page is an image (a scan or screenshot). Zero words were extracted.',
      why: 'An ATS indexes text. With none, your name, skills and experience are simply absent from the database and no keyword search will ever surface you.',
      fix: 'Export the resume as a PDF directly from Word, Google Docs or your editor instead of printing and scanning. If you only have the image, retype it or run OCR and export the text version.',
    })
    return { score: 0, summary: 'No text could be read from this file.', issues }
  }

  // --- Partial image pages --------------------------------------------------
  if (analysis.pages) {
    const empty = analysis.pages.filter((p) => p.characters < 20)
    if (empty.length) {
      score -= 30
      issues.push({
        id: 'image-pages',
        severity: 'high',
        title: `${empty.length} page${empty.length > 1 ? 's are' : ' is'} image-only`,
        detail: `Page${empty.length > 1 ? 's' : ''} ${empty.map((p) => p.pageNumber).join(', ')} contain${empty.length > 1 ? '' : 's'} no extractable text.`,
        why: 'Whatever is on those pages is invisible to the parser, often an entire experience or skills block.',
        fix: 'Re-export from the original document so every page is real text, not a picture.',
      })
    }
  }

  // --- Columns / tables -----------------------------------------------------
  const columns = detectColumns(analysis)
  if (columns.likely) {
    score -= columns.strong ? 22 : 12
    issues.push({
      id: 'columns',
      severity: columns.strong ? 'high' : 'medium',
      uncertain: !columns.strong,
      title: columns.strong
        ? 'Multi-column layout detected'
        : 'Layout may use columns or a sidebar',
      detail: columns.detail,
      why: 'Many parsers read straight across the page. Text from two columns gets interleaved, so a skill ends up inside a job title and dates detach from their roles.',
      fix: 'Use a single-column layout. If you want a sidebar look, keep it for a human-only version and submit the single-column one to job portals.',
    })
  }
  if (layout.docx && layout.docx.tables > 0) {
    score -= Math.min(20, 8 + layout.docx.tables * 4)
    issues.push({
      id: 'tables',
      severity: layout.docx.tables >= 2 ? 'high' : 'medium',
      title: `${layout.docx.tables} table${layout.docx.tables > 1 ? 's' : ''} used for layout`,
      detail: `The Word file contains ${layout.docx.tables} table${layout.docx.tables > 1 ? 's' : ''}. Resumes usually use tables to position text, not to show tabular data.`,
      why: 'Table cells are read in an order the parser chooses, not the one you see. Headings can be split from their content, and some older parsers drop table text entirely.',
      fix: 'Replace tables with plain paragraphs and tab stops. Skills grids work fine as a comma-separated line.',
    })
  }
  if (layout.docx && layout.docx.textBoxes > 0) {
    score -= Math.min(25, 10 + layout.docx.textBoxes * 5)
    issues.push({
      id: 'textboxes',
      severity: 'high',
      title: `${layout.docx.textBoxes} text box${layout.docx.textBoxes > 1 ? 'es' : ''} found`,
      detail:
        'Text boxes float above the page and are stored separately from the main document body.',
      why: 'Most ATS parsers skip text boxes entirely. If your name or contact details sit in one, the application may arrive anonymous.',
      fix: 'Cut the text out of every text box and paste it into the normal document flow.',
    })
  }

  // --- Header / footer ------------------------------------------------------
  if (layout.docx?.headerFooterText) {
    const hf = layout.docx.headerFooterText
    const hasContact = /@|\+?\d[\d\s().-]{7,}\d|linkedin/i.test(hf)
    score -= hasContact ? 18 : 5
    issues.push({
      id: 'header-footer',
      severity: hasContact ? 'high' : 'low',
      title: hasContact
        ? 'Contact details are in the page header or footer'
        : 'Text is placed in the page header or footer',
      detail: `Header/footer text: “${truncate(hf.replace(/\n/g, ' · '), 100)}”`,
      why: hasContact
        ? 'Header and footer regions are commonly ignored by parsers, so your email and phone may never reach the recruiter’s database.'
        : 'Header/footer text is often ignored or repeated on every page by parsers, which can confuse section detection.',
      fix: 'Move your name and contact line into the body at the very top of the first page.',
    })
  }

  // --- Graphics -------------------------------------------------------------
  if (layout.imageCount > 0 && stats.words > 0) {
    const heavy = layout.imageCount >= 4
    score -= heavy ? 10 : 4
    issues.push({
      id: 'graphics',
      severity: heavy ? 'medium' : 'low',
      uncertain: true,
      title: `${layout.imageCount} image${layout.imageCount > 1 ? 's' : ''} or graphic${layout.imageCount > 1 ? 's' : ''} in the file`,
      detail: heavy
        ? 'Several graphics were found. On resumes these are usually icons, skill bars, charts or a photo.'
        : 'A graphic was found, often a logo, photo or decorative line.',
      why: 'Icons and skill-level bars carry meaning a parser can’t read (“5 stars in Python” becomes nothing). Photos can also trigger bias-avoidance rules that reject the file.',
      fix: 'Replace icons with words (write “Email:” instead of an envelope) and skill bars with a plain list. Drop the photo unless the local job market expects one.',
    })
  }

  // --- Fonts ----------------------------------------------------------------
  if (layout.symbolFonts.length) {
    score -= 10
    issues.push({
      id: 'symbol-fonts',
      severity: 'medium',
      title: 'Symbol or icon fonts are in use',
      detail: `Found: ${layout.symbolFonts.join(', ')}.`,
      why: 'Characters from these fonts extract as the wrong letters or as boxes (e.g. a Wingdings phone icon becomes “(”). That junk ends up inside your text.',
      fix: 'Use standard bullets (•) and plain text labels. Stick to one or two common fonts such as Calibri, Arial, Georgia or Helvetica.',
    })
  }
  const realFonts = layout.fonts.filter((f) => !layout.symbolFonts.includes(f))
  if (realFonts.length > 3) {
    score -= 5
    issues.push({
      id: 'many-fonts',
      severity: 'low',
      title: `${realFonts.length} different fonts in one document`,
      detail: truncate(realFonts.join(', '), 120),
      why: 'Not an ATS blocker by itself, but many fonts usually mean a heavily designed template, and those correlate with the layout problems above. It also looks busy to a reader.',
      fix: 'Pick one font for body text and at most one for headings.',
    })
  }
  if (layout.source === 'pdf' && layout.nonEmbeddedFonts > 0 && realFonts.length > 0) {
    const common = /^(Arial|Helvetica|Times|Georgia|Calibri|Cambria|Verdana|Garamond|Courier)/i
    const uncommon = realFonts.filter((f) => !common.test(f))
    if (uncommon.length) {
      score -= 4
      issues.push({
        id: 'non-embedded-fonts',
        severity: 'low',
        uncertain: true,
        title: 'Some fonts are not embedded in the PDF',
        detail: `${layout.nonEmbeddedFonts} font${layout.nonEmbeddedFonts > 1 ? 's' : ''} rely on being installed on the reader’s machine.`,
        why: 'When a parser lacks the font it may substitute and mis-map characters, especially for ligatures (fi, fl) and special glyphs.',
        fix: 'In the export dialog choose “Embed all fonts”, or use a widely available font.',
      })
    }
  }

  // --- Odd characters -------------------------------------------------------
  const odd = findOddCharacters(rawText)
  if (odd.count > 0) {
    const bad = odd.count > 10
    score -= bad ? 12 : 5
    issues.push({
      id: 'odd-chars',
      severity: bad ? 'medium' : 'low',
      title: `${odd.count} unusual character${odd.count > 1 ? 's' : ''} in the extracted text`,
      detail: `Examples: ${odd.examples.map((c) => `“${c}”`).join(' ')}. These are private-use glyphs, replacement characters or control codes.`,
      why: 'They show the parser could not map some glyphs to real letters. Any word containing one will fail a keyword match.',
      fix: 'Find the icons or special bullets producing them and swap for plain text. Re-export the PDF and check this view again.',
      evidence: sample(odd.lines),
    })
  }

  // --- Ligatures / spaced-out letters --------------------------------------
  const spaced = (rawText.match(/\b(?:[A-Z] ){3,}[A-Z]\b/g) ?? []).length
  if (spaced > 0) {
    score -= 6
    issues.push({
      id: 'letter-spacing',
      severity: 'medium',
      title: 'Headings extract with spaces between letters',
      detail: `${spaced} heading${spaced > 1 ? 's' : ''} came out like “E X P E R I E N C E”.`,
      why: 'Wide letter-spacing (tracking) makes parsers emit each letter as its own word, so the heading is no longer recognised as “Experience”.',
      fix: 'Reduce letter-spacing on headings to normal. Use bold or size for emphasis instead.',
      evidence: sample(rawText.match(/\b(?:[A-Z] ){3,}[A-Z]\b/g) ?? []),
    })
  }

  const summary =
    issues.length === 0
      ? 'Single-column text with standard fonts. Nothing here should trip a parser.'
      : `${issues.length} formatting risk${issues.length > 1 ? 's' : ''} found.`
  return { score: clamp(score), summary, issues }
}

function detectColumns(analysis: Analysis): { likely: boolean; strong: boolean; detail: string } {
  const { layout } = analysis
  if (layout.docx) {
    if (layout.docx.columnSections > 0) {
      return {
        likely: true,
        strong: true,
        detail: `${layout.docx.columnSections} section${layout.docx.columnSections > 1 ? 's' : ''} of the Word file ${layout.docx.columnSections > 1 ? 'are' : 'is'} set to multiple columns.`,
      }
    }
    return { likely: false, strong: false, detail: '' }
  }

  // PDF: look at where lines begin. Single-column resumes start almost every
  // line at one or two x positions (margin + bullet indent). A second cluster
  // in the right half of the page with many lines suggests a column.
  if (!layout.pdfPages?.length) return { likely: false, strong: false, detail: '' }
  let total = 0
  let rightStarts = 0
  let midStarts = 0
  for (const p of layout.pdfPages) {
    for (const ls of p.lineStarts) {
      total++
      const rel = ls.x / p.width
      if (rel > 0.45 && rel < 0.75) midStarts++
      if (rel >= 0.75) rightStarts++
    }
  }
  if (total < 15) return { likely: false, strong: false, detail: '' }
  const midRatio = midStarts / total
  if (midRatio > 0.35) {
    return {
      likely: true,
      strong: true,
      detail: `${Math.round(midRatio * 100)}% of lines begin near the middle of the page, which is typical of a two-column design.`,
    }
  }
  // Mid-page starts between 18% and 35% could be a right-aligned date column
  // (fine) or a real sidebar. Flag as possible.
  if (midRatio > 0.18) {
    return {
      likely: true,
      strong: false,
      detail: `${Math.round(midRatio * 100)}% of lines begin in the middle of the page. That can be a narrow sidebar, or just right-aligned dates, which are harmless.`,
    }
  }
  return { likely: false, strong: false, detail: '' }
}

function findOddCharacters(text: string): { count: number; examples: string[]; lines: string[] } {
  // Private Use Area, replacement char, C0/C1 controls (except tab/newline), BOM.
  // eslint-disable-next-line no-control-regex
  const re = /[\uE000-\uF8FF\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
  const matches = text.match(re) ?? []
  const examples = [...new Set(matches)].slice(0, 4).map((c) => {
    const code = c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
    return c === '\uFFFD' ? '�' : `U+${code}`
  })
  const lines = text.split('\n').filter((l) => re.test(l))
  return { count: matches.length, examples, lines }
}
