// Generates test-fixtures/messy.docx: a "designed" resume with the things
// ATS parsers trip on: a 2-column section, a layout table, a text box,
// contact details in the header, Wingdings bullets, and weak bullet text.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Header,
  Footer,
  HeadingLevel,
  AlignmentType,
} from 'docx'
import fs from 'node:fs'

const wing = (t) =>
  new Paragraph({ children: [new TextRun({ text: '\u00A7 ', font: 'Wingdings' }), new TextRun(t)] })

const doc = new Document({
  styles: { default: { document: { run: { font: 'Montserrat' } } } },
  sections: [
    {
      properties: { column: { count: 2, space: 400 } },
      headers: {
        default: new Header({
          children: [
            new Paragraph(
              'Rohan Mehta | rohan.mehta@example.com | +91 98765 43210 | linkedin.com/in/rohanmehta',
            ),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({ text: 'Page 1', alignment: AlignmentType.CENTER })],
        }),
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: 'ROHAN MEHTA', bold: true, size: 40, font: 'Playfair Display' }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Marketing Professional', italics: true, font: 'Lato' })],
        }),
        new Paragraph({ text: 'My Story', heading: HeadingLevel.HEADING_2 }),
        new Paragraph(
          'I am a passionate, results-driven team player with excelent comunication skills and a proven track record.',
        ),
        new Paragraph({ text: 'Where I\u2019ve Worked', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Marketing Executive, Zenith Retail', bold: true }),
            new TextRun(' \u2014 03/2021 to Present'),
          ],
        }),
        wing('Responsible for managing social media accounts and various campaigns.'),
        wing('Worked on the the newsletter and helped the design team with many tasks.'),
        wing('Involved in planning events and was in charge of vendor coordination.'),
        new Paragraph({
          children: [
            new TextRun({ text: 'Marketing Intern, Bright Ideas Agency', bold: true }),
            new TextRun(' \u2014 Jan 2020 \u2013 Dec 2020'),
          ],
        }),
        wing('Assisted senior staff with reports.'),
        wing('Participated in brainstorming sessions and did market research.'),
        new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('BBA Marketing, Symbiosis University, 2017-2020'),
        new Paragraph({ text: 'What I Know', heading: HeadingLevel.HEADING_2 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Communication')] }),
                new TableCell({ children: [new Paragraph('Teamwork')] }),
                new TableCell({ children: [new Paragraph('MS Office')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Leadership')] }),
                new TableCell({ children: [new Paragraph('Hard working')] }),
                new TableCell({ children: [new Paragraph('Canva')] }),
              ],
            }),
          ],
        }),
        new Paragraph({ text: 'Personal Details', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Date of Birth: 12 May 1998 | Marital Status: Single | Nationality: Indian'),
      ],
    },
  ],
})
fs.writeFileSync('test-fixtures/messy.docx', await Packer.toBuffer(doc))
console.log('wrote test-fixtures/messy.docx')
