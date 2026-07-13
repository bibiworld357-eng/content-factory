import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Sparkles,
  Lightbulb,
  Clapperboard,
  Images,
  Film,
  Volume2,
  MessageSquare,
  Loader2,
  Check,
  X,
  ImageIcon,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, fileToBase64 } from '@/lib/utils'
import { useContentStore } from '@/store/useContentStore'
import {
  BOGDANA_PRODUCTS,
  NANOBANANA_STYLE_SUFFIX,
  buildKlingFramePairs,
  buildNanoBananaPrompt,
  getBogdanaProduct,
  type BogdanaProductId,
  type NanoBananaReferenceSet,
} from '@/lib/bogdana'
import {
  generateBogdanaIdeas,
  generateBogdanaScenario,
  type BogdanaIdea,
  type BogdanaScenario,
} from '@/lib/gemini'
import {
  generateBogdanaFrame,
  BOGDANA_IMAGE_MODELS,
  submitKlingVideoTask,
  pollKlingResult,
  generateKlingAudioSequence,
  generateBogdanaThreadsPosts,
  type BogdanaImageModel,
  type BogdanaThreadsPost,
} from '@/lib/api'

type RefKey = keyof NanoBananaReferenceSet

const REFERENCE_SLOTS: Array<{ key: RefKey; tag: string; label: string }> = [
  { key: 'face', tag: '@image1', label: 'Лицо Богданы' },
  { key: 'scene', tag: '@image2', label: 'Эталон сцены/фона' },
  { key: 'korzhik', tag: '@image3', label: 'Коржик' },
  { key: 'product', tag: '@image4', label: 'Баночка qeep' },
]

type FrameStatus = 'pending' | 'loading' | 'success' | 'error'

interface FrameSlot {
  imageUrl?: string
  status: FrameStatus
  error?: string
}

/** Each scene produces two frames — a start and an end — for Kling animation. */
interface SceneFrames {
  scene: number
  title: string
  start: FrameSlot
  end: FrameSlot
}

const isSceneBusy = (sf: SceneFrames) => sf.start.status === 'loading' || sf.end.status === 'loading'

interface VideoPairResult {
  pairIndex: number
  status: 'pending' | 'loading' | 'success' | 'error'
  videoUrl?: string
  error?: string
}

function ReferenceSlot({
  tag,
  label,
  value,
  onChange,
}: {
  tag: string
  label: string
  value?: string
  onChange: (dataUrl: string | undefined) => void
}) {
  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0]
      if (!file) return
      onChange(await fileToBase64(file))
    },
    [onChange]
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: 1,
    multiple: false,
  })

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] font-mono text-primary">{tag}</span>
      </div>
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-border aspect-square">
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={() => onChange(undefined)}
            className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            'aspect-square rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-1 text-center p-2 transition-colors',
            isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          )}
        >
          <input {...getInputProps()} />
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">загрузить</span>
        </div>
      )}
    </div>
  )
}

function StageHeader({ icon: Icon, step, title }: { icon: typeof Sparkles; step: string; title: string }) {
  return (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
          {step}
        </span>
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </CardTitle>
    </CardHeader>
  )
}

