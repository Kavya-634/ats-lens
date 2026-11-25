import {
  hasOnlyOriginalNumbers,
  type ImproveRequest,
  type ImproveResponse,
  type ImproveStatus,
} from '../../../shared/improve'

let statusCache: Promise<ImproveStatus> | null = null

/** Is the optional AI route configured on this deployment? Cached per session. */
export function improveStatus(): Promise<ImproveStatus> {
  if (!statusCache) {
    statusCache = fetch('/api/improve', { method: 'GET' })
      .then(async (r) => (r.ok ? ((await r.json()) as ImproveStatus) : { available: false }))
      .catch(() => ({ available: false }))
  }
  return statusCache
}

export class ImproveError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export async function improveBullet(req: ImproveRequest): Promise<ImproveResponse> {
  const r = await fetch('/api/improve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  })
  const data = (await r.json().catch(() => ({}))) as Partial<ImproveResponse> & {
    error?: { code?: string; message?: string }
  }
  if (!r.ok) {
    throw new ImproveError(
      data.error?.code ?? 'error',
      data.error?.message ?? `Request failed (${r.status})`,
    )
  }
  // Belt and braces: re-check on the client that no number was invented.
  const suggestions = (data.suggestions ?? []).filter((s) => hasOnlyOriginalNumbers(req.bullet, s))
  if (!suggestions.length)
    throw new ImproveError('no_usable_suggestions', 'No usable rewrites came back. Try again.')
  return { suggestions, provider: data.provider ?? 'anthropic' }
}
