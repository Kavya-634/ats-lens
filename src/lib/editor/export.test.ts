import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildAnalysis } from '../analyze'
import { docFromAnalysis } from './doc'
import { exportDocx } from './exportDocx'
import { exportPdf, sanitise } from './exportPdf'

const TEXT = `Priya Raman
Seattle, WA · priya@example.com · (206) 555-0142 · linkedin.com/in/priya

Summary
Product-minded engineer with 6 years of experience. Rupee sign ₹ and “smart quotes” — handled.

Experience
Senior Engineer, Northwind — Mar 2022 – Present
• Reduced p95 load time from 4.1s to 900ms.
• Mentored four engineers across two teams.

Skills
TypeScript, React, PostgreSQL`

function sampleDoc() {
  return docFromAnalysis(buildAnalysis('sample.pdf', 'pdf', TEXT))
}

describe('exportPdf', () => {
  it('produces a valid, text-based single-page PDF', async () => {
    const bytes = await exportPdf(sampleDoc(), { useObjectStreams: false })
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 8))
    expect(head.startsWith('%PDF-1.')).toBe(true)
    const body = new TextDecoder('latin1').decode(bytes)
    // Standard (non-embedded) Helvetica, no images.
    expect(body).toMatch(/\/BaseFont\s*\/Helvetica/)
    expect(body).not.toMatch(/\/Subtype\s*\/Image/)
    expect((body.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1)
  })

  it('maps characters outside WinAnsi instead of throwing', () => {
    expect(sanitise('₹5 lakh — “done” → ok')).toBe('Rs.5 lakh \u2014 "done" -> ok')
    expect(() => sanitise('日本語')).not.toThrow()
  })
})

describe('exportDocx', () => {
  it('produces a docx with real bullets, no tables, no header/footer, Calibri', async () => {
    const blob = await exportDocx(sampleDoc())
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/<w:numPr>/)
    expect(xml).not.toMatch(/<w:tbl>/)
    expect(xml).not.toMatch(/<w:txbxContent>/)
    expect(xml).not.toMatch(/<w:drawing>/)
    expect(xml).not.toMatch(/<w:cols\b[^>]*w:num="[2-9]"/)
    expect(Object.keys(zip.files).some((n) => /header|footer/.test(n))).toBe(false)
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(styles).toMatch(/w:ascii="Calibri"/)
    // Content survives.
    expect(xml).toContain('Reduced p95 load time from 4.1s to 900ms.')
    expect(xml).toContain('EXPERIENCE')
  })
})
