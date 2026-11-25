# ATS Lens

**See your resume the way an applicant tracking system does.**

Upload a PDF or Word resume and ATS Lens gives you an **estimated ATS score out of 100** with a ranked Top 5 fixes, a nine-category breakdown, and issue cards that say what's wrong, why an ATS cares, how serious it is, and how to fix it in plain English. Then **fix it right there, for free**: an editor shows the resume as clean sections, one-click fixes handle headings, bullets, dates, contact labels, spelling and more, the score updates live with a before/after comparison, and you download an ATS-friendly PDF or Word file. A third tab shows the resume as you see it next to the plain text an ATS actually extracts. It also tells you, kindly, when a file is a scan with no readable text, is password-protected, or is broken.

**Live:** https://ats-lens-app.vercel.app

Parsing, scoring, fixing and exporting all run in your browser. There is no database, no analytics, and no upload. Your resume never leaves your device. The one optional exception is the **“Improve with AI”** button, which sends a single bullet (never the whole resume) to a same-origin serverless function; it only appears if the deployment owner has configured a key.

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
- **Fix & download tab.** The parsed resume becomes an editable document: name, labelled contact fields (Email, Phone, LinkedIn, Location, Other), and sections with a type picker, reorder/delete, and per-line bullet/paragraph toggle, add/remove, and undo. Anything the parser got wrong can be corrected by hand.
- **One-click fixes** (deterministic, no AI): standardise headings (relabels “Where I've Worked” → Experience by heading words and content shape), clean bullets & symbols (icon-font junk, odd characters, letter-spaced headings, paragraphs that should be bullets), make dates consistent (every date → `Mon YYYY`, every range → en dash, “to Present”), label contact details (name on line 1, labelled contact line, missing items get `[add email]`-style placeholders), reorder sections for the chosen mode, add missing core sections with placeholder templates, remove personal details (DOB, marital status, nationality, religion, IDs), drop first person, fix spelling and doubled words, fix product-name casing, dedupe skills. Every issue card on the Score tab has a **Fix it** button that jumps to the editor.
- **Weak verbs are flagged, never rewritten silently.** Each bullet that starts with “Responsible for”, “Worked on”, “Helped”, “Assisted”, “Involved in”… gets a list of stronger openers to pick from (Managed / Owned / Led / Delivered…). The rest of the sentence is kept.
- **Live before/after score.** The header shows the original score, the current score of your edits, the delta, and a per-category before/after bar. The “after” score is computed on exactly the text the download will contain.
- **Download as ATS-friendly PDF and Word.** Single column, Helvetica (PDF) / Calibri (DOCX), real text, real list bullets, no tables, text boxes, header/footer or images, US Letter with 0.75in margins, page numbers only when there is more than one page. Re-uploading the download into ATS Lens reproduces the editor's score exactly.
- **Optional “Improve with AI”.** Rewrites one weak bullet into 2–3 options that start with a strong verb and make impact explicit. The model is instructed never to invent facts, numbers, tools or dates; anything it would need but doesn't have is written as `[add number]`, `[add %]`, `[add team size]`. The server and the client both reject any suggestion that contains a number not present in the original bullet. Suggestions are shown as choices, never applied automatically, and placeholders are highlighted in the editor and counted in a warning before download.
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

React 19 · Vite 8 · TypeScript · pdfjs-dist · mammoth · jszip · pdf-lib · docx · lucide-react · Vitest · deployed on Vercel (static + one optional serverless function).

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

The repo is set up for Vercel's Vite preset. `vercel.json` adds security headers (CSP, nosniff, frame-ancestors none) and long-lived caching for hashed assets and the self-hosted pdf.js resources. **No environment variables are needed**; everything except the AI button works without any.

### Enabling the optional AI button

The key lives only on the server, in Vercel's environment variables. It is never bundled into the browser.

1. In Vercel: **Project → Settings → Environment Variables**. Add **one** of:
   - `ANTHROPIC_API_KEY` (preferred; default model `claude-haiku-5-5`), or
   - `OPENAI_API_KEY` (default model `gpt-5.4-mini`).
   - Optional `AI_MODEL` to override the model id.
2. Redeploy. The editor calls `GET /api/improve` on load; if it reports `available: true`, the **Improve with AI** button appears on experience/project bullets. If not, the button is simply absent and nothing else changes.

For local development copy `.env.example` to `.env` and run with `vercel dev` (the Vite dev server alone does not run `api/`). `.env*` is gitignored.

What the function does (`api/improve.ts`): accepts `POST { bullet, mode?, context?: { section?, role? } }` (bullet ≤ 600 chars), rate-limits to 30 requests per IP per 10 minutes, checks same-origin, calls the provider with a system prompt that forbids inventing facts, parses the JSON array reply, drops any suggestion whose digits don't all appear in the original, and returns `{ suggestions, provider }`. Nothing is logged or stored. Only the one bullet plus its section heading and role line are sent.

## Privacy

- No database, no third-party scripts, no fonts from CDNs. The only server code is the optional `/api/improve` function described above, and it is inert unless a key is configured.
- Files are read with the browser `File` API into memory, parsed in a Web Worker (PDF) or on the main thread (DOCX), and discarded when you leave or click "Check another resume".
- Edits live in React state only; nothing is persisted. Downloads are generated in the browser with pdf-lib and docx.
- The only things stored are your light/dark preference and Fresher/Experienced choice in `localStorage`.

## License

MIT
