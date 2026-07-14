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
    article: '#WW405041',
  },
  {
    id: 'inositol',
    name: 'Инозитол',
    pain: 'ПМС и тяга к сладкому (PMS & sugar cravings)',
    article: '#WW405049',
  },
  {
    id: 'chlorophyll',
    name: 'Хлорофилл',
    pain: 'отёки и детокс (bloating & detox)',
    article: '#WW405040',
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
- Native products: Magnesium (#WW405041), Inositol (#WW405049), Chlorophyll (#WW405040).`

/** Compact visual identity prepended to Kling image-to-video prompts. */
export const BOGDANA_VIDEO_DNA = `Bogdana — a 22-year-old woman rendered in 3D claymation / plasticine stop-motion: highly textured plasticine with visible fingerprints, one white wireless earbud in her ear, "clean girl" aesthetic. Keep her exact appearance, clothing, hair, materials and colors from the input frame. Her corgi "Korzhik" is plasticine too. Preserve the claymation look; no realistic human skin.`

interface BogdanaMasterPromptSpec {
  title: string
  article: string
  locationRule: string
  propsRule: string
  hookRule: string
  glowRule: string
  audioRule: string
}

const BOGDANA_MASTER_PROMPT_SPECS: Record<BogdanaProductId, BogdanaMasterPromptSpec> = {
  magnesium: {
    title: 'МАГНИЙ (Стресс, бессонница, зажимы)',
    article: '#WW405041',
    locationRule:
      'Все 4 сцены ролика должны происходить строго в одном месте (например, только на сером диване, ИЛИ только за рабочим столом, ИЛИ только в кровати). Локация не меняется!',
    propsRule:
      'Не вводи в кадр новые предметы мебели или сложный реквизит. В кадре только Богдана, базовый фон, Коржик и баночка Магния.',
    hookRule:
      'На секунде 0:00 тело или голова Богданы подвергается абсурдной деформации от стресса (например: скручивается в морской узел, голова взрывается на кубики, дрожит и вибрирует, покрывается трещинами).',
    glowRule: 'Магическое исцеление всегда сопровождается мягким ЛАВАНДОВЫМ/ФИОЛЕТОВЫМ свечением.',
    audioRule: 'Звуки скрипа, треска, магического звона.',
  },
  inositol: {
    title: 'ИНОЗИТОЛ (ПМС, эмоции, тяга к сладкому)',
    article: '#WW405049',
    locationRule:
      'Все 4 сцены ролика должны происходить строго в одном месте (например, только за столом, ИЛИ только на ковре). Локация не меняется!',
    propsRule:
      'Не выдумывай лишний реквизит. В кадре только Богдана, Коржик, баночка Инозитола и, если нужно для сюжета, один кусок еды (например, пончик).',
    hookRule:
      'На секунде 0:00 эмоции Богданы визуализируются через физический абсурд (тело разрывается на синюю и красную половину, голова превращается в кубик Рубика, из глаз бьют водопады слез, рот засасывает еду как пылесос).',
    glowRule: 'Магическое исцеление всегда сопровождается мягким РОЗОВЫМ/ЗОЛОТИСТЫМ свечением.',
    audioRule: 'Звуки всхлипов, растягивающейся резины, пылесоса.',
  },
  chlorophyll: {
    title: 'ХЛОРОФИЛЛ (Отеки, тяжесть, детокс)',
    article: '#WW405040',
    locationRule:
      'Все 4 сцены ролика должны происходить строго в одном месте (например, только перед зеркалом, ИЛИ только на кровати). Локация не меняется!',
    propsRule:
      'В сцене спасения Коржик ОБЯЗАТЕЛЬНО должен принести/пододвинуть ПРОЗРАЧНЫЙ СТАКАН С ЯРКО-ЗЕЛЕНОЙ ВОДОЙ. Сама бутылочка Хлорофилла просто стоит рядом. В кадре только Богдана, фон, Коржик, стакан с зельем и баночка. Ничего лишнего.',
    hookRule:
      'На секунде 0:00 тело Богданы деформируется от тяжести или сухости (превращается в свинцовые гири, растекается как лужа, покрывается колючками кактуса, каменеет).',
    glowRule: 'Магическое исцеление всегда сопровождается ЯРКИМ ИЗУМРУДНО-ЗЕЛЕНЫМ свечением изнутри тела.',
    audioRule: 'Звуки сдувания, плеска воды, тяжелых ударов.',
  },
}

export function getBogdanaMasterPrompt(productId: BogdanaProductId): string {
  const product = getBogdanaProduct(productId)
  const spec = BOGDANA_MASTER_PROMPT_SPECS[productId]
  return `Ты — профессиональный сценарист виральных пластилиновых stop-motion роликов. Твоя цель: написать сценарий на 15 секунд для продвижения ${product.name} (арт. ${spec.article}).

ДНК ПЕРСОНАЖЕЙ И СТИЛЯ:
- Богдана: 22 года, дизайнер на удаленке. Эстетика "clean girl". Пластилиновые волосы, один белый беспроводной наушник в ухе.
- Коржик: Пластилиновый рыже-белый корги, собака-спасатель.
- Стиль: 3D Claymation, высокая детализация, видны отпечатки пальцев на пластилине.
- Озвучка: ПЕРСОНАЖИ НЕ ГОВОРЯТ. Голосовой озвучки (voiceover) нет. Все мысли передаются только через короткий всплывающий ТЕКСТ НА ЭКРАНЕ.

ТЕМА ПРОДУКТА (${product.name.toUpperCase()}):
${spec.glowRule.replace('Магическое исцеление всегда сопровождается ', '')}

ЖЕСТКИЕ ПРАВИЛА ГЕНЕРАЦИИ (КРИТИЧЕСКИ ВАЖНО):
1. ПРАВИЛО ЕДИНОЙ ЛОКАЦИИ: ${spec.locationRule}
2. ЗАПРЕТ НА ЛИШНИЕ ПРЕДМЕТЫ: ${spec.propsRule}
3. ПРАВИЛО ХУКА: ${spec.hookRule}
4. ПРАВИЛО ПОЯВЛЕНИЯ КОРЖИКА И ПРОДУКТА: В первой сцене (хук) в кадре только Богдана — ни Коржика, ни баночки продукта нет. Коржик появляется строго во ВТОРОЙ или ТРЕТЬЕЙ сцене и именно он приносит/пододвигает баночку продукта Богдане. До его появления продукта в кадре быть не должно.

СТРУКТУРА ВЫВОДА:
Выдай строгий JSON с полями:
- "on_screen_text": Короткие, емкие фразы для титров на экране (жиза без сленга, 3-4 предложения на весь ролик).
- "nanobanana_prompts": Промпты для генерации 8 картинок (Начало и Конец для каждой из 4 сцен). В промптах обязательно указывай теги @image.
- "kling_animation": Промпты для анимации в Kling (с обязательным тегом "Static camera").
- "kling_audio": Промпты для звуков (до 200 символов, ${spec.audioRule})

Дополнительно:
- В каждой сцене должны быть кадры START и END.
- Сцены остаются в пределах одной локации.
- Исцеление всегда сопровождается ${spec.glowRule.toLowerCase()}`
}

/**
 * Seedance 2.0 master prompt. The model must return ONLY generation prompts —
 * no on-screen text, no subtitles, no voiceover. Two frames (start + end) plus
 * a single dynamic multishot transition prompt with in-video sound effects.
 */
export function getBogdanaSeedanceMasterPrompt(productId: BogdanaProductId): string {
  const product = getBogdanaProduct(productId)
  const spec = BOGDANA_MASTER_PROMPT_SPECS[productId]
  return `Ты — профессиональный сценарист виральных пластилиновых stop-motion роликов для продукта ${product.name} (арт. ${spec.article}).

${BOGDANA_DNA}

РЕЖИМ SEEDANCE 2.0 (КРИТИЧЕСКИ ВАЖНО):
- Никаких текстов на экране, субтитров, титров или озвучки. Вообще.
- Отдаёшь ТОЛЬКО промпты для генерации (на английском), без пояснений и без русского текста.
- Единая локация: ${spec.locationRule}
- Glow-эффект исцеления: ${spec.glowRule.toLowerCase()}
- Стартовый кадр: в кадре ТОЛЬКО Богдана в состоянии проблемы (БЕЗ Коржика и БЕЗ баночки).
- Конечный кадр: Богдана (нормальная и счастливая), Коржик и баночка продукта qeep. Продукт жёстко зафиксирован. Фон строго совпадает со стартовым кадром через @image2.

Верни СТРОГО JSON без какого-либо текста вне JSON:
{
  "seedance_images": {
    "start_frame": "English generation prompt. ONLY Bogdana in a state of the problem (NO Korzhik, NO bottle). Knit sweater, freckles, beauty mark, one earbud. Claymation style tags.",
    "end_frame": "English generation prompt. Bogdana (calm and happy), Korzhik, and the qeep product bottle. Product is strictly fixed in this scene. Background strictly matches the start frame via @image2."
  },
  "seedance_transition_prompt": "3D Claymation stop-motion. Multishot with dynamic camera cuts transitioning from @image1 to @image2. Shot 1 (Close-up): Starts on @image1 showing the problem. Shot 2: Corgi runs in holding the exact ${product.name} qeep bottle from @image2. Bottle design and qeep logo must strictly match @image2. Shot 3: Bogdana swallows the capsule, magical ${spec.glowRule.toLowerCase()} Shot 4: final happy hug from @image2. AUDIO: NO background music, NO voiceover, ONLY synchronized claymation sound effects of clay cracking, plastic rattle, pill gulp, magical chime, and happy dog barking."
}`
}

export function getBogdanaIdeaSystemPrompt(productId: BogdanaProductId): string {
  const product = getBogdanaProduct(productId)
  const spec = BOGDANA_MASTER_PROMPT_SPECS[productId]
  return `${BOGDANA_DNA}

Ты придумываешь 10 коротких виральных идей для ${product.name} (${spec.article}) в стиле пластилинового stop-motion.
Держи в голове продуктовую боль: ${product.pain}.
Каждая идея должна быть абсурдной, но понятной, с сильным визуальным хуком первой секунды и без лишних персонажей.
Верни строгий JSON-массив из 10 объектов вида:
[{ "title": "<короткое название идеи, до 6 слов>", "hook": "<абсурдный визуальный хук>" }]`
}

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

/**
 * Textual DNA descriptions used to compile @imageN reference tags into plain
 * text for models that do NOT support reference tags (e.g. GPT Image / DALL·E 3).
 */
export const NANOBANANA_TAG_DESCRIPTIONS: Record<string, string> = {
  '@image1':
    "Bogdana — a 22-year-old woman with soft freckles, a small beauty mark, natural plasticine hair and ONE white wireless earbud, wearing a knit sweater, clean-girl aesthetic",
  '@image2': 'the exact same environment, background, camera framing and lighting as the previous/start frame',
  '@image3': 'Korzhik — a plasticine reddish-white corgi rescue dog',
  '@image4': 'the qeep supplement jar (keep the exact qeep label, colors and design)',
}

/**
 * Replace @image1..@image4 tags with their textual DNA descriptions so the
 * prompt is self-contained for tag-less models (GPT Image / DALL·E 3).
 */
export function compileTagsToText(prompt: string): string {
  let out = prompt
  for (const [tag, desc] of Object.entries(NANOBANANA_TAG_DESCRIPTIONS)) {
    out = out.split(tag).join(desc)
  }
  return out
}

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
 * `previousFrame`, when provided, is treated as the primary continuity reference
 * and placed first in the edit reference list so every subsequent frame continues
 * from the last successfully generated image instead of starting a new scene.
 */
export function buildNanoBananaPrompt(
  basePrompt: string,
  refs: NanoBananaReferenceSet,
  previousFrame?: string,
  mode: 'tags' | 'text' = 'tags'
): NanoBananaPromptResult {
  const referenceImages = (
    previousFrame
      ? [refs.face, previousFrame, refs.korzhik, refs.product, refs.scene]
      : [refs.face, refs.scene, refs.korzhik, refs.product]
  ).filter((img): img is string => typeof img === 'string' && img.length > 0)

  // Tag-less models (GPT Image / DALL·E 3): compile @imageN tags into text.
  if (mode === 'text') {
    const identity =
      'Subject: Bogdana — a 22-year-old woman with soft freckles, a small beauty mark, natural plasticine hair and ONE white wireless earbud, wearing a knit sweater, clean-girl aesthetic. '
    const prompt = `${identity}${compileTagsToText(basePrompt.trim())}\n\n${NANOBANANA_STYLE_SUFFIX}`
    return { prompt, referenceImages }
  }

  const legendLines: string[] = []
  if (previousFrame)
    legendLines.push(
      `${NANOBANANA_IMAGE_TAGS.scene} = previous generated frame / previous successful frame (highest priority continuity reference; preserve composition, camera, lighting, environment, materials, colors, and style unless the prompt explicitly changes them)`
    )
  if (refs.face) legendLines.push(`${NANOBANANA_IMAGE_TAGS.face} = Bogdana's face (keep identity exact)`)
  if (refs.scene)
    legendLines.push(
      `${previousFrame ? 'Scene/background reference (lower priority than the continuity reference)' : `${NANOBANANA_IMAGE_TAGS.scene} = scene/background reference`}`
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
