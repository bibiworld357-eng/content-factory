import { GoogleGenerativeAI } from '@google/generative-ai'
import type { GenerationConfig } from '@google/generative-ai'
import { getBogdanaIdeaSystemPrompt, getBogdanaMasterPrompt, getBogdanaProduct, type BogdanaProductId } from './bogdana'

export type LogFn = (message: string, level?: 'info' | 'success' | 'error') => void

// Google Gen AI SDK — parallel text-generation service (used alongside Grok).
// Note: gemini-1.5-pro is retired on the current API. gemini-2.5-flash is used
// because the Pro tier (gemini-2.5-pro) is not available on AI Studio free keys.
export const GEMINI_MODEL = 'gemini-2.5-flash'

// Force the model to always return raw JSON.
const JSON_GENERATION_CONFIG: GenerationConfig = {
  responseMimeType: 'application/json',
  temperature: 0.9,
}

function getModel(apiKey: string, systemInstruction: string) {
  const key = apiKey.trim()
  if (!key) throw new Error('Gemini: API-ключ не задан (VITE_GEMINI_API_KEY)')
  const genAI = new GoogleGenerativeAI(key)
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
    generationConfig: JSON_GENERATION_CONFIG,
  })
}

/** Strip accidental markdown fences and parse the first JSON value in the text. */
function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  const match = cleaned.match(/[[{][\s\S]*[\]}]/)
  if (!match) throw new Error(`Gemini вернул невалидный JSON: ${raw.slice(0, 200)}`)
  return JSON.parse(match[0]) as T
}

export interface BogdanaIdea {
  title: string
  hook: string
}

/**
 * Stage 3.1 — Step Б: generate 10 short viral ideas for the chosen product.
 */
export async function generateBogdanaIdeas(
  geminiKey: string,
  productId: BogdanaProductId,
  onLog?: LogFn,
  count = 10
): Promise<BogdanaIdea[]> {
  const product = getBogdanaProduct(productId)
  onLog?.(`Gemini: генерирую ${count} виральных идей для «${product.name}»...`)

  const model = getModel(geminiKey, getBogdanaIdeaSystemPrompt(productId))

  const userPrompt = `Продукт: ${product.name} — ${product.pain} (артикул ${product.article}).
Придумай ровно ${count} КОРОТКИХ виральных идей для пластилиновых роликов Богданы про этот продукт.
Каждая идея — это абсурдная визуальная метафора боли, которую решает продукт.
Верни строгий JSON-массив из ${count} объектов вида:
[{ "title": "<короткое название идеи, до 6 слов>", "hook": "<описание абсурдного визуального хука первой секунды>" }]`

  const result = await model.generateContent(userPrompt)
  const text = result.response.text()
  const ideas = parseJson<BogdanaIdea[]>(text)

  if (!Array.isArray(ideas) || ideas.length === 0) {
    throw new Error('Gemini не вернул ни одной идеи')
  }

  onLog?.(`Gemini: получено ${ideas.length} идей`, 'success')
  return ideas
}

export interface BogdanaScene {
  /** Scene number (1..4). */
  scene: number
  /** Scene role label: Хук / Появление Коржика / Исцеление / Финал. */
  title: string
  /** Cinematic action/motion description for the scene (start -> end). */
  action: string
  /** On-screen subtitle (Bogdana never speaks with her mouth). */
  subtitle: string
  /** Image prompt for the START frame of the scene. */
  startImagePrompt: string
  /** Image prompt for the END frame of the scene. */
  endImagePrompt: string
}

export interface BogdanaScenario {
  productId: BogdanaProductId
  ideaTitle: string
  scenes: BogdanaScene[]
  onScreenText?: string[]
  nanobananaPrompts?: string[]
  klingAnimation?: string[]
  klingAudio?: string[]
}

/**
 * Stage 3.1 — Step Г: expand the chosen idea into a full 4-scene scenario.
 * Scene arc: Хук -> Появление Коржика -> Магическое исцеление витамином -> Счастливый финал.
 */
