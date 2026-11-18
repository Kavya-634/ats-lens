import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import fs from 'node:fs'

// Encrypted PDF (pdf-lib can't encrypt; use qpdf if present, else skip). We'll build a DOCX instead and a password PDF via qpdf if available.
const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Jordan Lee', bold: true, size: 44 })] }),
        new Paragraph(
          'Austin, TX | jordan.lee@example.com | +1 512 555 0199 | linkedin.com/in/jordanlee',
        ),
        new Paragraph({ text: 'Professional Summary', heading: HeadingLevel.HEADING_2 }),
        new Paragraph(
          'Marketing analyst with four years of experience turning campaign data into decisions.',
        ),
        new Paragraph({ text: 'Work Experience', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Marketing Analyst, Lumen Retail', bold: true }),
            new TextRun(' — 2021–Present'),
          ],
        }),
        new Paragraph({
          text: 'Built attribution dashboards in Looker used by a 30-person team.',
          bullet: { level: 0 },
        }),
        new Paragraph({
          text: 'Cut reporting time by 60% by automating weekly exports with Python.',
          bullet: { level: 0 },
        }),
        new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('B.A. Economics, University of Texas at Austin, 2020'),
        new Paragraph({ text: 'Skills', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('SQL, Python (pandas), Looker, Google Analytics, Excel, A/B testing'),
      ],
    },
  ],
})
fs.writeFileSync('test-fixtures/sample.docx', await Packer.toBuffer(doc))

// Legacy-looking .doc (OLE header)
fs.writeFileSync(
  'test-fixtures/legacy.doc',
  Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]),
)
console.log('ok')
