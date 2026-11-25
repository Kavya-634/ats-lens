import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  IMPROVE_SYSTEM_PROMPT,
  buildImproveUserPrompt,
  hasOnlyOriginalNumbers,
  parseSuggestions,
  type ImproveRequest,
  type ImproveResponse,
  type ImproveStatus,
} from '../shared/improve.js'

/**
 * Optional AI bullet rewriter. The key lives only here, in Vercel
 * environment variables, never in the browser bundle.
 *
 *   ANTHROPIC_API_KEY   (preferred)  or   OPENAI_API_KEY
 *   AI_MODEL            optional override of the default model id
 *
 * GET  /api/improve  -> { available: boolean, provider? }
 * POST /api/improve  -> { suggestions: string[], provider }
 *
 * Only the single bullet plus its section/role line is sent; the rest of the
 * resume never leaves the browser. Nothing is logged or stored.
 */
export const config = { maxDuration: 30 }

const MAX_BULLET = 600
const RATE: Map<string, { n: number; reset: number }> = new Map()
const RATE_LIMIT = 30 // per IP per 10 minutes

const HEADERS = {
  'Cache-Control': 'no-store, private, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

function provider(): { kind: 'anthropic' | 'openai'; key: string; model: string } | null {
  const a = process.env.ANTHROPIC_API_KEY
  if (a) return { kind: 'anthropic', key: a, model: process.env.AI_MODEL || 'claude-haiku-5-5' }
  const o = process.env.OPENAI_API_KEY
  if (o) return { kind: 'openai', key: o, model: process.env.AI_MODEL || 'gpt-5.4-mini' }
  return null
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, HEADERS)
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 8_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8')
      if (data.length > limit) {
        reject(new Error('too_large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const e = RATE.get(ip)
  if (!e || e.reset < now) {
    RATE.set(ip, { n: 1, reset: now + 10 * 60_000 })
    return false
  }
  e.n += 1
  return e.n > RATE_LIMIT
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const p = provider()

  if (req.method === 'GET') {
    const status: ImproveStatus = p ? { available: true, provider: p.kind } : { available: false }
    send(res, 200, status)
    return
  }
  if (req.method !== 'POST') {
    send(res, 405, { error: { code: 'method_not_allowed' } })
    return
  }
  if (!p) {
    send(res, 503, {
      error: {
        code: 'not_configured',
        message: 'AI improvement is not enabled on this deployment.',
      },
    })
    return
  }

  // Same-origin only: the browser app is the only intended caller.
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin && host && !origin.endsWith(host)) {
    send(res, 403, { error: { code: 'forbidden' } })
    return
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  if (rateLimited(ip)) {
    send(res, 429, {
      error: { code: 'rate_limited', message: 'Too many requests. Try again in a few minutes.' },
    })
    return
  }

  let body: ImproveRequest
  try {
    body = JSON.parse(await readBody(req)) as ImproveRequest
  } catch {
    send(res, 400, { error: { code: 'invalid_request' } })
    return
  }
  const bullet = typeof body?.bullet === 'string' ? body.bullet.trim() : ''
  if (!bullet || bullet.length > MAX_BULLET) {
    send(res, 400, {
      error: { code: 'invalid_request', message: `Bullet must be 1–${MAX_BULLET} characters.` },
    })
    return
  }
  const safeReq: ImproveRequest = {
    bullet,
    mode:
      body.mode === 'fresher' ? 'fresher' : body.mode === 'experienced' ? 'experienced' : undefined,
    context: {
      section:
        typeof body.context?.section === 'string' ? body.context.section.slice(0, 60) : undefined,
      role: typeof body.context?.role === 'string' ? body.context.role.slice(0, 160) : undefined,
    },
  }

  try {
    const raw =
      p.kind === 'anthropic'
        ? await callAnthropic(p.key, p.model, safeReq)
        : await callOpenAI(p.key, p.model, safeReq)
    const suggestions = parseSuggestions(raw).filter((s) => hasOnlyOriginalNumbers(bullet, s))
    if (!suggestions.length) {
      send(res, 502, {
        error: {
          code: 'no_usable_suggestions',
          message: 'The model did not return usable rewrites. Try again.',
        },
      })
      return
    }
    const out: ImproveResponse = { suggestions, provider: p.kind }
    send(res, 200, out)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upstream_error'
    send(res, 502, { error: { code: 'upstream_error', message: message.slice(0, 200) } })
  }
}

async function callAnthropic(key: string, model: string, req: ImproveRequest): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.4,
      system: IMPROVE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildImproveUserPrompt(req) }],
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!r.ok) throw new Error(`Anthropic ${r.status}`)
  const data = (await r.json()) as { content?: { type: string; text?: string }[] }
  return (data.content ?? []).map((c) => c.text ?? '').join('')
}

async function callOpenAI(key: string, model: string, req: ImproveRequest): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        { role: 'system', content: IMPROVE_SYSTEM_PROMPT },
        { role: 'user', content: buildImproveUserPrompt(req) },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}`)
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}
