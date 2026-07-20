import { useMemo, useRef, useState } from 'react'
import {
  Workflow,
  Play,
  RotateCcw,
  Scissors,
  Loader2,
  Check,
  X,
  Minus,
  Upload,
  StopCircle,
  Film,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn, fileToBase64 } from '@/lib/utils'
import { useContentStore } from '@/store/useContentStore'
import { VisionProviderToggle } from '@/components/VisionProviderToggle'
import {
  PIPELINE_STAGES,
  SCENE_STAGES,
  PIPELINE_IMAGE_MODELS,
  splitScenes,
  splitVideoIntoScenes,
  runPipeline,
  type PipelineScene,
  type StageStatus,
} from '@/lib/pipeline'

const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '3:4']
const RESOLUTIONS = ['1k', '2k', '4k']

function StatusDot({ status }: { status: StageStatus }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
  if (status === 'success') return <Check className="h-3.5 w-3.5 text-green-500" />
  if (status === 'error') return <X className="h-3.5 w-3.5 text-destructive" />
  if (status === 'skipped') return <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
}

function SceneCard({
  scene,
  onReference,
}: {
  scene: PipelineScene
  onReference: (dataUrl: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground truncate">
          #{scene.index + 1} · {scene.title}
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Upload className="h-3 w-3" />
          {scene.referenceImage || scene.imageUrl ? 'референс ✓' : 'референс'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) onReference(await fileToBase64(f))
          }}
        />
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground line-clamp-2">{scene.sourceText}</p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {SCENE_STAGES.map((stageId) => {
            const st = scene.stages[stageId]
            const label = PIPELINE_STAGES.find((s) => s.id === stageId)!.label
            return (
              <div key={stageId} className="flex items-center gap-1.5" title={st?.note}>
                <StatusDot status={st?.status ?? 'pending'} />
                <span
                  className={cn(
                    'text-[10px] truncate',
                    st?.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {(scene.imageUrl || scene.videoUrl) && (
          <div className="flex gap-2 pt-1">
            {scene.imageUrl && (
              <img src={scene.imageUrl} alt="" className="h-16 w-16 rounded object-cover border border-border" />
            )}
            {scene.videoUrl && (
              <video src={scene.videoUrl} controls className="h-16 rounded border border-border" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function PipelinePanel() {
  const {
    apiKeys,
    visionProvider,
    pipelineScenes,
    pipelineConfig,
    setPipelineScenes,
    updatePipelineScene,
    setPipelineConfig,
  } = useContentStore()

  const [scenario, setScenario] = useState('')
  const [source, setSource] = useState<'text' | 'video'>('text')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoSceneCount, setVideoSceneCount] = useState(3)
  const [splitting, setSplitting] = useState(false)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const cancelRef = useRef(false)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const addLog = (msg: string) => setLogs((prev) => [...prev.slice(-200), msg])

  const progress = useMemo(() => {
    if (pipelineScenes.length === 0) return { done: 0, total: 0 }
    const total = pipelineScenes.length * SCENE_STAGES.length
    const done = pipelineScenes.reduce(
      (acc, sc) =>
        acc + SCENE_STAGES.filter((id) => ['success', 'skipped'].includes(sc.stages[id]?.status)).length,
      0
    )
    return { done, total }
  }, [pipelineScenes])

  function handleSplit() {
    const scenes = splitScenes(scenario)
    setPipelineScenes(scenes)
    addLog(`✂️ Scene Splitter: ${scenes.length} сцен`)
  }

  async function handleVideoUpload(file: File) {
    const dataUrl = await fileToBase64(file)
    setVideoUrl(dataUrl)
    addLog(`🎬 Видео загружено: ${file.name}`)
  }

  async function handleSplitVideo() {
    if (!videoUrl || splitting) return
    setSplitting(true)
    try {
      const scenes = await splitVideoIntoScenes(videoUrl, videoSceneCount)
      setPipelineScenes(scenes)
      addLog(`✂️ Scene Splitter (видео): ${scenes.length} сцен, кадры извлечены`)
    } catch (err) {
      addLog(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSplitting(false)
    }
  }

  function handleReference(sceneId: string, dataUrl: string) {
    const updated = pipelineScenes.map((s) =>
      s.id === sceneId ? { ...s, referenceImage: dataUrl } : s
    )
    setPipelineScenes(updated)
  }

  async function handleRun() {
    if (pipelineScenes.length === 0 || running) return
    cancelRef.current = false
    setRunning(true)
    addLog(`▶️ Запуск пайплайна (${visionProvider}, параллелизм ${pipelineConfig.concurrency})`)
    try {
      await runPipeline({
        scenes: pipelineScenes.map((s) => ({ ...s })),
        config: { ...pipelineConfig, provider: visionProvider },
        keys: apiKeys,
        log: addLog,
        onScene: (scene) => updatePipelineScene(scene),
        isCancelled: () => cancelRef.current,
      })
      addLog('✅ Пайплайн завершён')
    } catch (err) {
      addLog(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  function handleReset() {
    cancelRef.current = true
    setPipelineScenes([])
    setLogs([])
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Пайплайн видео</h2>
        </div>
        <VisionProviderToggle />
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Полный конвейер генерации: сцены → кадры → анализ (VisionAnalyzer) → промпты → изображения →
        валидация → видео → экспорт. Выполняется в браузере с worker-pool и resume.
      </p>

      {/* Scene Splitter */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scene Splitter
          </span>
          <div className="inline-flex rounded-md border border-border bg-card/50 p-0.5">
            {(['text', 'video'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  source === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'text' ? 'Сценарий' : 'Видео'}
              </button>
            ))}
          </div>
        </div>

        {source === 'text' ? (
          <>
            <Textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Вставь сценарий. Сцены разделяются нумерацией (1. 2. 3.) или пустой строкой."
              className="min-h-[120px] text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleSplit} disabled={!scenario.trim() || running}>
                <Scissors className="h-4 w-4" /> Разбить на сцены
              </Button>
              {pipelineScenes.length > 0 && (
                <span className="text-xs text-muted-foreground">{pipelineScenes.length} сцен</span>
              )}
            </div>
          </>
        ) : (
          <>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) await handleVideoUpload(f)
              }}
            />
            {videoUrl ? (
              <video src={videoUrl} controls className="w-full max-h-48 rounded-lg border border-border bg-black" />
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <Film className="h-6 w-6" />
                <span className="text-sm">Загрузить видео</span>
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => videoInputRef.current?.click()} disabled={running || splitting}>
                <Upload className="h-4 w-4" /> {videoUrl ? 'Заменить' : 'Выбрать'} видео
              </Button>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                Сцен
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={videoSceneCount}
                  onChange={(e) => setVideoSceneCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                />
              </label>
              <Button size="sm" variant="secondary" onClick={handleSplitVideo} disabled={!videoUrl || splitting || running}>
                {splitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                Разбить видео на сцены
              </Button>
              {pipelineScenes.length > 0 && (
                <span className="text-xs text-muted-foreground">{pipelineScenes.length} сцен</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Config */}
      <div className="rounded-xl border border-border bg-card p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Параллелизм
          <input
            type="number"
            min={1}
            max={6}
            value={pipelineConfig.concurrency}
            onChange={(e) => setPipelineConfig({ concurrency: Math.max(1, Number(e.target.value) || 1) })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Модель изображения
          <select
            value={pipelineConfig.imageModel}
            onChange={(e) => setPipelineConfig({ imageModel: e.target.value as typeof pipelineConfig.imageModel })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {PIPELINE_IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Формат
          <select
            value={pipelineConfig.aspectRatio}
            onChange={(e) => setPipelineConfig({ aspectRatio: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {ASPECT_RATIOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Разрешение
          <select
            value={pipelineConfig.resolution}
            onChange={(e) => setPipelineConfig({ resolution: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          >
            {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button onClick={handleRun} disabled={pipelineScenes.length === 0 || running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {progress.done > 0 && progress.done < progress.total ? 'Продолжить' : 'Запустить'}
        </Button>
        {running && (
          <Button variant="secondary" onClick={() => { cancelRef.current = true }}>
            <StopCircle className="h-4 w-4" /> Стоп
          </Button>
        )}
        <Button variant="ghost" onClick={handleReset} disabled={running}>
          <RotateCcw className="h-4 w-4" /> Сброс
        </Button>
        {progress.total > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {progress.done}/{progress.total} этапов
          </span>
        )}
      </div>

      {/* Scenes */}
      {pipelineScenes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pipelineScenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onReference={(dataUrl) => handleReference(scene.id, dataUrl)}
            />
          ))}
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-border bg-black/40 p-3 max-h-48 overflow-auto">
          {logs.map((l, i) => (
            <div key={i} className="text-[11px] font-mono text-muted-foreground">{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}
