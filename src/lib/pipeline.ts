import type { ApiKeys } from '@/types'
import { createVisionAnalyzer, parseVisionJson, type VisionProvider } from './vision'
import {
  generateNanoBananaMultiRef,
  editImageWithGPTImage2,
  submitKlingVideoTask,
  pollKlingResult,
  DEFAULT_KLING_MODEL,
} from './api'

/** Image models available to the pipeline (self-contained, no DNA injection). */
export type PipelineImageModel = 'nano-banana' | 'gpt-image'

export const PIPELINE_IMAGE_MODELS: { id: PipelineImageModel; label: string }[] = [
  { id: 'nano-banana', label: 'Nano Banana 2' },
  { id: 'gpt-image', label: 'GPT Image 2' },
]

/**
 * Generate a single image from reference frames + prompt. Uses the generic
 * Wavespeed image models with `injectDefaultDna=false` so the pipeline stays a
 * standalone app (no character/DNA references baked in).
 */
async function generatePipelineImage(
  model: PipelineImageModel,
  wavespeedKey: string,
  referenceImages: string[],
  prompt: string,
  aspectRatio: string,
  resolution: string,
  onLog?: (msg: string) => void
): Promise<string | undefined> {
  const log = onLog ? (m: string) => onLog(m) : undefined
  if (model === 'gpt-image') {
    const res = await editImageWithGPTImage2(wavespeedKey, referenceImages, prompt, resolution, aspectRatio, log, false)
    return res.imageUrl
  }
  const results = await generateNanoBananaMultiRef(wavespeedKey, referenceImages, prompt, aspectRatio, resolution, 1, log, false)
  return results[0]?.imageUrl
}

/**
 * Browser-side video-generation pipeline. Every network call is isolated in
 * this module (and in {@link ./api}/{@link ./vision}) behind the relative
 * dev-proxy paths, so a later move to a server backend only requires swapping
 * these implementations — the panel never talks to the network directly.
 */

export const PIPELINE_STAGES = [
  { id: 'scene-splitter', label: 'Scene Splitter', scope: 'pipeline' },
  { id: 'frame-extractor', label: 'Frame Extractor', scope: 'scene' },
  { id: 'vision-analyzer', label: 'Vision Analyzer', scope: 'scene' },
  { id: 'prompt-generator', label: 'Prompt Generator', scope: 'scene' },
  { id: 'prompt-optimizer', label: 'Prompt Optimizer', scope: 'scene' },
  { id: 'image-generator', label: 'Image Generator', scope: 'scene' },
  { id: 'image-validator', label: 'Image Validator', scope: 'scene' },
  { id: 'video-generator', label: 'Video Generator', scope: 'scene' },
  { id: 'video-validator', label: 'Video Validator', scope: 'scene' },
  { id: 'scene-export', label: 'Scene Export', scope: 'scene' },
  { id: 'final-merge', label: 'Final Merge', scope: 'pipeline' },
] as const

export type PipelineStageId = (typeof PIPELINE_STAGES)[number]['id']

/** Ordered list of the per-scene stages that the worker pool executes. */
export const SCENE_STAGES: PipelineStageId[] = PIPELINE_STAGES.filter(
  (s) => s.scope === 'scene'
).map((s) => s.id)

export type StageStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface StageState {
  status: StageStatus
  note?: string
}

export interface PipelineScene {
  id: string
  index: number
  title: string
  /** Raw scene description produced by the Scene Splitter. */
  sourceText: string
  /** Optional reference image (base64 data URL) — start frame for this scene. */
  referenceImage?: string
  /** Frame the vision stages analyze (defaults to the reference image). */
  frame?: string
  analysis?: string
  imagePrompt?: string
  optimizedPrompt?: string
  imageUrl?: string
  imageValid?: { pass: boolean; reason: string }
  videoUrl?: string
  videoValid?: { pass: boolean; reason: string }
  exported?: boolean
  stages: Record<PipelineStageId, StageState>
}

