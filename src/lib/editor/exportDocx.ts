import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx'
import type { ResumeDoc } from './doc'

/**
 * ATS-friendly Word file: single column, Calibri/Arial fallback, real bullet
 * numbering (w:numPr), no tables, no text boxes, no header/footer, nothing
 * in images. Headings are plain bold paragraphs, not Word heading styles,
 * because some parsers skip styled headings' text.
 */
export async function exportDocx(doc: ResumeDoc): Promise<Blob> {
  const font = 'Calibri'
  const children: Paragraph[] = []

  if (doc.name) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: doc.name, bold: true, size: 40, font })],
      }),
    )
  }
  const c = doc.contact
  const contactBits = [
    c.location,
    c.email ? `Email: ${c.email}` : '',
    c.phone ? `Phone: ${c.phone}` : '',
    c.linkedin ? `LinkedIn: ${c.linkedin}` : '',
    c.other,
  ].filter(Boolean)
  if (contactBits.length) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({ text: contactBits.join('  |  '), size: 19, font, color: '555B66' }),
        ],
      }),
    )
  }

  for (const s of doc.sections) {
    const items = s.items.filter((i) => i.text.trim())
    if (!items.length) continue
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 60 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C8CCD4', space: 2 },
        },
        children: [new TextRun({ text: s.heading.toUpperCase(), bold: true, size: 21, font })],
      }),
    )
    for (const it of items) {
      if (it.bullet) {
        children.push(
          new Paragraph({
            numbering: { reference: 'ats-bullets', level: 0 },
            spacing: { after: 40 },
            children: [new TextRun({ text: it.text, size: 20, font })],
          }),
        )
      } else {
        const isHeaderish =
          it.text.length <= 90 && /(19|20)\d{2}|—|–/.test(it.text) && !/[.;!]$/.test(it.text)
        children.push(
          new Paragraph({
            spacing: { before: isHeaderish ? 80 : 0, after: 40 },
            children: [new TextRun({ text: it.text, bold: isHeaderish, size: 20, font })],
          }),
        )
      }
    }
  }

  const document = new Document({
    creator: 'ATS Lens',
    title: `${doc.name || 'Resume'} – Resume`,
    styles: {
      default: { document: { run: { font, size: 20 } } },
    },
    numbering: {
      config: [
        {
          reference: 'ats-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.18) },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
            margin: {
              top: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
        },
        children,
      },
    ],
  })
  return Packer.toBlob(document)
}
