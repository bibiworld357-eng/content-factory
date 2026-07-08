import { useState, useRef, useEffect } from 'react'
import { Subtitles, Upload, AlertCircle, Download, Play, Pause, X, CheckCircle2, Loader2, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import { submitCaptionsJob, convertVideoTo916, fetchCaptionTemplates, type CaptionTemplate } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Fallback static templates ─────────────────────────────────────────────

const FAVORITE_IDS = [
  'ctpl_P1qdlnbSk4NZERdu6tIO', // Glow
  'ctpl_XZwWZdooFDLbmiZ524p5', // Footprint v3
  'ctpl_grdfFHRFNm6sBARtdVRy', // Minima
  'ctpl_yvE0ZnYzEj6ClCD2ee1f', // Buzz
  'ctpl_DxflLOnuKkb198FNdI9E', // Heat
]

const FALLBACK_TEMPLATES: CaptionTemplate[] = [
  { id: 'ctpl_yvE0ZnYzEj6ClCD2ee1f', name: 'Buzz' },
  { id: 'ctpl_yNnJyDLSH5oIouKdjQx2', name: 'Medusa' },
  { id: 'ctpl_xCFRVbYyA4OShvj3jPA8', name: 'Cartwheel Black' },
  { id: 'ctpl_wR9PXfmxW1DFxEUuATFg', name: 'Drive' },
  { id: 'ctpl_vrs1M2VrxvzQWNRypRvh', name: 'Magazine' },
  { id: 'ctpl_tkuSt0SUnBuxNT6b2LNG', name: 'Monster' },
  { id: 'ctpl_tWgDpYUXw4wyU7tB7eOG', name: 'Dimidium' },
  { id: 'ctpl_tN68l72WH2RFjl1eMhwg', name: 'Scene' },
  { id: 'ctpl_slCGoQERGj5Dn9Cr1Whd', name: 'Recess' },
  { id: 'ctpl_rn0HysnZUu5UzZEJw8gq', name: 'Pollux' },
  { id: 'ctpl_qdtwV5Vi2GbkQZ9THLcW', name: 'Vitamin C' },
  { id: 'ctpl_pwQ0QiBOYuuRvDuEYzmr', name: 'Altair' },
  { id: 'ctpl_pUtOSPltDzsoYJgLBYmo', name: 'Aries' },
  { id: 'ctpl_oofP3mxbx8CaEPNYqnKD', name: 'Energy' },
  { id: 'ctpl_ojEuI2F9lnZ9u91YkYjo', name: 'Acamar' },
  { id: 'ctpl_miZu2nLWyP7X8oEAAHcM', name: 'Sirius' },
  { id: 'ctpl_lXEe3rYgxCKh2MnCymqC', name: 'Helios' },
  { id: 'ctpl_jcTmJGX77Uwz2AqLOX4S', name: 'Milky Way' },
  { id: 'ctpl_iusqRnf5W08ENWPOVvkz', name: 'Energy II' },
  { id: 'ctpl_iqX03uuwVIqPJOV4MGgr', name: 'Finlay' },
  { id: 'ctpl_idIjDO4Mtwu9nquVB0OV', name: 'Mizar' },
  { id: 'ctpl_iV3lX880qcCe9AURc4XA', name: 'Note' },
  { id: 'ctpl_hfkGwYGSIPHijM4vWRqH', name: 'Neon' },
  { id: 'ctpl_hVijUCESRcnAG1TqV8Bv', name: 'Eclipse' },
  { id: 'ctpl_hQisXGK98sAN8E5M4g8h', name: 'Baseline' },
  { id: 'ctpl_hMydc4rk9l4yC3Hw6MKK', name: 'Nova' },
  { id: 'ctpl_grdfFHRFNm6sBARtdVRy', name: 'Minima' },
  { id: 'ctpl_fsR2Jc3zhDrsMEOPb9mo', name: 'Marigold' },
  { id: 'ctpl_fYTszWbhnFlgJp2cU4vI', name: 'Closed Cap' },
  { id: 'ctpl_epPY6aFemTA34RuDT9yv', name: 'Hustle v3' },
  { id: 'ctpl_bKvIxXSn2sZvmt7RbFV1', name: 'Pacific' },
  { id: 'ctpl_ZLUhoYk5omnYGzcKY1aQ', name: 'Pulse' },
  { id: 'ctpl_XZwWZdooFDLbmiZ524p5', name: 'Footprint v3' },
  { id: 'ctpl_X20BklSG9zplCCfMrZJI', name: 'Blueprint' },
  { id: 'ctpl_UoxfGUNJyd21EOr8kClC', name: 'Messages' },
  { id: 'ctpl_UK5Mjc782KB2qouPo709', name: 'Betelgeuse' },
  { id: 'ctpl_SprKAix4SRgIUFwpxOZ1', name: 'Freshly' },
  { id: 'ctpl_SP9YZolOKiJv8tJqMeYC', name: 'Flair' },
  { id: 'ctpl_SHr4UDH7uqZPfXVYIlBC', name: 'Alcyone' },
  { id: 'ctpl_RbfrMonqCaUZbIWZGlG4', name: 'Vitamin B' },
  { id: 'ctpl_P1qdlnbSk4NZERdu6tIO', name: 'Glow' },
  { id: 'ctpl_NVTtZ8SY0Jo4UUFokB8p', name: 'Runway' },
  { id: 'ctpl_NCLdW43y7fggCYnS5miH', name: 'Orbitar Black' },
  { id: 'ctpl_NBpLQoUt2a6hRPdSD3Qp', name: 'Doodle' },
  { id: 'ctpl_LWMH1tfwvAHpzq0LAK7V', name: 'Thuban' },
  { id: 'ctpl_JtJChccdjhEQEC1wiQcn', name: 'Cygnus A' },
  { id: 'ctpl_JJFaDOxMmHWj5B5qSklN', name: 'Orion' },
  { id: 'ctpl_J6YuQpoLwYlBVgSKTIrw', name: 'Lumin' },
  { id: 'ctpl_Fy5WxiGPPAV393kth8mZ', name: 'Linear' },
  { id: 'ctpl_FbiwB6xaJm9CQA3Ot4Tx', name: 'Cove' },
  { id: 'ctpl_DxflLOnuKkb198FNdI9E', name: 'Heat' },
  { id: 'ctpl_Dujj8gkcMe6hoaptLWwU', name: 'Arion Pink' },
  { id: 'ctpl_DcsGeQFyiKLSqHAfC5fF', name: 'Suzy' },
  { id: 'ctpl_Ck8XVyVLYN2YRzwzzwxm', name: 'Chronicle' },
  { id: 'ctpl_Ce9huKC7BtvGK6tQcoXX', name: 'Cartwheel Purple' },
  { id: 'ctpl_Av1JgOg6DoJlXJLwfFFm', name: 'Castor' },
  { id: 'ctpl_A503B1LAyB7A4U2x84p7', name: 'Growth' },
  { id: 'ctpl_A1AMNbzmIat0CEiwrgfI', name: 'Million' },
  { id: 'ctpl_9YoEtziK8O9WvuWYzNZ7', name: 'Daily Mail' },
  { id: 'ctpl_7uui8xzgcjbzVVl1WKaE', name: 'Andromeda' },
  { id: 'ctpl_7ukpFvJbH1PplZLpCz8t', name: 'Zodiac' },
  { id: 'ctpl_5RaXhC2spDHYw40DsgFF', name: 'Poem' },
  { id: 'ctpl_3PwgOIKd3tbOstKPPC4E', name: 'Techwave' },
  { id: 'ctpl_3NY2lfJiFAULlIG2COz9', name: 'Alhena' },
  { id: 'ctpl_2sOSSKWNXgQu3C5eE60l', name: 'Script' },
  { id: 'ctpl_2ryQmZz2Iq4XRX4F8pCU', name: 'Garnet' },
  { id: 'ctpl_17zhen9AkxDAtWNL67ir', name: 'Fuel' },
]

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Component ──────────────────────────────────────────────────────────────

function TemplateCard({ t, isSelected, isProcessing, onSelect }: {
  t: CaptionTemplate; isSelected: boolean; isProcessing: boolean; onSelect: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleMouseEnter() {
    const v = videoRef.current
    if (!v || !t.preview_url) return
    v.play().catch(() => {})
  }

  function handleMouseLeave() {
    const v = videoRef.current
    if (!v || !t.preview_url) return
    v.pause()
    v.currentTime = 0
  }

  return (
    <button
      onClick={onSelect}
      disabled={isProcessing}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative flex flex-col items-start rounded-lg border overflow-hidden text-left transition-all',
        isSelected ? 'border-primary/60 ring-1 ring-primary/40' : 'border-border/60 hover:border-primary/30'
      )}
    >
      <div className="w-full bg-black" style={{ aspectRatio: '9/16' }}>
        {t.preview_url ? (
          <video
            ref={videoRef}
            src={t.preview_url}
            className="w-full h-full object-cover"
            muted
            playsInline
            loop
            preload="metadata"
            onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.5 }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground/40">preview</span>
          </div>
        )}
      </div>
      <div className={cn('px-1.5 py-1 w-full', isSelected ? 'bg-primary/10' : 'bg-card')}>
        <span className={cn('text-[10px] font-medium leading-tight block truncate', isSelected ? 'text-primary' : 'text-foreground/80')}>{t.name}</span>
      </div>
      {isSelected && (
        <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
    </button>
  )
}

export function SubsPanel() {
  const { apiKeys, addLog } = useContentStore()

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [templates, setTemplates] = useState<CaptionTemplate[]>(FALLBACK_TEMPLATES)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [allLoaded, setAllLoaded] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(FALLBACK_TEMPLATES[0].id)

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const videoInputRef = useRef<HTMLInputElement>(null)
  const resultVideoRef = useRef<HTMLVideoElement>(null)

  const captionsKey = apiKeys.captions ?? ''
  const hasKey = captionsKey.length > 0

  useEffect(() => {
    if (!hasKey) return
    fetchCaptionTemplates(captionsKey)
      .then((data) => { if (data.length > 0) { setTemplates(data); setAllLoaded(true) } })
      .catch(() => {})
  }, [captionsKey, hasKey])

  function handleLoadAll() {
    setShowAll(true)
    if (allLoaded) return
    setTemplatesLoading(true)
    fetchCaptionTemplates(captionsKey)
      .then((data) => { if (data.length > 0) setTemplates(data); setAllLoaded(true) })
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }

  function handleVideoFile(file: File) {
    const allowed = ['video/mp4', 'video/quicktime', 'video/mov']
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|mov)$/i)) {
      setError('Поддерживаются только MP4 и MOV файлы')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Максимальный размер файла — 50 МБ')
      return
    }
    setError(null)
    setResultUrl(null)
    setProgress(0)
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setVideoFile(file)
    setVideoPreviewUrl(URL.createObjectURL(file))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleVideoFile(file)
  }

  async function handleSubmit() {
    if (!videoFile || !hasKey || isProcessing) return
    setIsProcessing(true)
    setError(null)
    setResultUrl(null)
    setProgress(0)
    try {
      const fileToSend = await convertVideoTo916(videoFile, addLog)
      const result = await submitCaptionsJob(
        captionsKey,
        fileToSend,
        selectedTemplate,
        addLog,
        setProgress
      )
      setResultUrl(result.videoUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      addLog(`❌ Captions AI ошибка: ${msg}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleRemoveVideo() {
    setVideoFile(null)
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl)
    setVideoPreviewUrl(null)
    setResultUrl(null)
    setError(null)
    setProgress(0)
  }

  function toggleResultPlay() {
    const v = resultVideoRef.current
    if (!v) return
    if (isPlaying) { v.pause(); setIsPlaying(false) }
    else { void v.play(); setIsPlaying(true) }
  }

  function handleFullscreen() {
    const v = resultVideoRef.current
    if (!v) return
    if (v.requestFullscreen) void v.requestFullscreen()
  }

  function handleDownloadResult() {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = `captioned-${Date.now()}.mp4`
    a.click()
  }

  const canSubmit = hasKey && !!videoFile && !isProcessing

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Subtitles className="h-4 w-4 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Subs</h1>
        <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          Captions AI · Auto Subtitles
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Загрузи видео — Captions AI добавит стилизованные субтитры на английском
      </p>

      {!hasKey && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">Нужен Captions AI API Key — добавь его в настройках (⚙)</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Left: Upload + settings ── */}
        <div className="space-y-4">
          {/* Video upload */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <span className="text-sm font-medium text-foreground">Видео</span>
            <p className="text-[11px] text-muted-foreground">MP4 / MOV · 9:16 · до 50 МБ · до 5 минут</p>

            {!videoFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
                onDrop={handleDrop}
                onClick={() => videoInputRef.current?.click()}
                className={cn(
                  'rounded-xl border-2 border-dashed transition-colors p-8 flex flex-col items-center gap-3 cursor-pointer',
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/40 hover:bg-primary/5'
                )}
              >
                <Upload className={cn('h-8 w-8 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground/50')} />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    {isDragging ? 'Отпустите для загрузки' : 'Перетащи видео сюда'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">или нажми для выбора файла</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-black border border-border">
                  <video
                    src={videoPreviewUrl ?? undefined}
                    className="w-full max-h-64 object-contain"
                    muted
                    playsInline
                    loop
                  />
                  <button
                    onClick={handleRemoveVideo}
                    className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-black/70 hover:bg-red-600 flex items-center justify-center transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{videoFile.name}</span>
                  <span className="shrink-0">· {formatFileSize(videoFile.size)}</span>
                </div>
              </div>
            )}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); e.target.value = '' }}
            />
          </div>

          {/* Template selector */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Стиль субтитров</span>
              {templatesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {/* Favorites */}
            <div className="grid grid-cols-5 gap-1.5">
              {templates.filter(t => FAVORITE_IDS.includes(t.id)).map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  isSelected={selectedTemplate === t.id}
                  isProcessing={isProcessing}
                  onSelect={() => setSelectedTemplate(t.id)}
                />
              ))}
            </div>
            {/* All presets */}
            {showAll ? (
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {templates.filter(t => !FAVORITE_IDS.includes(t.id)).map((t) => (
                  <TemplateCard
                    key={t.id}
                    t={t}
                    isSelected={selectedTemplate === t.id}
                    isProcessing={isProcessing}
                    onSelect={() => setSelectedTemplate(t.id)}
                  />
                ))}
              </div>
            ) : (
              <button
                onClick={handleLoadAll}
                className="w-full py-2 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                {templatesLoading ? <span className="flex items-center justify-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Загружаю...</span> : '⊕ Загрузить все пресеты'}
              </button>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full gap-2"
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Обрабатываю... {progress > 0 ? `${progress}%` : ''}
              </>
            ) : (
              <>
                <Subtitles className="h-4 w-4" />
                Сделать субтитры
              </>
            )}
          </Button>

          {/* Progress bar */}
          {isProcessing && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: progress > 0 ? `${progress}%` : '5%' }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                {progress > 0 ? `${progress}% завершено` : 'В очереди...'}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* ── Right: Result ── */}
        <div className="space-y-4">
          {resultUrl ? (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">✅ Готово</span>
                <button
                  onClick={handleDownloadResult}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Скачать
                </button>
              </div>
              <div className="relative rounded-xl overflow-hidden bg-black border border-border group">
                <video
                  ref={resultVideoRef}
                  src={resultUrl}
                  className="w-full object-contain"
                  playsInline
                  loop
                  onEnded={() => setIsPlaying(false)}
                />
                {/* Play/pause overlay */}
                <button
                  onClick={toggleResultPlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div className="h-12 w-12 rounded-full bg-black/60 flex items-center justify-center">
                    {isPlaying
                      ? <Pause className="h-5 w-5 text-white" />
                      : <Play className="h-5 w-5 text-white ml-0.5" />
                    }
                  </div>
                </button>
                {/* Fullscreen button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleFullscreen() }}
                  className="absolute top-2 right-2 h-8 w-8 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Полный экран"
                >
                  <Maximize className="h-4 w-4 text-white" />
                </button>
              </div>
              <Button onClick={handleDownloadResult} variant="outline" className="w-full gap-2" size="sm">
                <Download className="h-4 w-4" />
                Скачать видео с субтитрами
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 flex flex-col items-center justify-center gap-3 text-center h-full min-h-[300px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <Subtitles className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Загрузи видео и нажми «Сделать субтитры»</p>
              <p className="text-xs text-muted-foreground/60">Captions AI добавит стилизованные EN-субтитры</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