export async function generateBogdanaScenario(
  geminiKey: string,
  productId: BogdanaProductId,
  idea: BogdanaIdea,
  onLog?: LogFn
): Promise<BogdanaScenario> {
  const product = getBogdanaProduct(productId)
  onLog?.(`Gemini: расписываю сценарий по идее «${idea.title}»...`)

  const model = getModel(geminiKey, getBogdanaMasterPrompt(productId))

  const userPrompt = `Продукт: ${product.name} — ${product.pain} (артикул ${product.article}).
Выбранная идея: "${idea.title}" — ${idea.hook}.
Распиши подробный сценарий РОВНО из 4 сцен по арке:
1) Хук,
2) Появление Коржика (корги-спасатель),
3) Магическое исцеление витамином ${product.name},
4) Счастливый финал.
ВАЖНО: строгая JSON-структура должна включать:
{
  "on_screen_text": ["<3-4 короткие фразы для титров>"],
  "nanobanana_prompts": ["<8 строк: start/end для 4 сцен с @image тегами>"],
  "kling_animation": ["<4 строки: motion prompts, each with Static camera>"],
  "kling_audio": ["<4 строки: each <= 200 chars>"],
  "ideaTitle": "${idea.title}",
  "scenes": [
    { "scene": 1, "title": "Хук", "action": "<движение от start к end>", "subtitle": "<титр на экране>", "startImagePrompt": "<обычная нормальная Богдана в одной локации>", "endImagePrompt": "<абсурдная метафора боли>" },
    { "scene": 2, "title": "Появление Коржика", "action": "...", "subtitle": "...", "startImagePrompt": "...", "endImagePrompt": "..." },
    { "scene": 3, "title": "Исцеление", "action": "...", "subtitle": "...", "startImagePrompt": "...", "endImagePrompt": "..." },
    { "scene": 4, "title": "Финал", "action": "...", "subtitle": "...", "startImagePrompt": "...", "endImagePrompt": "..." }
  ]
}
В сценах изображения должны соответствовать единой локации; для Хлорофилла обязательно присутствует прозрачный стакан с ярко-зелёной водой в сцене спасения Коржиком.
Богдана не говорит ртом — её мысли идут в титрах.
Верни строгий JSON вида:
{
  "ideaTitle": "${idea.title}",
  "scenes": [
    { "scene": 1, "title": "Хук", "action": "<движение от start к end>", "subtitle": "<титр на экране>", "startImagePrompt": "<обычная нормальная Богдана в интерьере>", "endImagePrompt": "<абсурдная метафора боли>" },
    { "scene": 2, "title": "Появление Коржика", "action": "...", "subtitle": "...", "startImagePrompt": "...", "endImagePrompt": "..." },
    { "scene": 3, "title": "Исцеление", "action": "...", "subtitle": "...", "startImagePrompt": "...", "endImagePrompt": "..." },
    { "scene": 4, "title": "Финал", "action": "...", "subtitle": "...", "startImagePrompt": "...", "endImagePrompt": "..." }
  ]
}`

  const result = await model.generateContent(userPrompt)
  const text = result.response.text()
  const parsed = parseJson<{
    ideaTitle?: string
    scenes: BogdanaScene[]
    on_screen_text?: string[]
    nanobanana_prompts?: string[]
    kling_animation?: string[]
    kling_audio?: string[]
  }>(text)

  if (!parsed.scenes || parsed.scenes.length === 0) {
    throw new Error('Gemini не вернул сцены сценария')
  }

  onLog?.(`Gemini: сценарий готов (${parsed.scenes.length} сцен)`, 'success')
  return {
    productId,
    ideaTitle: parsed.ideaTitle ?? idea.title,
    scenes: parsed.scenes,
    onScreenText: parsed.on_screen_text,
    nanobananaPrompts: parsed.nanobanana_prompts,
    klingAnimation: parsed.kling_animation,
    klingAudio: parsed.kling_audio,
  }
}

/**
 * Generate a ready-to-post caption/description for the finished reel,
 * based on the scenario. Returns Russian text with a light CTA and hashtags.
 */
export async function generateBogdanaVideoDescription(
  geminiKey: string,
  scenario: BogdanaScenario,
  onLog?: LogFn
): Promise<string> {
  const product = getBogdanaProduct(scenario.productId)
  onLog?.('Gemini: пишу описание видео...')

  const model = getModel(geminiKey, getBogdanaMasterPrompt(scenario.productId))
  const scenesText = scenario.scenes
    .map((s) => `${s.scene}. ${s.title}: ${s.action} (титр: ${s.subtitle})`)
    .join('\n')

  const userPrompt = `На основе этого сценария ролика про ${product.name} (артикул ${product.article}) напиши цепляющее описание для публикации в Reels/TikTok на русском языке.
Сценарий:
${scenesText}

Требования:
- живой виральный тон, без воды и канцелярита;
- 2–4 предложения (жиза по проблеме продукта);
- лёгкий мягкий CTA в конце;
- 5–8 релевантных хэштегов в самом конце.
Верни строго JSON вида: {"description": "<текст с хэштегами>"}`

  const result = await model.generateContent(userPrompt)
  const text = result.response.text()
  const parsed = parseJson<{ description?: string }>(text)
  const desc = parsed.description?.trim()
  if (!desc) throw new Error('Gemini не вернул описание видео')

  onLog?.('Gemini: описание видео готово', 'success')
  return desc
}