export interface PipelineConfig {
  provider: VisionProvider
  concurrency: number
  imageModel: PipelineImageModel
  aspectRatio: string
  resolution: string
  videoDuration: number
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  provider: 'grok',
  concurrency: 2,
  imageModel: 'nano-banana',
  aspectRatio: '9:16',
  resolution: '1k',
  videoDuration: DEFAULT_KLING_MODEL.durations[0],
}

export type PipelineLog = (msg: string) => void

function emptyStages(): Record<PipelineStageId, StageState> {
  return Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s.id, { status: 'pending' as StageStatus }])
  ) as Record<PipelineStageId, StageState>
}

/**
 * Scene Splitter — parse a scenario into discrete scenes. Splits on numbered
 * markers ("1.", "Scene 2:", "Сцена 3 —") or blank lines as a fallback.
 */
export function splitScenes(scenario: string): PipelineScene[] {
  const text = scenario.trim()
  if (!text) return []

  const numbered = text.split(/\n(?=\s*(?:scene|сцена)?\s*\d+\s*[.):\-—])/i)
  const blocks = (numbered.length > 1 ? numbered : text.split(/\n\s*\n/))
    .map((b) => b.trim())
    .filter(Boolean)

  return blocks.map((block, i) => {
    const firstLine = block.split('\n')[0].replace(/^\s*(?:scene|сцена)?\s*\d+\s*[.):\-—]\s*/i, '')
    const title = firstLine.slice(0, 60) || `Сцена ${i + 1}`
    return {
      id: `scene-${i + 1}`,
      index: i,
      title,
      sourceText: block,
      stages: emptyStages(),
    }
  })
}

/** Load a video element from a data/blob URL and resolve once its metadata is ready. */
function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => reject(new Error('Не удалось загрузить видео'))
    video.src = src
  })
}

/** Capture the frame at a given timestamp as a JPEG data URL. */
function seekAndCapture(video: HTMLVideoElement, time: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 720
        canvas.height = video.videoHeight || 1280
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      } finally {
        video.removeEventListener('seeked', onSeeked)
      }
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = Math.min(time, Math.max(0, (video.duration || 0) - 0.05))
  })
}

/**
 * Scene Splitter (video source) — split an uploaded video into `sceneCount`
 * equal time segments and capture a representative frame at each segment's
 * midpoint. Each scene's captured frame becomes its reference for the vision
 * stages. Runs fully in the browser (canvas), no network.
 */
export async function splitVideoIntoScenes(
  videoDataUrl: string,
  sceneCount: number
): Promise<PipelineScene[]> {
  const count = Math.max(1, Math.floor(sceneCount))
  const video = await loadVideo(videoDataUrl)
  const duration = video.duration || 0
  const segment = duration / count

  const scenes: PipelineScene[] = []
  for (let i = 0; i < count; i++) {
    const start = segment * i
    const mid = duration > 0 ? start + segment / 2 : 0
    const frame = await seekAndCapture(video, mid)
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
    scenes.push({
      id: `scene-${i + 1}`,
      index: i,
      title: duration > 0 ? `Сегмент ${fmt(start)}–${fmt(start + segment)}` : `Сцена ${i + 1}`,
      sourceText:
        duration > 0
          ? `Сцена из видео, сегмент ${fmt(start)}–${fmt(start + segment)}.`
          : `Сцена ${i + 1} из видео.`,
      referenceImage: frame,
      frame,
      stages: emptyStages(),
    })
  }
  return scenes
}

/** Bounded-concurrency worker pool built on promises (no external deps). */
export class Semaphore {
  private available: number
  private readonly queue: Array<() => void> = []

  constructor(count: number) {
    this.available = Math.max(1, count)
  }

  private async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.available -= 1
  }

  private release(): void {
    this.available += 1
    const next = this.queue.shift()
    if (next) next()
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }
}

interface StageContext {
  config: PipelineConfig
  keys: ApiKeys
  log: PipelineLog
}

