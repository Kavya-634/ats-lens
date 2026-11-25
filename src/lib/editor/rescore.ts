import { buildAnalysis } from '../analyze'
import { scoreResume, type Mode, type ScoreReport } from '../scoring'
import type { Analysis, LayoutSignals } from '../types'
import { docToText, type ResumeDoc } from './doc'

/**
 * Layout the exported file will have: single column, one standard font, no
 * images, every bullet a real list item. Scoring the edited document against
 * this is honest because that is exactly what Download produces.
 */
export function exportLayout(doc: ResumeDoc): LayoutSignals {
  const bullets = doc.sections.reduce((n, s) => n + s.items.filter((i) => i.bullet).length, 0)
  return {
    source: 'pdf',
    fonts: ['Helvetica'],
    symbolFonts: [],
    nonEmbeddedFonts: 0,
    imageCount: 0,
    listLikeLines: bullets,
  }
}

export function analyseDoc(doc: ResumeDoc, fileName: string): Analysis {
  const text = docToText(doc)
  const a = buildAnalysis(fileName, 'pdf', text, exportLayout(doc))
  // One page per ~550 words is the export's real pagination; the exporter
  // uses the same estimate when deciding whether to warn.
  const pages = Math.max(1, Math.ceil(a.stats.words / 550))
  a.pages = Array.from({ length: pages }, (_, i) => ({
    pageNumber: i + 1,
    characters: Math.round(a.stats.characters / pages),
    hasImages: false,
  }))
  return a
}

export function scoreDoc(doc: ResumeDoc, fileName: string, mode: Mode): ScoreReport {
  return scoreResume(analyseDoc(doc, fileName), mode)
}
