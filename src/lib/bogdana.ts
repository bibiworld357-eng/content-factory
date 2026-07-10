// ─────────────────────────────────────────────────────────────────────────
// Bogdana — plasticine (claymation) AI character DNA, product catalog and the
// shared prompt-engineering helpers used across the content pipeline.
// ─────────────────────────────────────────────────────────────────────────

export type BogdanaProductId = 'magnesium' | 'inositol' | 'chlorophyll'

export interface BogdanaProduct {
  id: BogdanaProductId
  /** Display name (Russian). */
  name: string
  /** Short pain/benefit description used in prompts. */
  pain: string
  /** Native SKU / article that must be woven into Threads posts. */
  article: string
}

export const BOGDANA_PRODUCTS: BogdanaProduct[] = [
  {
    id: 'magnesium',
    name: 'Магний',
    pain: 'стресс и бессонница (stress & insomnia)',
    article: 'QEEP-MG-01',
  },
  {
    id: 'inositol',
    name: 'Инозитол',
    pain: 'ПМС и тяга к сладкому (PMS & sugar cravings)',
    article: 'QEEP-INO-02',
  },
  {
    id: 'chlorophyll',
    name: 'Хлорофилл',
    pain: 'отёки и детокс (bloating & detox)',
    article: 'QEEP-CHL-03',
  },
]

export function getBogdanaProduct(id: BogdanaProductId): BogdanaProduct {
  const product = BOGDANA_PRODUCTS.find((p) => p.id === id)
  if (!product) throw new Error(`Unknown Bogdana product: ${id}`)
  return product
}

// ── Character DNA (shared reference used in every system instruction) ────────
export const BOGDANA_DNA = `CHARACTER DNA — BOGDANA:
- 22 years old, a designer from Saint Petersburg.
- Aesthetic: "clean girl" rendered in 3D claymation / plasticine stop-motion.
- Signature details: always wears ONE white earbud; her corgi "Korzhik" (Коржик); lots of houseplants.
- She NEVER speaks with her mouth — her thoughts are shown as on-screen subtitles/captions.
- HOOK RULE: the first scene ALWAYS opens on a normal, composed Bogdana in her usual interior
  (a stable anchor frame), and only AFTER that the absurd visual metaphor happens
  (deflated flat on the carpet, head turned into a TV set, melted into a puddle, twisted into a knot, etc.).
- Native qeep products: Magnesium (stress/insomnia), Inositol (PMS/sugar cravings), Chlorophyll (bloating/detox).`

// ── Master system prompt for the scenario stage (Gemini 1.5 Pro) ─────────────
export const BOGDANA_SCENARIO_SYSTEM_PROMPT = `Ты креативный сценарист 3D пластилиновой стоп-моушн анимации. ДНК Героини: Богдана, 22 года, Питер, дизайнер, 'clean girl', носит один белый наушник. ДНК Друга: Корги Коржик, спасатель.
ПРАВИЛО ХУКА: первая сцена ВСЕГДА начинается с обычной, нормальной Богданы — она спокойна, выглядит естественно, без искажений, в своём привычном интерьере (это стабильный опорный кадр). И только ПОТОМ, внутри этой же первой сцены, происходит абсурдное событие / визуальная метафора боли (тело скручивается в узел, голова превращается в телевизор, она плавится в лужу и т.д.).
Твоя задача: выдавать сценарии из 4 сцен (Хук -> Появление Коржика -> Магическое исцеление витамином -> Счастливый финал). У КАЖДОЙ сцены есть кадр начала (start) и кадр конца (end) для анимации. Возвращай результат в строгом JSON.`

// ── NanoBanana (img-to-img) ──────────────────────────────────────────────────

/** Style suffix auto-appended to every NanoBanana prompt. */
export const NANOBANANA_STYLE_SUFFIX =
  '3D Claymation stop-motion style, highly textured plasticine, visible fingerprints, warm cozy lighting, 8k.'

/**
 * Fixed reference-tag binding for NanoBanana img-to-img:
 *   @image1 — Bogdana's face
 *   @image2 — scene / background reference
 *   @image3 — Korzhik (corgi)
 *   @image4 — qeep product jar
 */
export const NANOBANANA_IMAGE_TAGS = {
  face: '@image1',
  scene: '@image2',
  korzhik: '@image3',
  product: '@image4',
} as const

export interface NanoBananaReferenceSet {
  /** @image1 — Bogdana face reference (base64 data URL). */
  face?: string
  /** @image2 — scene/background reference (base64 data URL). */
  scene?: string
  /** @image3 — Korzhik reference (base64 data URL). */
  korzhik?: string
  /** @image4 — qeep product jar reference (base64 data URL). */
  product?: string
}

