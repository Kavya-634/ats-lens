/**
 * Shared contract between the browser and /api/improve. Kept dependency-free
 * so it can be imported from both the Vite app and the Vercel function.
 */
export interface ImproveRequest {
  /** The bullet to rewrite. */
  bullet: string
  /** Section heading and role line for context (no other resume content). */
  context?: { section?: string; role?: string }
  mode?: 'fresher' | 'experienced'
}

export interface ImproveResponse {
  /** 2–3 rewrites. Each keeps the user's facts; unknown numbers appear as [add number]. */
  suggestions: string[]
  provider: 'anthropic' | 'openai'
}

export interface ImproveStatus {
  available: boolean
  provider?: 'anthropic' | 'openai'
}

export const IMPROVE_SYSTEM_PROMPT = `You rewrite résumé bullets so they are concise, start with a strong past-tense action verb, and make impact explicit.

Hard rules:
1. NEVER invent facts, numbers, tools, companies, dates or outcomes that are not in the original bullet. If a result should have a number but the original gives none, write the literal placeholder [add number] (or [add %], [add time saved], [add team size] when the kind of number is obvious). Placeholders must be in square brackets exactly like that.
2. Keep every fact from the original. You may drop filler words and first-person pronouns.
3. One sentence, 12–28 words, no trailing full stop needed, no emoji, no markdown.
4. Prefer the pattern: [Verb] [what] [how/with what] [measurable result].
5. Do not start with "Responsible for", "Worked on", "Helped", "Assisted", "Involved in".
6. Return ONLY a JSON array of 3 strings. No prose before or after.`

export function buildImproveUserPrompt(req: ImproveRequest): string {
  const ctx: string[] = []
  if (req.context?.section) ctx.push(`Section: ${req.context.section}`)
  if (req.context?.role) ctx.push(`Role line: ${req.context.role}`)
  if (req.mode) ctx.push(`Candidate profile: ${req.mode}`)
  return `${ctx.length ? ctx.join('\n') + '\n\n' : ''}Original bullet:\n${req.bullet}\n\nReturn 3 rewrites as a JSON array of strings.`
}

/** Pull a JSON string array out of a model reply, tolerating code fences. */
export function parseSuggestions(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length >= 8 && s.length <= 300)
      .slice(0, 3)
  } catch {
    return []
  }
}

/**
 * Guard against invented numbers: any digit sequence in a suggestion must
 * also appear in the original (or be inside a [placeholder]). Suggestions
 * that fail are dropped on the server and again on the client.
 */
export function hasOnlyOriginalNumbers(original: string, suggestion: string): boolean {
  const originalNums = new Set(
    (original.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, '')),
  )
  const stripped = suggestion.replace(/\[[^\]]*\]/g, '')
  const nums = stripped.match(/\d[\d,.]*/g) ?? []
  return nums.every((n) => originalNums.has(n.replace(/[,.]$/, '')))
}