async function extractFirstFrame(mediaUrl: string): Promise<string | undefined> {
  if (!mediaUrl.startsWith('data:video') && !/\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)) {
    return mediaUrl // already an image
  }
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.onloadeddata = () => {
      video.currentTime = 0
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 720
        canvas.height = video.videoHeight || 1280
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        resolve(undefined)
      }
    }
    video.onerror = () => resolve(undefined)
    video.src = mediaUrl
    video.load()
  })
}

/**
 * Per-scene stage runners. Each returns the patch to apply to the scene; the
 * vision/validation stages go through the {@link VisionAnalyzer} abstraction so
 * Grok and Gemini are interchangeable.
 */
const SCENE_RUNNERS: Record<
  PipelineStageId,
  (scene: PipelineScene, ctx: StageContext) => Promise<Partial<PipelineScene>>
> = {
  'scene-splitter': async () => ({}),
  'final-merge': async () => ({}),

  'frame-extractor': async (scene) => {
    if (!scene.referenceImage) return {} // text-only scene, nothing to extract
    const frame = await extractFirstFrame(scene.referenceImage)
    return { frame: frame ?? scene.referenceImage }
  },

  'vision-analyzer': async (scene, ctx) => {
    const frame = scene.frame ?? scene.referenceImage
    if (!frame) return {} // no visual reference — skipped upstream
    const analyzer = createVisionAnalyzer(ctx.config.provider, ctx.keys)
    const analysis = await analyzer.analyze({
      images: [frame],
      systemPrompt:
        'You are a visual analyst. Describe the reference image precisely: subject, pose, framing, lighting, colors, environment.',
      userText: `Scene context: ${scene.sourceText}\n\nDescribe the reference image so it can be recreated from text.`,
    })
    return { analysis: analysis.trim() }
  },

  'prompt-generator': async (scene) => {
    const base = scene.analysis
      ? `${scene.sourceText}\n\nReference: ${scene.analysis}`
      : scene.sourceText
    return { imagePrompt: base.trim() }
  },

  'prompt-optimizer': async (scene, ctx) => {
    const prompt = scene.imagePrompt ?? scene.sourceText
    const analyzer = createVisionAnalyzer(ctx.config.provider, ctx.keys)
    const optimized = await analyzer.analyze({
      images: [],
      systemPrompt:
        'You are a prompt engineer. Rewrite the given description into a single dense, vivid image-generation prompt (English, one paragraph, no preamble).',
      userText: prompt,
    })
    return { optimizedPrompt: optimized.trim() || prompt }
  },

  'image-generator': async (scene, ctx) => {
    if (!ctx.keys.wavespeed) throw new Error('Нет Wavespeed API ключа для генерации изображений')
    const prompt = scene.optimizedPrompt ?? scene.imagePrompt ?? scene.sourceText
    const refs = scene.frame ?? scene.referenceImage
    const imageUrl = await generatePipelineImage(
      ctx.config.imageModel,
      ctx.keys.wavespeed,
      refs ? [refs] : [],
      prompt,
      ctx.config.aspectRatio,
      ctx.config.resolution,
      (m) => ctx.log(m)
    )
    if (!imageUrl) throw new Error('Изображение не сгенерировано')
    return { imageUrl }
  },

  'image-validator': async (scene, ctx) => {
    if (!scene.imageUrl) return {}
    const analyzer = createVisionAnalyzer(ctx.config.provider, ctx.keys)
    const raw = await analyzer.analyze({
      images: [scene.imageUrl],
      systemPrompt: 'You validate generated images. Return ONLY JSON: {"pass": boolean, "reason": "..."}.',
      userText: `Does this image match the intended scene?\n\nScene: ${scene.sourceText}\n\nPrompt: ${scene.optimizedPrompt ?? scene.imagePrompt ?? ''}`,
    })
    const parsed = parseVisionJson<{ pass?: boolean; reason?: string }>(raw)
    return { imageValid: { pass: parsed.pass ?? true, reason: parsed.reason ?? '' } }
  },

  'video-generator': async (scene, ctx) => {
    if (!scene.imageUrl) throw new Error('Нет исходного изображения для видео')
    if (!ctx.keys.wavespeed) throw new Error('Нет Wavespeed API ключа для генерации видео')
    const prompt = scene.optimizedPrompt ?? scene.imagePrompt ?? scene.sourceText
    const { requestId } = await submitKlingVideoTask(
      ctx.keys.wavespeed,
      scene.imageUrl,
      prompt,
      { duration: ctx.config.videoDuration, aspectRatio: ctx.config.aspectRatio },
      (m) => ctx.log(m)
    )
    const result = await pollKlingResult(ctx.keys.wavespeed, requestId, (m) => ctx.log(m))
    if (result.status !== 'completed' || !result.videoUrl) {
      throw new Error(result.error ?? 'Видео не сгенерировано')
    }
    return { videoUrl: result.videoUrl }
  },

  'video-validator': async (scene, ctx) => {
    if (!scene.videoUrl) return {}
    const frame = (await extractFirstFrame(scene.videoUrl)) ?? scene.imageUrl
    if (!frame) return {}
    const analyzer = createVisionAnalyzer(ctx.config.provider, ctx.keys)
    const raw = await analyzer.analyze({
      images: [frame],
      systemPrompt: 'You validate generated video frames. Return ONLY JSON: {"pass": boolean, "reason": "..."}.',
      userText: `Does this video frame match the intended scene?\n\nScene: ${scene.sourceText}`,
    })
    const parsed = parseVisionJson<{ pass?: boolean; reason?: string }>(raw)
    return { videoValid: { pass: parsed.pass ?? true, reason: parsed.reason ?? '' } }
  },

  'scene-export': async () => ({ exported: true }),
}

