import type { ApiKeys } from '@/types'

/**
 * Vision provider abstraction.
 *
 * A {@link VisionAnalyzer} takes one or more images plus a system/user prompt
 * and returns the raw text response from the underlying model. All parsing
 * (JSON extraction, `[EN]/[RU]` splitting, …) is done by the caller so the same
 * prompt-building + parsing code works regardless of which model is used.
 *
 * Networking is fully isolated inside the analyzer implementations. In dev the
 * Gemini analyzer talks to the model through the `/api/gemini` Vite proxy, in
 * prod it calls the Google endpoint directly — mirroring the pattern already
 * used for Wavespeed/Minimax/Captions in `api.ts`. This makes a future move to
 * a server backend a matter of swapping the analyzer implementation only.
 */

export type VisionProvider = 'grok' | 'gemini'

/** `Authorization: Bearer <key>` value; throws with a clear 401 hint when empty. */
function bearer(key: string, service = 'API'): string {
  const trimmed = (key ?? '').trim()
  if (!trimmed) {
    throw new Error(`${service}: не задан ключ авторизации (401). Укажите ключ в настройках.`)
  }
  return `Bearer ${trimmed}`
}

export interface VisionAnalyzeParams {
  /** Images as full data URLs (`data:image/...;base64,...`). Sent before the text. */
  images: string[]
  /** Optional system instruction. */
  systemPrompt?: string
  /** User instruction / prompt text. */
  userText: string
  /** Sampling temperature (provider default when omitted). */
  temperature?: number
  /** Cap on generated tokens (provider default when omitted). */
  maxOutputTokens?: number
  /** Grok image `detail` hint. */
  detail?: 'high' | 'low' | 'auto'
}

export interface VisionAnalyzer {
  readonly provider: VisionProvider
  analyze(params: VisionAnalyzeParams): Promise<string>
}

/**
 * Strip accidental markdown fences and parse the first JSON object in the text.
 *
 * This is the parsing logic that used to be duplicated across every Grok
 * analysis function in `api.ts` (`cleaned.replace(/```json/).match(/\{...\}/) +
 * JSON.parse`). Throws a clear error when no JSON object is found or parsing
 * fails, embedding a snippet of the raw response for debugging.
 */
export function parseVisionJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`Модель вернула невалидный JSON: ${raw.slice(0, 200)}`)
  }
  try {
    return JSON.parse(match[0]) as T
  } catch {
    throw new Error(`Модель вернула невалидный JSON: ${raw.slice(0, 200)}`)
  }
}

/** Split a data URL into its mime type and bare base64 payload (no `data:` prefix). */
function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s)
  if (match) return { mimeType: match[1], base64: match[2] }
  // Raw base64 without a prefix — sniff the common leading bytes.
  const mimeType = dataUrl.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
  return { mimeType, base64: dataUrl.replace(/^data:[^,]*,/, '') }
}

/** Ensure the value is a full data URL (Grok requires the `data:` prefix). */
function toDataUrl(image: string): string {
  if (image.startsWith('data:')) return image
  const mimeType = image.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
  return `data:${mimeType};base64,${image}`
}

// ── Grok (x.ai) ────────────────────────────────────────────────────────────

export const GROK_VISION_MODEL = 'grok-4.20-reasoning'
const GROK_RESPONSES_ENDPOINT = 'https://api.x.ai/v1/responses'

interface GrokResponsesOutput {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  choices?: Array<{ message?: { content?: string }; text?: string }>
}

/** VisionAnalyzer backed by x.ai's `grok-4.20-reasoning` `/v1/responses` endpoint. */
export class GrokVisionAnalyzer implements VisionAnalyzer {
  readonly provider = 'grok' as const
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async analyze(params: VisionAnalyzeParams): Promise<string> {
    const { images, systemPrompt, userText, temperature, maxOutputTokens, detail = 'high' } = params

    const userContent: Array<Record<string, unknown>> = [
      ...images.map((img) => ({ type: 'input_image', image_url: toDataUrl(img), detail })),
      { type: 'input_text', text: userText },
    ]

    const input: Array<Record<string, unknown>> = []
    if (systemPrompt) input.push({ role: 'system', content: systemPrompt })
    input.push({ role: 'user', content: userContent })

    const payload: Record<string, unknown> = { model: GROK_VISION_MODEL, input, store: false }
    if (temperature !== undefined) payload.temperature = temperature
    if (maxOutputTokens !== undefined) payload.max_output_tokens = maxOutputTokens

    const response = await fetch(GROK_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: bearer(this.apiKey, 'Grok') },
      body: JSON.stringify(payload),
    }).catch((err) => {
      throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Grok vision ${response.status}: ${JSON.stringify(err)}`)
    }

    const data = (await response.json()) as GrokResponsesOutput
    const output = data.output ?? []
    const messageOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
    const text =
      messageOutput?.content?.find((c) => c.type === 'output_text')?.text ??
      messageOutput?.content?.[0]?.text ??
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text ??
      ''
    return text.trim()
  }
}

// ── Gemini (Google Generative Language) ──────────────────────────────────────

// Alias that always resolves to the latest Flash model on Google's side.
export const GEMINI_VISION_MODEL = 'gemini-flash-latest'
const GEMINI_HOST = 'https://generativelanguage.googleapis.com'

interface GeminiGenerateResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string }
}

/**
 * VisionAnalyzer backed by Google's Generative Language API
 * (`gemini-flash-latest:generateContent`).
 *
 * Images are sent as `inline_data` (bare base64, no `data:` prefix). In dev the
 * request goes through the `/api/gemini` Vite proxy to avoid CORS; in prod it
 * hits the Google host directly. The API key is passed as the `?key=` query
 * parameter.
 */
export class GeminiVisionAnalyzer implements VisionAnalyzer {
  readonly provider = 'gemini' as const
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async analyze(params: VisionAnalyzeParams): Promise<string> {
    const { images, systemPrompt, userText, temperature, maxOutputTokens } = params

    const key = (this.apiKey ?? '').trim()
    if (!key) {
      throw new Error('Gemini: не задан API-ключ (401). Укажите ключ в настройках.')
    }

    const parts: Array<Record<string, unknown>> = images.map((img) => {
      const { mimeType, base64 } = splitDataUrl(img)
      return { inline_data: { mime_type: mimeType, data: base64 } }
    })
    parts.push({ text: userText })

    const generationConfig: Record<string, unknown> = {}
    if (temperature !== undefined) generationConfig.temperature = temperature
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
    }
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] }
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig

    const base = import.meta.env.DEV ? '/api/gemini' : GEMINI_HOST
    const url = `${base}/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${encodeURIComponent(key)}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => {
      throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    })

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as GeminiGenerateResponse
      throw new Error(`Gemini vision ${response.status}: ${err.error?.message ?? JSON.stringify(err)}`)
    }

    const data = (await response.json()) as GeminiGenerateResponse
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim()
    return text
  }
}

/**
 * Build the {@link VisionAnalyzer} implementation for the selected provider,
 * pulling the matching key out of the stored API keys.
 */
export function createVisionAnalyzer(provider: VisionProvider, keys: ApiKeys): VisionAnalyzer {
  return provider === 'gemini'
    ? new GeminiVisionAnalyzer(keys.gemini)
    : new GrokVisionAnalyzer(keys.grok)
}
