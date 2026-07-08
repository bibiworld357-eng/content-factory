import { useState, useRef, useEffect } from 'react'
import { Mic, Download, Loader2, Play, Pause, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useContentStore } from '@/store/useContentStore'
import { generateVoiceMinimax, fetchMinimaxVoices } from '@/lib/api'
import type { MinimaxVoice } from '@/lib/api'
import { cn } from '@/lib/utils'

const EMOTIONS = [
  { id: 'neutral',   label: 'Нейтральная', emoji: '😐' },
  { id: 'happy',     label: 'Радость',      emoji: '😊' },
  { id: 'sad',       label: 'Грусть',       emoji: '😢' },
  { id: 'angry',     label: 'Злость',       emoji: '😠' },
  { id: 'fearful',   label: 'Страх',        emoji: '😨' },
  { id: 'disgusted', label: 'Отвращение',   emoji: '🤢' },
  { id: 'surprised', label: 'Удивление',    emoji: '😲' },
] as const

const BAR_COUNT = 52
// Pre-computed bar heights (stable, not random)
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) =>
  14 + Math.abs(Math.sin(i * 0.55) * 14 + Math.cos(i * 1.1) * 8)
)

function formatSec(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function formatTime(ms: number): string {
  return formatSec(ms / 1000)
}

export function VoicePanel() {
  const { apiKeys, addLog, setVoiceResult, pendingVoiceText, setPendingVoiceText } = useContentStore()

  const [text, setText] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ audioUrl: string; durationMs: number; sizeBytes: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const [voices, setVoices] = useState<MinimaxVoice[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
  const [isFetchingVoices, setIsFetchingVoices] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [emotion, setEmotion] = useState<string>('neutral')
  const [audioProgress, setAudioProgress] = useState(0) // 0–1
  const [audioDuration, setAudioDuration] = useState(0) // seconds
  const [audioCurrentTime, setAudioCurrentTime] = useState(0) // seconds
  const model = 'speech-2.8-hd'

  const audioRef = useRef<HTMLAudioElement>(null)
  const waveformRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pendingVoiceText) {
      setText(pendingVoiceText)
      setPendingVoiceText(null)
    }
  }, [pendingVoiceText])

  const hasKey = !!apiKeys.minimax
  const charCount = text.length
  const canGenerate = hasKey && charCount > 0 && charCount <= 10000 && !isGenerating && !!selectedVoiceId

  async function loadVoices() {
    if (!hasKey || isFetchingVoices) return
    setIsFetchingVoices(true)
    setVoiceError(null)
    try {
      const list = await fetchMinimaxVoices(apiKeys.minimax)
      setVoices(list)
      if (list.length > 0 && !selectedVoiceId) {
        setSelectedVoiceId(list[0].voice_id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setVoiceError(msg)
    } finally {
      setIsFetchingVoices(false)
    }
  }

  useEffect(() => {
    if (hasKey) loadVoices()
  }, [apiKeys.minimax])

  async function handleGenerate() {
    if (!canGenerate) return
    setIsGenerating(true)
    setError(null)

    if (result?.audioUrl) {
      URL.revokeObjectURL(result.audioUrl)
      setResult(null)
    }
    setIsPlaying(false)

    try {
      const res = await generateVoiceMinimax(apiKeys.minimax, text, selectedVoiceId, speed, model, emotion, addLog)
      setResult(res)
      setVoiceResult(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      addLog(`❌ TTS ошибка: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)
    }
  }

  function handleAudioEnded() {
    setIsPlaying(false)
    setAudioProgress(0)
    setAudioCurrentTime(0)
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    setAudioCurrentTime(audio.currentTime)
    setAudioDuration(audio.duration)
    setAudioProgress(audio.currentTime / audio.duration)
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (audio) setAudioDuration(audio.duration)
  }

  function handleWaveformClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    const el = waveformRef.current
    if (!audio || !el || !audio.duration) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setAudioProgress(ratio)
  }

  function handleDownload() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.audioUrl
    a.download = `voice-sarah-icelyn-${Date.now()}.mp3`
    a.click()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Voice</h1>
        <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          {model}
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Генерация озвучки через Minimax T2A API
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* ── Left panel ── */}
        <div className="space-y-4">

          {/* Voice selector */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Клонированный голос</span>
              <button
                onClick={loadVoices}
                disabled={isFetchingVoices || !hasKey}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn('h-3 w-3', isFetchingVoices && 'animate-spin')} />
                Обновить
              </button>
            </div>
            {isFetchingVoices && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Загружаю голоса…
              </div>
            )}
            {voiceError && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{voiceError}
              </div>
            )}
            {voices.length > 0 && (
              <div className="space-y-1.5">
                {voices.map((v) => (
                  <button key={v.voice_id} onClick={() => setSelectedVoiceId(v.voice_id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors',
                      selectedVoiceId === v.voice_id ? 'border-primary/40 bg-primary/10' : 'border-border hover:bg-secondary/50'
                    )}
                  >
                    <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', selectedVoiceId === v.voice_id ? 'text-primary' : 'text-muted-foreground/30')} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate block font-mono">{v.voice_id}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!isFetchingVoices && !voiceError && voices.length === 0 && hasKey && (
              <p className="text-xs text-muted-foreground">Клонированные голоса не найдены</p>
            )}
          </div>

          {/* No key warning */}
          {!hasKey && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">Добавь Minimax API ключ в настройках (⚙)</p>
            </div>
          )}

          {/* Text area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Текст для озвучки</label>
              <span className={cn('text-xs', charCount > 9000 ? 'text-amber-400' : 'text-muted-foreground')}>
                {charCount.toLocaleString()} / 10 000
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст на любом языке…"
              className="w-full min-h-[160px] px-3 py-2.5 text-sm rounded-lg border border-input bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isGenerating}
            />
          </div>

          {/* Emotion selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Эмоция</label>
            <div className="grid grid-cols-4 gap-1.5">
              {EMOTIONS.map((em) => (
                <button
                  key={em.id}
                  onClick={() => setEmotion(em.id)}
                  disabled={isGenerating}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-colors',
                    emotion === em.id
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border hover:bg-secondary/50 text-muted-foreground'
                  )}
                >
                  <span className="text-lg leading-none">{em.emoji}</span>
                  <span className="text-[10px] leading-tight">{em.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Speed slider */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Скорость речи</label>
              <span className="text-sm font-semibold text-primary tabular-nums">{speed.toFixed(1)}x</span>
            </div>
            <Slider min={0.5} max={2.0} step={0.1} value={[speed]} onValueChange={([v]) => setSpeed(v)} disabled={isGenerating} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.5x — медленнее</span>
              <span>1.0x — норма</span>
              <span>2.0x — быстрее</span>
            </div>
          </div>

          {/* Generate button */}
          <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full gap-2" size="lg">
            {isGenerating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Генерирую озвучку...</>
              : <><Mic className="h-4 w-4" /> Сгенерировать озвучку</>}
          </Button>
        </div>

        {/* ── Right panel ── */}
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Audio result */}
          {result && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Результат</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {formatSec(audioCurrentTime)} / {audioDuration > 0 ? formatSec(audioDuration) : formatTime(result.durationMs)}
                  </span>
                  <span>·</span>
                  <span>{(result.sizeBytes / 1024).toFixed(0)} KB</span>
                  <span>·</span>
                  <span className="text-emerald-400">MP3</span>
                </div>
              </div>

              {/* Native audio (hidden) */}
              <audio
                ref={audioRef}
                src={result.audioUrl}
                onEnded={handleAudioEnded}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className="hidden"
              />

              {/* Player row */}
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlayback}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
                </button>

                {/* Interactive waveform */}
                <div
                  ref={waveformRef}
                  onClick={handleWaveformClick}
                  className="flex flex-1 items-center gap-[3px] h-12 overflow-hidden cursor-pointer select-none"
                  title="Нажмите чтобы перемотать"
                >
                  {BAR_HEIGHTS.map((h, i) => {
                    const barProgress = i / BAR_COUNT
                    const played = barProgress < audioProgress
                    return (
                      <div
                        key={i}
                        className={cn(
                          'w-1 rounded-full transition-colors duration-75',
                          played ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                        style={{ height: `${h}px` }}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Download */}
              <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                Скачать MP3
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!result && !error && !isGenerating && (
            <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <Mic className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Введите текст и нажмите «Сгенерировать озвучку»</p>
              <p className="text-xs text-muted-foreground/60">
                Голос: <span className="text-primary">sarah icelyn</span> · Модель: {model}
              </p>
            </div>
          )}

          {/* Loading state */}
          {isGenerating && (
            <div className="rounded-xl border border-border bg-card/30 p-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">Синтезирую речь…</p>
              <p className="text-xs text-muted-foreground/60">Обычно занимает 3–10 секунд</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
