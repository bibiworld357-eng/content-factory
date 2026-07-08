import { GoogleGenerativeAI } from '@google/generative-ai'
import type { GenerationConfig } from '@google/generative-ai'
import { BOGDANA_SCENARIO_SYSTEM_PROMPT, getBogdanaProduct, type BogdanaProductId } from './bogdana'

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

  const model = getModel(geminiKey, BOGDANA_SCENARIO_SYSTEM_PROMPT)

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
  /** Cinematic action description for the scene. */
  action: string
  /** On-screen subtitle (Bogdana never speaks with her mouth). */
  subtitle: string
  /** Visual/image prompt for this scene (used later by NanoBanana). */
  imagePrompt: string
}

export interface BogdanaScenario {
  productId: BogdanaProductId
  ideaTitle: string
  scenes: BogdanaScene[]
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

  const model = getModel(geminiKey, BOGDANA_SCENARIO_SYSTEM_PROMPT)

  const userPrompt = `Продукт: ${product.name} — ${product.pain} (артикул ${product.article}).
Выбранная идея: "${idea.title}" — ${idea.hook}.
Распиши подробный сценарий РОВНО из 4 сцен по арке:
1) Хук (пик абсурдной визуальной метафоры в первую секунду),
2) Появление Коржика (корги-спасатель),
3) Магическое исцеление витамином ${product.name},
4) Счастливый финал.
Богдана не говорит ртом — её мысли идут в титрах.
Верни строгий JSON вида:
{
  "ideaTitle": "${idea.title}",
  "scenes": [
    { "scene": 1, "title": "Хук", "action": "<что происходит в кадре>", "subtitle": "<титр на экране>", "imagePrompt": "<визуальный промпт для кадра>" },
    { "scene": 2, "title": "Появление Коржика", "action": "...", "subtitle": "...", "imagePrompt": "..." },
    { "scene": 3, "title": "Исцеление", "action": "...", "subtitle": "...", "imagePrompt": "..." },
    { "scene": 4, "title": "Финал", "action": "...", "subtitle": "...", "imagePrompt": "..." }
  ]
}`

  const result = await model.generateContent(userPrompt)
  const text = result.response.text()
  const parsed = parseJson<{ ideaTitle?: string; scenes: BogdanaScene[] }>(text)

  if (!parsed.scenes || parsed.scenes.length === 0) {
    throw new Error('Gemini не вернул сцены сценария')
  }

  onLog?.(`Gemini: сценарий готов (${parsed.scenes.length} сцен)`, 'success')
  return {
    productId,
    ideaTitle: parsed.ideaTitle ?? idea.title,
    scenes: parsed.scenes,
  }
}