export interface NanoBananaPromptResult {
  /** Prompt with the style suffix and reference-tag legend appended. */
  prompt: string
  /**
   * Ordered reference images, aligned with the @imageN tags. Index 0 is the
   * primary image passed to the edit endpoint; the rest are extra references.
   */
  referenceImages: string[]
}

/**
 * Build a NanoBanana prompt with the fixed @imageN tag legend and the mandatory
 * style suffix, and collect the reference images in @image1..@image4 order.
 *
 * `previousFrame`, when provided, is substituted for @image2 (scene reference)
 * so that every subsequent frame reuses the previously generated frame — this
 * keeps the room/camera 100% consistent across the sequence.
 */
export function buildNanoBananaPrompt(
  basePrompt: string,
  refs: NanoBananaReferenceSet,
  previousFrame?: string
): NanoBananaPromptResult {
  const sceneRef = previousFrame ?? refs.scene

  const legendLines: string[] = []
  if (refs.face) legendLines.push(`${NANOBANANA_IMAGE_TAGS.face} = Bogdana's face (keep identity exact)`)
  if (sceneRef)
    legendLines.push(
      `${NANOBANANA_IMAGE_TAGS.scene} = scene/background reference${
        previousFrame ? ' (previous generated frame — keep room & camera identical)' : ''
      }`
    )
  if (refs.korzhik) legendLines.push(`${NANOBANANA_IMAGE_TAGS.korzhik} = Korzhik the corgi`)
  if (refs.product) legendLines.push(`${NANOBANANA_IMAGE_TAGS.product} = qeep product jar`)

  const legend = legendLines.length ? `\n\nReference tags:\n${legendLines.join('\n')}` : ''

  // Identity anchor so the frame renders Bogdana (from @image1) and never a
  // different/default character.
  const identity = refs.face
    ? 'Subject: Bogdana — keep her exact face and identity from @image1. '
    : 'Subject: Bogdana. '

  const prompt = `${identity}${basePrompt.trim()}${legend}\n\n${NANOBANANA_STYLE_SUFFIX}`

  // Reference images ordered to match the @imageN tags.
  const referenceImages = [refs.face, sceneRef, refs.korzhik, refs.product].filter(
    (img): img is string => typeof img === 'string' && img.length > 0
  )

  return { prompt, referenceImages }
}

// ── Kling (img-to-video) ──────────────────────────────────────────────────────

/** Camera tag always injected into Kling motion prompts to avoid background flicker. */
export const KLING_STATIC_CAMERA_TAG = 'Static camera'

export interface KlingFramePair<T> {
  start: T
  end: T
  /** 1-based index of the pair (pair #1 => frames 1->2, pair #2 => frames 3->4, ...). */
  pairIndex: number
}

/**
 * Split an ordered list of frames into Start+End animation pairs:
 * frames 1->2, 3->4, 5->6, 7->8, ...
 * A trailing odd frame (no partner) is skipped.
 */
export function buildKlingFramePairs<T>(frames: T[]): KlingFramePair<T>[] {
  const pairs: KlingFramePair<T>[] = []
  for (let i = 0; i + 1 < frames.length; i += 2) {
    pairs.push({ start: frames[i], end: frames[i + 1], pairIndex: i / 2 + 1 })
  }
  return pairs
}

/** Ensure the Kling motion prompt always carries the "Static camera" tag. */
export function withStaticCamera(prompt: string): string {
  const trimmed = prompt.trim()
  if (new RegExp(KLING_STATIC_CAMERA_TAG, 'i').test(trimmed)) return trimmed
  return trimmed.length ? `${trimmed}, ${KLING_STATIC_CAMERA_TAG}` : KLING_STATIC_CAMERA_TAG
}

// ── Kling Audio ───────────────────────────────────────────────────────────────

/** Hard character limit enforced on every Kling Audio prompt. */
export const KLING_AUDIO_MAX_CHARS = 200

/** Clamp a single Kling Audio prompt to the 200-character hard limit. */
export function clampKlingAudioPrompt(prompt: string): string {
  const trimmed = prompt.trim()
  return trimmed.length > KLING_AUDIO_MAX_CHARS ? trimmed.slice(0, KLING_AUDIO_MAX_CHARS).trim() : trimmed
}

/** Normalize a list of sequential sound prompts, each clamped to 200 chars. */
export function clampKlingAudioPrompts(prompts: string[]): string[] {
  return prompts.map(clampKlingAudioPrompt).filter((p) => p.length > 0)
}