/** True when a stage has no work to do for this scene and should be skipped. */
function shouldSkip(stageId: PipelineStageId, scene: PipelineScene): boolean {
  const frame = scene.frame ?? scene.referenceImage
  if (stageId === 'frame-extractor' || stageId === 'vision-analyzer') return !frame
  if (stageId === 'image-validator') return !scene.imageUrl
  if (stageId === 'video-validator') return !scene.videoUrl
  return false
}

export interface RunPipelineOptions {
  scenes: PipelineScene[]
  config: PipelineConfig
  keys: ApiKeys
  log: PipelineLog
  /** Persist a single scene's latest state (for Zustand-backed resume). */
  onScene: (scene: PipelineScene) => void
  /** Stop signal — checked between stages. */
  isCancelled?: () => boolean
}

/**
 * Execute the per-scene stages across all scenes using a bounded worker pool.
 * Stages that already succeeded are skipped, enabling resume. Each stage
 * update is streamed back through `onScene` so state can be persisted.
 */
export async function runPipeline(opts: RunPipelineOptions): Promise<void> {
  const { scenes, config, keys, log, onScene, isCancelled } = opts
  const semaphore = new Semaphore(config.concurrency)
  const ctx: StageContext = { config, keys, log }

  await Promise.all(
    scenes.map((scene) =>
      semaphore.run(async () => {
        for (const stageId of SCENE_STAGES) {
          if (isCancelled?.()) return
          if (scene.stages[stageId]?.status === 'success') continue

          if (shouldSkip(stageId, scene)) {
            scene.stages[stageId] = { status: 'skipped' }
            onScene({ ...scene })
            continue
          }

          scene.stages[stageId] = { status: 'running' }
          onScene({ ...scene })
          try {
            const patch = await SCENE_RUNNERS[stageId](scene, ctx)
            Object.assign(scene, patch)
            scene.stages[stageId] = { status: 'success' }
            onScene({ ...scene })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            scene.stages[stageId] = { status: 'error', note: msg }
            log(`❌ [${scene.title}] ${stageId}: ${msg}`)
            onScene({ ...scene })
            return // stop this scene's chain on error
          }
        }
      })
    )
  )
}
