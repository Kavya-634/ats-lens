# ATS Lens

**See your resume the way an applicant tracking system does.**

Upload a PDF or Word resume and ATS Lens gives you an **estimated ATS score out of 100** with a ranked Top 5 fixes, a nine-category breakdown, and issue cards that say what's wrong, why an ATS cares, how serious it is, and how to fix it in plain English. A second tab shows the resume as you see it next to the plain text an ATS actually extracts, with Contact, Summary, Experience, Education, Skills and other sections picked out as labelled blocks. It also tells you, kindly, when a file is a scan with no readable text, is password-protected, or is broken.

**Live:** https://ats-lens-app.vercel.app

Everything runs in your browser. There is no backend, no API key, no analytics, and no upload. Your resume never leaves your device.

## Why

Most job applications are parsed by software before a human reads them. Resumes built with text boxes, columns, icons or exported as images often lose their contact details, headings or whole sections in that step, and the candidate never finds out. ATS Lens makes that invisible step visible.

## Features

- **Drag-and-drop upload** for `.pdf` and `.docx`, plus a one-click **sample resume**.
- **Estimated ATS score (0–100)** with a clear note that it is an estimate based on commonly known ATS practices, not any company's algorithm. A plain-English band (Strong / Decent / Needs work / At risk) sits next to the number.
- **Top 5 fixes** ranked by how many overall points each one is costing, so you know where to start.
- **Nine scored categories**, each expandable into issue cards: readability for parsers (columns, tables, text boxes, header/footer text, graphics, symbol fonts, odd characters, letter-spaced headings), standard section headings and order, contact details (email, phone, LinkedIn, name on line 1, location), date consistency (ranges, mixed formats, future/reversed dates, chronological order), length and format (pages, words, bullets vs paragraphs, personal details), strong action verbs (weak openers, repetition, buzzwords, first person), quantified achievements, spelling (common resume misspellings, doubled words, brand casing), and keyword variety.
- **Every issue is a card**: _What we found_ (with quotes from your resume), _Why an ATS cares_, a **High / Medium / Low** severity, and _How to fix it_.
- **Fresher and Experienced modes.** Expectations differ: Fresher expects Education first, one page, a Projects section and fewer numbers; Experienced expects Experience first, up to two pages and more quantified results. Weights and thresholds change with the mode; the choice is remembered.
- **No fake precision.** Heuristic checks (column detection from line positions, graphics, name detection, some date and bullet inferences) are labelled **“Possible issue”** and ranked below certain ones. Image-only files score 0 with every text-based category marked _Not assessed_ instead of showing hollow 100s. Resumes with no reachable contact or no recognised headings are capped (45 / 55) and told why.
- **Side-by-side view**: original on the left (PDF pages rendered with pdf.js, Word shown as HTML), extracted text on the right.
- **Section detection**: headings are matched against the vocabulary common ATS parsers use (Experience, Work History, Education, Skills, Core Competencies, Projects, Certifications, Awards, Publications, Volunteering, Languages, Interests, References…). Each detected section is a colour-labelled block; the original heading text is shown alongside the label.
- **Contact extraction**: emails, phone numbers and profile links are highlighted as chips.
- **Core-section checklist**: a quick ✓ / – strip for Contact, Summary, Experience, Education, Skills.
- **Raw text tab** to see the exact extraction, line by line.
- **Friendly diagnostics**:
  - Image-only / scanned PDFs → explains that the ATS sees a blank page and how to fix it.
  - Pages that are partly images → warns which pages will be skipped.
  - Password-protected PDFs and Word files → explains why recruiters can't open them either.
  - Corrupt, truncated, empty, oversized, legacy `.doc` or unsupported files → clear next steps.