export function BogdanaPipelinePanel() {
  const { apiKeys, addLog } = useContentStore()

  // Stage 3.1 — scenario
  const [productId, setProductId] = useState<BogdanaProductId | null>(null)
  const [ideas, setIdeas] = useState<BogdanaIdea[]>([])
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null)
  const [scenario, setScenario] = useState<BogdanaScenario | null>(null)
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [loadingScenario, setLoadingScenario] = useState(false)

  // Stage 3.2 — images (2 frames per scene: start + end)
  const [refs, setRefs] = useState<NanoBananaReferenceSet>({})
  const [sceneFrames, setSceneFrames] = useState<SceneFrames[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [imageModel, setImageModel] = useState<BogdanaImageModel>('nano-banana')

  // Mirror of sceneFrames for reading the latest values inside async generators.
  const sceneFramesRef = useRef<SceneFrames[]>([])
  useEffect(() => {
    sceneFramesRef.current = sceneFrames
  }, [sceneFrames])

  // Stage 3.3 — video + audio
  const [videoPairs, setVideoPairs] = useState<VideoPairResult[]>([])
  const [loadingVideo, setLoadingVideo] = useState(false)
  const [audioPrompts, setAudioPrompts] = useState<string[]>([])
  const [loadingAudio, setLoadingAudio] = useState(false)

  // Stage 3.4 — threads
  const [threads, setThreads] = useState<BogdanaThreadsPost[]>([])
  const [loadingThreads, setLoadingThreads] = useState(false)

  const setRef = (key: RefKey) => (dataUrl: string | undefined) =>
    setRefs((prev) => ({ ...prev, [key]: dataUrl }))

  async function handleGenerateIdeas() {
    if (!productId) return
    setLoadingIdeas(true)
    setIdeas([])
    setSelectedIdea(null)
    setScenario(null)
    try {
      const result = await generateBogdanaIdeas(apiKeys.gemini, productId, addLog)
      setIdeas(result)
    } catch (err) {
      addLog(`Gemini: ${err instanceof Error ? err.message : 'ошибка'}`, 'error')
    } finally {
      setLoadingIdeas(false)
    }
  }

  async function handleGenerateScenario() {
    if (!productId || selectedIdea === null) return
    setLoadingScenario(true)
    setScenario(null)
    try {
      const result = await generateBogdanaScenario(apiKeys.gemini, productId, ideas[selectedIdea], addLog)
      setScenario(result)
      setSceneFrames(
        result.scenes.map((s) => ({
          scene: s.scene,
          title: s.title,
          start: { status: 'pending' },
          end: { status: 'pending' },
        }))
      )
    } catch (err) {
      addLog(`Gemini: ${err instanceof Error ? err.message : 'ошибка'}`, 'error')
    } finally {
      setLoadingScenario(false)
    }
  }

  /** Generate a single frame using the last successful frame as the top-priority visual reference. */
  async function generateFrame(prompt: string, continuityFrame?: string): Promise<string | undefined> {
    const { prompt: full, referenceImages } = buildNanoBananaPrompt(prompt, refs, continuityFrame)
    return generateBogdanaFrame(imageModel, apiKeys.wavespeed, referenceImages, full, '9:16', '1k', addLog)
  }

  const patchSlot = (i: number, slot: 'start' | 'end', value: FrameSlot) =>
    setSceneFrames((prev) => prev.map((sf, idx) => (idx === i ? { ...sf, [slot]: value } : sf)))

  const getLastSuccessfulFrameBeforeScene = (sceneIndex: number) => {
    const ordered = sceneFramesRef.current.flatMap((sf) => [sf.start, sf.end])
    const cutoff = Math.max(sceneIndex * 2, 0)
    for (let i = cutoff - 1; i >= 0; i--) {
      const frame = ordered[i]
      if (frame?.status === 'success' && frame.imageUrl) return frame.imageUrl
    }
    return undefined
  }

  /**
   * Generate both frames (start + end) for one scene.
   * Every new frame uses the latest successful frame as the primary continuity
   * reference, and failures do not reset that chain.
   */
  async function generateSceneFrames(i: number, initialContinuity?: string) {
    if (!scenario) return
    const scene = scenario.scenes[i]
    patchSlot(i, 'start', { status: 'loading' })
    patchSlot(i, 'end', { status: 'loading' })

    let continuityFrame = initialContinuity ?? getLastSuccessfulFrameBeforeScene(i)

    let startUrl: string | undefined
    try {
      startUrl = await generateFrame(scene.startImagePrompt, continuityFrame)
      patchSlot(i, 'start', startUrl ? { status: 'success', imageUrl: startUrl } : { status: 'error', error: 'нет изображения' })
      if (startUrl) continuityFrame = startUrl
    } catch (err) {
      patchSlot(i, 'start', { status: 'error', error: err instanceof Error ? err.message : 'ошибка' })
    }

    try {
      const endUrl = await generateFrame(scene.endImagePrompt, continuityFrame)
      patchSlot(i, 'end', endUrl ? { status: 'success', imageUrl: endUrl } : { status: 'error', error: 'нет изображения' })
      if (endUrl) continuityFrame = endUrl
    } catch (err) {
      patchSlot(i, 'end', { status: 'error', error: err instanceof Error ? err.message : 'ошибка' })
    }

    return continuityFrame
  }

  async function handleGenerateImages() {
    if (!scenario) return
    if (!refs.face) {
      addLog('Загрузите хотя бы @image1 (лицо Богданы)', 'error')
      return
    }
    setLoadingImages(true)
    let continuityFrame: string | undefined
    for (let i = 0; i < scenario.scenes.length; i++) {
      continuityFrame = await generateSceneFrames(i, continuityFrame)
    }
    setLoadingImages(false)
  }

  async function handleRegenerateScene(i: number) {
    if (!refs.face) {
      addLog('Загрузите хотя бы @image1 (лицо Богданы)', 'error')
      return
    }
    setLoadingImages(true)
    await generateSceneFrames(i)
    setLoadingImages(false)
  }

  async function handleGenerateVideos() {
    // Flatten to an ordered list [s1.start, s1.end, s2.start, s2.end, ...] so
    // Kling pairs each scene's start+end frame (1→2, 3→4, 5→6, 7→8).
    const ordered = sceneFrames.flatMap((sf) => [sf.start, sf.end])
    const ready = ordered.filter((f) => f.status === 'success' && f.imageUrl) as { imageUrl?: string }[]
    const pairs = buildKlingFramePairs(ready)
    if (pairs.length === 0) {
      addLog('Нужно минимум 2 готовых кадра для пары Start→End', 'error')
      return
    }
    setLoadingVideo(true)
    setVideoPairs(pairs.map((p) => ({ pairIndex: p.pairIndex, status: 'loading' })))

    await Promise.all(
      pairs.map(async (pair, idx) => {
        try {
          const motion = scenario?.scenes[idx]?.action ?? 'Subtle claymation motion'
          const { requestId } = await submitKlingVideoTask(
            apiKeys.wavespeed,
            pair.start.imageUrl!,
            motion,
            { duration: 5, aspectRatio: '9:16', endImage: pair.end.imageUrl },
            addLog
          )
          const result = await pollKlingResult(apiKeys.wavespeed, requestId, addLog)
          setVideoPairs((prev) =>
            prev.map((v) =>
              v.pairIndex === pair.pairIndex
                ? {
                    ...v,
                    status: result.status === 'completed' ? 'success' : 'error',
                    videoUrl: result.videoUrl,
                    error: result.error,
                  }
                : v
            )
          )
        } catch (err) {
          setVideoPairs((prev) =>
            prev.map((v) =>
              v.pairIndex === pair.pairIndex
                ? { ...v, status: 'error', error: err instanceof Error ? err.message : 'ошибка' }
                : v
            )
          )
        }
      })
    )
    setLoadingVideo(false)
  }

  async function handleGenerateAudio() {
    if (!scenario) return
    setLoadingAudio(true)
    setAudioPrompts([])
    try {
      const sceneText = scenario.scenes.map((s) => `${s.title}: ${s.action}`).join(' | ')
      const result = await generateKlingAudioSequence(apiKeys.grok, sceneText, '', addLog)
      setAudioPrompts(result)
    } catch (err) {
      addLog(`Kling Audio: ${err instanceof Error ? err.message : 'ошибка'}`, 'error')
    } finally {
      setLoadingAudio(false)
    }
  }

  async function handleGenerateThreads() {
    if (!productId) return
    setLoadingThreads(true)
    setThreads([])
    try {
      const result = await generateBogdanaThreadsPosts(apiKeys.grok, productId, addLog)
      setThreads(result)
    } catch (err) {
      addLog(`Threads: ${err instanceof Error ? err.message : 'ошибка'}`, 'error')
    } finally {
      setLoadingThreads(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Пайплайн Богданы</h1>
        <span className="text-xs text-muted-foreground">Gemini 2.5 Flash · NanoBanana · Kling · Grok</span>
      </div>

      {/* ── STAGE 3.1 — Scenario ─────────────────────────────────────── */}
      <Card>
        <StageHeader icon={Lightbulb} step="1" title="Сценарий (Gemini 2.5 Flash)" />
        <CardContent className="space-y-4">
          {/* Step A — product */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Шаг А — выберите продукт</p>
            <div className="flex flex-wrap gap-2">
              {BOGDANA_PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProductId(p.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm transition-colors',
                    productId === p.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {p.name}
                  <span className="block text-[10px] text-muted-foreground">{p.pain}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step B — 10 ideas */}
          <Button onClick={handleGenerateIdeas} disabled={!productId || loadingIdeas} size="sm">
            {loadingIdeas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            Шаг Б — 10 виральных идей
          </Button>

          {/* Step C — pick idea */}
          {ideas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Шаг В — выберите идею</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ideas.map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIdea(i)}
                    className={cn(
                      'text-left p-2.5 rounded-lg border text-sm transition-colors',
                      selectedIdea === i ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                    )}
                  >
                    <span className="font-medium">{i + 1}. {idea.title}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{idea.hook}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step D — scenario */}
          {selectedIdea !== null && (
            <Button onClick={handleGenerateScenario} disabled={loadingScenario} size="sm">
              {loadingScenario ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              Шаг Г — подробный сценарий (4 сцены)
            </Button>
          )}

          {scenario && (
            <div className="space-y-2">
              {scenario.scenes.map((s) => (
                <div key={s.scene} className="p-3 rounded-lg border border-border bg-card/50">
                  <div className="text-sm font-medium text-primary">Сцена {s.scene} — {s.title}</div>
                  <p className="text-xs mt-1">{s.action}</p>
                  <p className="text-xs text-muted-foreground mt-1 italic">Титр: {s.subtitle}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── STAGE 3.2 — Images ───────────────────────────────────────── */}
      <Card>
        <StageHeader icon={Images} step="2" title="Изображения (NanoBanana)" />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {REFERENCE_SLOTS.map((slot) => (
              <ReferenceSlot
                key={slot.key}
                tag={slot.tag}
                label={slot.label}
                value={refs[slot.key]}
                onChange={setRef(slot.key)}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Модель генерации</p>
            <div className="flex flex-wrap gap-2">
              {BOGDANA_IMAGE_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setImageModel(m.id)}
                  disabled={loadingImages}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-50',
                    imageModel === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            8 кадров — по 2 на сцену (start + end). Последний успешный кадр автоматически становится главным референсом для следующего. Суффикс:{' '}
            <span className="font-mono">{NANOBANANA_STYLE_SUFFIX}</span>
          </p>
          <Button onClick={handleGenerateImages} disabled={!scenario || loadingImages} size="sm">
            {loadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
            Сгенерировать все кадры
          </Button>
          {sceneFrames.length > 0 && (
            <div className="space-y-3">
              {sceneFrames.map((sf, i) => (
                <div key={sf.scene} className="rounded-lg border border-border p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">Сцена {sf.scene} — {sf.title}</span>
                    <button
                      onClick={() => handleRegenerateScene(i)}
                      disabled={loadingImages || isSceneBusy(sf)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className={cn('h-3 w-3', isSceneBusy(sf) && 'animate-spin')} />
                      перегенерировать
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { slot: sf.start, label: 'Start' },
                      { slot: sf.end, label: 'End' },
                    ] as const).map(({ slot, label }) => (
                      <div key={label} className="rounded-lg border border-border overflow-hidden">
                        <div className="aspect-[9/16] bg-card flex items-center justify-center">
                          {slot.imageUrl ? (
                            <img src={slot.imageUrl} alt={`${sf.title} ${label}`} className="w-full h-full object-cover" />
                          ) : slot.status === 'loading' ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground px-2 text-center">{slot.error ?? 'ожидание'}</span>
                          )}
                        </div>
                        <div className="px-2 py-1 text-[10px] text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── STAGE 3.3 — Video + Audio ────────────────────────────────── */}
      <Card>
        <StageHeader icon={Film} step="3" title="Видео и звук (Kling)" />
        <CardContent className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            Пары кадров 1→2, 3→4, 5→6, 7→8 (Start + End). Тег «Static camera» добавляется автоматически.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerateVideos} disabled={loadingVideo} size="sm">
              {loadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              Анимировать пары кадров
            </Button>
            <Button onClick={handleGenerateAudio} disabled={!scenario || loadingAudio} size="sm" variant="secondary">
              {loadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              Промпты звука (≤200 симв.)
            </Button>
          </div>
          {videoPairs.length > 0 && (
            <div className="space-y-1.5">
              {videoPairs.map((v) => (
                <div key={v.pairIndex} className="flex items-center gap-2 text-xs">
                  <span className="font-mono">Пара {v.pairIndex}</span>
                  {v.status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {v.status === 'success' && v.videoUrl && (
                    <a href={v.videoUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                      видео готово
                    </a>
                  )}
                  {v.status === 'error' && <span className="text-destructive">{v.error}</span>}
                </div>
              ))}
            </div>
          )}
          {audioPrompts.length > 0 && (
            <ol className="space-y-1.5 list-decimal list-inside">
              {audioPrompts.map((a, i) => (
                <li key={i} className="text-xs">
                  <span className="font-mono text-muted-foreground">[{a.length}/200]</span> {a}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* ── STAGE 3.4 — Threads ──────────────────────────────────────── */}
      <Card>
        <StageHeader icon={MessageSquare} step="4" title="Посты в Threads (Grok)" />
        <CardContent className="space-y-3">
          <Button onClick={handleGenerateThreads} disabled={!productId || loadingThreads} size="sm">
            {loadingThreads ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            Сгенерировать посты
          </Button>
          {threads.map((post, i) => (
            <div key={i} className="p-3 rounded-lg border border-border bg-card/50">
              <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-emerald-500" /> тренд: {post.trend}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    post.hasProduct ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {post.hasProduct ? 'с продуктом' : 'без продукта'}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{post.text}</p>
              {post.hasProduct && post.article && (
                <div className="text-[11px] font-mono text-primary mt-1">{post.article}</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {productId && (
        <p className="text-[11px] text-muted-foreground">
          Продукт: {getBogdanaProduct(productId).name} · артикул {getBogdanaProduct(productId).article}
        </p>
      )}
    </div>
  )
}
