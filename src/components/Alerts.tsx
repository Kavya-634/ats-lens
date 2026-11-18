import { AlertTriangle, FileWarning, Info, Lock, ScanLine, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ParseError, ParseErrorCode, Warning } from '../lib/types'

type Tone = 'danger' | 'warn' | 'info'

function Alert({
  tone,
  icon: Icon,
  title,
  children,
  actions,
}: {
  tone: Tone
  icon: LucideIcon
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="alert__icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <h3>{title}</h3>
        {children}
        {actions ? <div className="alert__actions">{actions}</div> : null}
      </div>
    </div>
  )
}

const ERROR_COPY: Record<ParseErrorCode, { title: string; body: ReactNode; icon: LucideIcon }> = {
  password: {
    icon: Lock,
    title: 'This file is password-protected',
    body: (
      <>
        <p>
          We can’t read it without the password, and neither can an applicant tracking system.
          Recruiters usually won’t have the password either, so a locked resume is often skipped
          entirely.
        </p>
        <ul>
          <li>Open the file, remove the password, and save a fresh copy.</li>
          <li>Or export it again as a new PDF from your editor.</li>
        </ul>
      </>
    ),
  },
  corrupt: {
    icon: FileWarning,
    title: 'We couldn’t open this file',
    body: (
      <>
        <p>
          The file seems damaged or incomplete, so there is no text to show. This sometimes happens
          with interrupted downloads or files renamed to .pdf or .docx.
        </p>
        <ul>
          <li>Try re-exporting the resume from the app you wrote it in.</li>
          <li>Check that it opens normally in a PDF viewer or Word first.</li>
        </ul>
      </>
    ),
  },
  'legacy-doc': {
    icon: FileWarning,
    title: 'Old-style .doc files aren’t supported',
    body: (
      <p>
        Please save the resume as <strong>.docx</strong> or <strong>PDF</strong> and try again. Many
        ATS platforms also handle these modern formats more reliably.
      </p>
    ),
  },
  unsupported: {
    icon: FileWarning,
    title: 'That file type isn’t supported',
    body: (
      <p>ATS Lens reads PDF and Word (.docx) resumes, the two formats most job sites accept.</p>
    ),
  },
  'too-large': {
    icon: FileWarning,
    title: 'This file is too large',
    body: (
      <p>
        Files over 15 MB are skipped to keep things fast. Resumes are usually well under 1 MB; large
        files often contain high-resolution images that an ATS can’t read anyway.
      </p>
    ),
  },
  'empty-file': {
    icon: FileWarning,
    title: 'This file is empty',
    body: <p>The file has no content (0 bytes). Try exporting it again.</p>,
  },
  unknown: {
    icon: AlertTriangle,
    title: 'Something went wrong while reading this file',
    body: <p>Please try again, or export the resume as a fresh PDF and upload that instead.</p>,
  },
}

export function ErrorAlert({ error, onRetry }: { error: ParseError; onRetry: () => void }) {
  const copy = ERROR_COPY[error.code] ?? ERROR_COPY.unknown
  return (
    <Alert
      tone="danger"
      icon={copy.icon}
      title={copy.title}
      actions={
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          Try another file
        </button>
      }
    >
      {copy.body}
    </Alert>
  )
}

export function WarningAlert({ warning }: { warning: Warning }) {
  switch (warning.code) {
    case 'image-only':
      return (
        <Alert tone="warn" icon={ScanLine} title="No readable text was found in this resume">
          <p>
            {warning.pages > 1 ? 'These pages look' : 'This looks'} like a scan or a picture of a
            resume rather than real text. An applicant tracking system reads text, not pixels, so it
            would see an empty document and most likely file your application without a name,
            skills, or experience.
          </p>
          <ul>
            <li>
              Open the original document (Word, Google Docs, Pages) and export it to PDF from there,
              rather than printing and scanning it.
            </li>
            <li>
              If you only have the scan, retype it or run it through an OCR tool, then export the
              text version.
            </li>
            <li>
              Quick check: if you can select and copy text in a PDF viewer, an ATS can read it.
            </li>
          </ul>
        </Alert>
      )
    case 'partial-text':
      return (
        <Alert tone="warn" icon={ScanLine} title="Some pages have no readable text">
          <p>
            {warning.textPages} page{warning.textPages === 1 ? '' : 's'} contained text, but{' '}
            {warning.emptyPages} page{warning.emptyPages === 1 ? ' was' : 's were'} image-only. An
            ATS will skip the image pages completely, so anything on them is invisible.
          </p>
        </Alert>
      )
    case 'no-sections':
      return (
        <Alert
          tone="warn"
          icon={AlertTriangle}
          title="No standard section headings were recognised"
        >
          <p>
            ATS parsers look for familiar headings such as <em>Experience</em>, <em>Education</em>{' '}
            and <em>Skills</em> to decide where each piece of information belongs. Without them,
            your details may end up in the wrong fields or be dropped. Creative headings (e.g.
            “Where I’ve made an impact”) are a common cause.
          </p>
        </Alert>
      )
    case 'no-contact':
      return (
        <Alert tone="warn" icon={AlertTriangle} title="No email address or phone number was found">
          <p>
            Contact details placed in headers, footers, text boxes or images are frequently
            invisible to an ATS. Keep them in the main body near the top of the first page.
          </p>
        </Alert>
      )
    case 'multi-column':
      return (
        <Alert tone="info" icon={Info} title="This layout may read out of order">
          <p>
            The extracted text has many very short lines, which often means a multi-column or
            table-based layout. Some ATS parsers read across columns and jumble the content. Compare
            the two panels to see if the order still makes sense.
          </p>
        </Alert>
      )
    case 'truncated':
      return (
        <Alert tone="info" icon={Info} title={`Showing the first ${warning.pagesShown} pages`}>
          <p>
            This file has {warning.totalPages} pages. Only the first {warning.pagesShown} were read.
          </p>
        </Alert>
      )
    case 'docx-messages':
      return (
        <Alert tone="info" icon={Info} title="Some Word features were skipped">
          <p>
            Parts of this document use features the converter doesn’t fully understand. Many ATS
            parsers skip the same things.
          </p>
          <ul>
            {warning.messages.slice(0, 4).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )
  }
}