- **Private by construction**: a strict Content-Security-Policy (`connect-src 'self'`) is set in `vercel.json`, pdf.js fonts/CMaps/WASM are self-hosted, and the only network request the app ever makes is for its own static files.
- **Modern UI**: responsive down to small phones, light and dark mode (follows the OS, with a manual toggle that persists), keyboard-accessible, reduced-motion aware.

## How the parsing works

| Format | Library                                              | What we do                                                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF    | [pdf.js](https://mozilla.github.io/pdf.js/)          | Read text items page by page in content-stream order, insert line breaks when the baseline moves (the same naive top-to-bottom strategy most ATS parsers use). We also check the operator list for image-drawing ops so we can tell a scanned page from an empty one. |
| DOCX   | [mammoth](https://github.com/mwilliamson/mammoth.js) | `extractRawText` for the ATS view and `convertToHtml` (sanitised: no scripts, links neutralised, only `data:` images) for the preview.                                                                                                                                |

Section detection lives in [`src/lib/sections.ts`](src/lib/sections.ts) and is pure TypeScript with unit tests. A line is treated as a heading only if it is short, contains no digits, doesn't end in sentence punctuation, and matches a known heading after stripping bullets, dashes and colons. Lines before the first heading become the Contact/Header block.

### Layout signals

Plain text can't reveal columns or text boxes, so each parser also collects structural facts:

- **PDF**: font names (via `fontExtraProperties`, with subset prefixes stripped), symbol/icon fonts, non-embedded fonts, image-drawing operators per page, and the x/y position of every line start. Column detection looks at how many lines begin in the middle of the page; a strong signal is reported as an issue, a weak one as a _possible issue_. Indented line starts stand in for bullet glyphs that were drawn as vector paths.
- **DOCX**: the package is opened with JSZip and `word/document.xml` is scanned for `<w:tbl>`, `<w:txbxContent>`, `<w:cols w:num>`, `<w:drawing>`, `<w:numPr>` and `<w:rFonts>`; header and footer parts are read for stray contact details.

### Scoring

Scoring lives in [`src/lib/scoring/`](src/lib/scoring/), one file per category, all pure functions with tests. Each check returns a 0–100 score and a list of issues; the overall score is a weighted average (weights differ by mode and sum to 1), then capped when a fatal problem is present. Each issue's _impact_ is its share of the points lost in its category, which is what ranks the Top 5.

This is an approximation. Every ATS vendor is different; the score is a prioritised to-do list, not a prediction of any particular system's output.

## Stack

React 19 · Vite 8 · TypeScript · pdfjs-dist · mammoth · jszip · lucide-react · Vitest · deployed on Vercel.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest unit tests (section detection, contact extraction)
npm run build      # typecheck + production build in dist/
npm run preview    # serve the production build
```

`scripts/sample-resume.html` is the source for the bundled sample; render it to `public/samples/sample-resume.pdf` with headless Chrome:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-pdf-header-footer --print-to-pdf=public/samples/sample-resume.pdf \
  "file://$PWD/scripts/sample-resume.html"
```

`test-fixtures/` holds a scanned (image-only) PDF, a password-protected PDF, a truncated PDF, junk bytes named `.pdf`, a clean `.docx`, a deliberately messy `.docx` (two columns, layout table, Wingdings bullets, contact details in the header, weak bullets, typos) and a fake legacy `.doc` for manually exercising every message in the UI. `scripts/make-fixtures.mjs` and `scripts/make-messy-fixture.mjs` regenerate the Word files.

## Deploying

The repo is set up for Vercel's Vite preset. `vercel.json` adds security headers (CSP, nosniff, frame-ancestors none) and long-lived caching for hashed assets and the self-hosted pdf.js resources. No environment variables are needed.

## Privacy

- No server, no database, no third-party scripts, no fonts from CDNs.
- Files are read with the browser `File` API into memory, parsed in a Web Worker (PDF) or on the main thread (DOCX), and discarded when you leave or click "Check another resume".
- The only thing stored is your light/dark preference in `localStorage`.

## License

MIT
