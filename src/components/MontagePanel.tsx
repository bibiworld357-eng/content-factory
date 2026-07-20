import React, { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { generateId } from '@/lib/utils'
import {
  Clapperboard, Upload, Trash2, ChevronUp, ChevronDown,
  Play, Pause, Scissors, EyeOff, Download,
  Loader2, X, CheckCircle2, AlertCircle,
  SquareDashed, MousePointer, Eraser, Film,
  Maximize, Minimize2, GripVertical,
  PlayCircle, StopCircle, Music, Volume2, Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { useContentStore } from '@/store/useContentStore'
import {
  generateKlingVideoAudioPromptsWithGrok,
  submitKlingVideoToAudio,
  pollKlingVideoToAudioResult,
} from '@/lib/api'
import { createVisionAnalyzer } from '@/lib/vision'
import { VisionProviderToggle } from '@/components/VisionProviderToggle'

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoMask {
  id: string
  x: number   // px in source video
  y: number
  w: number
  h: number
  type: 'erase' | 'blur'  // delogo vs boxblur
}

interface VideoClip {
  id: string
  file: File
  objectUrl: string
  name: string
  duration: number    // seconds
  trimStart: number   // seconds
  trimEnd: number     // seconds
  masks: VideoMask[]
  thumbnail: string           // portrait-correct, for clip list
  timelineThumbnail: string   // landscape letterboxed, for timeline strip
}

type Tool = 'select' | 'erase' | 'blur'

interface AudioSegment {
  id: string
  sourceStart: number  // offset in source audio file (seconds)
  duration: number     // duration of this segment (seconds)
  videoStart: number   // position in final video timeline (seconds)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src) }
    v.onerror = () => resolve(0)
    v.src = URL.createObjectURL(file)
  })
}

async function getVideoTimelineThumbnail(objectUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const c = document.createElement('canvas')
    c.width = 480; c.height = 270
    v.onloadeddata = () => { v.currentTime = 0.5 }
    v.onseeked = () => {
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, 480, 270)
      const vw = v.videoWidth || 480
      const vh = v.videoHeight || 270
      const scale = Math.min(480 / vw, 270 / vh)
      const dw = vw * scale
      const dh = vh * scale
      ctx.drawImage(v, (480 - dw) / 2, (270 - dh) / 2, dw, dh)
      resolve(c.toDataURL('image/jpeg', 0.9))
    }
    v.onerror = () => resolve('')
    v.src = objectUrl
    v.load()
  })
}

async function getVideoThumbnail(objectUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const c = document.createElement('canvas')
    v.onloadeddata = () => { v.currentTime = 0.5 }
    v.onseeked = () => {
      const vw = v.videoWidth || 160
      const vh = v.videoHeight || 90
      const maxDim = 160
      if (vw >= vh) {
        c.width = maxDim
        c.height = Math.round(vh / vw * maxDim)
      } else {
        c.height = maxDim
        c.width = Math.round(vw / vh * maxDim)
      }
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.75))
    }
    v.onerror = () => resolve('')
    v.src = objectUrl
    v.load()
  })
}

function buildAudioSegmentFilter(segments: AudioSegment[], bgVol: string): string {
  const N = segments.length
  if (N === 1) {
    const seg = segments[0]
    const delayMs = Math.round(seg.videoStart * 1000)
    return `[1:a]atrim=start=${seg.sourceStart.toFixed(3)}:duration=${seg.duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${bgVol}[bgmix]`
  }
  const splitPart = `[1:a]asplit=${N}${segments.map((_, i) => `[src${i}]`).join('')}`
  const segParts = segments.map((seg, i) => {
    const delayMs = Math.round(seg.videoStart * 1000)
    return `[src${i}]atrim=start=${seg.sourceStart.toFixed(3)}:duration=${seg.duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${bgVol}[bg${i}]`
  })
  const bgLabels = segments.map((_, i) => `[bg${i}]`).join('')
  const mixPart = `${bgLabels}amix=inputs=${N}:duration=longest:dropout_transition=0[bgmix]`
  return `${splitPart};${segParts.join(';')};${mixPart}`
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 10)
  return `${m}:${String(sec).padStart(2, '0')}.${ms}`
}

async function extractVideoFrame(videoUrl: string, seekTime: number = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    
    video.onloadedmetadata = () => {
      // Seek to middle of video or specified time
      const time = Math.min(seekTime, video.duration / 2)
      video.currentTime = time
    }
    
    video.onseeked = () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } else {
        reject(new Error('Failed to get canvas context'))
      }
      URL.revokeObjectURL(video.src)
    }
    
    video.onerror = () => {
      reject(new Error('Failed to load video'))
      URL.revokeObjectURL(video.src)
    }
    
    video.src = videoUrl
    video.load()
  })
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MontagePanel() {
  const [clips, setClips] = useState<VideoClip[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStep, setProcessStep] = useState('')
  const [progress, setProgress] = useState(0)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [ffmpegLog, setFfmpegLog] = useState<string[]>([])
  const [processError, setProcessError] = useState<string | null>(null)
  type FfmpegStage = 'idle' | 'loading-wasm' | 'compiling' | 'ready' | 'failed'
  const [ffmpegStage, setFfmpegStage] = useState<FfmpegStage>('idle')
  const [ffmpegWasmProgress, setFfmpegWasmProgress] = useState(0)
  const [nativeFfmpeg, setNativeFfmpeg] = useState<boolean | null>(null)

  // Background audio
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null)
  const [bgVolume, setBgVolume] = useState(50) // 0-100
  const [audioIsDragOver, setAudioIsDragOver] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // Audio timeline segments
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([])
  const [selectedAudioSegId, setSelectedAudioSegId] = useState<string | null>(null)
  const [audioCutMode, setAudioCutMode] = useState(false)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [audioDuration, setAudioDuration] = useState(0)
  const audioTrackRef = useRef<HTMLDivElement>(null)
  const audioDragRef = useRef<{ segmentId: string; startX: number; startVideoStart: number } | null>(null)
  const audioSegmentsRef = useRef<AudioSegment[]>([])
  const totalDurationRef = useRef(0)
  const audioDurationRef = useRef(0)
  const bgAudioRef = useRef<HTMLAudioElement>(null)
  const currentTimeRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const timelineBodyRef = useRef<HTMLDivElement>(null)

  // Kling Video-to-Audio
  const { apiKeys, visionProvider } = useContentStore()
  const [klingWishes, setKlingWishes] = useState('')
  const [klingAsmrMode, setKlingAsmrMode] = useState(false)
  const [klingBgmEnabled, setKlingBgmEnabled] = useState(true)
  const [klingGenerating, setKlingGenerating] = useState(false)
  const [klingAudioUrl, setKlingAudioUrl] = useState<string | null>(null)
  const [klingLog, setKlingLog] = useState<string[]>([])
  const klingAudioRef = useRef<HTMLAudioElement>(null)

  // Output preview player
  const outVideoRef = useRef<HTMLVideoElement>(null)
  const [outPlaying, setOutPlaying] = useState(false)
  const [outTime, setOutTime] = useState(0)
  const [outDuration, setOutDuration] = useState(0)
  const [outHoverPct, setOutHoverPct] = useState<number | null>(null)

  // Drawing
  const [drawing, setDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [sequencePlaying, setSequencePlaying] = useState(false)

  const ffmpegRef = useRef<unknown>(null)
  const ffmpegLoadPromiseRef = useRef<Promise<void> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const dragItemIdx = useRef<number | null>(null)
  const sequencePlayingRef = useRef(false)
  const clipsRef = useRef<VideoClip[]>([])
  const advancingRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { sequencePlayingRef.current = sequencePlaying }, [sequencePlaying])
  useEffect(() => { clipsRef.current = clips }, [clips])

  const selectedClip = clips.find((c) => c.id === selectedId) ?? null

  // ── Load clips ──────────────────────────────────────────────────────────────

  const addFiles = useCallback(async (files: File[]) => {
    const videoFiles = files.filter((f) => f.type.startsWith('video/'))
    if (videoFiles.length === 0) return

    const newClips: VideoClip[] = []
    for (const file of videoFiles) {
      const objectUrl = URL.createObjectURL(file)
      const duration = await getVideoDuration(file)
      const thumbnail = await getVideoThumbnail(objectUrl)
      const timelineThumbnail = await getVideoTimelineThumbnail(objectUrl)
      newClips.push({
        id: generateId(),
        file,
        objectUrl,
        name: file.name.replace(/\.[^.]+$/, ''),
        duration,
        trimStart: 0,
        trimEnd: duration,
        masks: [],
        thumbnail,
        timelineThumbnail,
      })
    }

    setClips((prev) => {
      const updated = [...prev, ...newClips]
      if (!selectedId && updated.length > 0) {
        setTimeout(() => setSelectedId(updated[0].id), 0)
      }
      return updated
    })
  }, [selectedId])

  // ── Clip ops ────────────────────────────────────────────────────────────────

  const removeClip = (id: string) => {
    const clip = clips.find((c) => c.id === id)
    if (clip) URL.revokeObjectURL(clip.objectUrl)
    const remaining = clips.filter((c) => c.id !== id)
    setClips(remaining)
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null)
  }

  const moveClip = (id: string, dir: 'up' | 'down') => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      if (dir === 'up' && idx === 0) return prev
      if (dir === 'down' && idx === prev.length - 1) return prev
      const arr = [...prev]
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]
      return arr
    })
  }

  const updateClip = (id: string, patch: Partial<VideoClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const removeMask = (clipId: string, maskId: string) => {
    setClips((prev) =>
      prev.map((c) =>
        c.id === clipId ? { ...c, masks: c.masks.filter((m) => m.id !== maskId) } : c
      )
    )
    redrawCanvas()
  }

  // ── Keep refs in sync ───────────────────────────────────────────────────────

  useEffect(() => { audioSegmentsRef.current = audioSegments }, [audioSegments])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    const el = bgAudioRef.current
    if (!el) return
    el.src = audioObjectUrl ?? ''
    if (audioObjectUrl) el.load()
  }, [audioObjectUrl])

  // ── Audio file loading ───────────────────────────────────────────────────────

  function handleAudioFile(file: File) {
    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
    const newUrl = URL.createObjectURL(file)
    setAudioFile(file)
    setAudioObjectUrl(newUrl)
    setAudioSegments([])
    setSelectedAudioSegId(null)
    setAudioCutMode(false)
    const audio = new window.Audio(newUrl)
    audio.onloadedmetadata = () => {
      const fileDur = audio.duration
      setAudioDuration(fileDur)
      const total = clipsRef.current.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)
      const segs: AudioSegment[] = []
      let pos = 0
      while (pos < total - 0.05) {
        const segDur = Math.min(fileDur, total - pos)
        segs.push({ id: generateId(), sourceStart: 0, duration: segDur, videoStart: pos })
        pos += fileDur
        if (segs.length > 50) break
      }
      if (segs.length === 0) {
        segs.push({ id: generateId(), sourceStart: 0, duration: Math.max(fileDur, total), videoStart: 0 })
      }
      setAudioSegments(segs)
      void computeWaveform(file)
    }
    audio.onerror = () => {
      const total = clipsRef.current.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)
      setAudioSegments([{ id: generateId(), sourceStart: 0, duration: total, videoStart: 0 }])
    }
  }

  function removeAudioFile() {
    setAudioFile(null)
    if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); setAudioObjectUrl(null) }
    setAudioSegments([])
    setSelectedAudioSegId(null)
    setWaveformData([])
    setAudioDuration(0)
    bgAudioRef.current?.pause()
  }

  // ── Kling Video-to-Audio ─────────────────────────────────────────────────────

  async function handleGenerateKlingAudio() {
    // Determine video source: final output or selected clip
    const videoUrl = outputUrl || selectedClip?.objectUrl
    const videoName = outputUrl ? 'финальное видео' : selectedClip?.name || 'клип'

    if (!videoUrl) {
      setKlingLog((prev) => [...prev, '❌ Выбери клип или склей финальное видео'])
      return
    }

    if (!apiKeys.grok) {
      setKlingLog((prev) => [...prev, '❌ Не указан API ключ Grok'])
      return
    }

    if (!apiKeys.wavespeed) {
      setKlingLog((prev) => [...prev, '❌ Не указан API ключ Wavespeed'])
      return
    }

    setKlingGenerating(true)
    setKlingAudioUrl(null)
    setKlingLog([])

    const addKlingLog = (msg: string) => {
      setKlingLog((prev) => [...prev, msg])
    }

    try {
      addKlingLog(`🎬 Используется: ${videoName}`)
      
      // Step 1: Extract video frame for Grok analysis
      addKlingLog('📹 Извлечение кадра из видео...')
      const frameDataUrl = await extractVideoFrame(videoUrl)
      addKlingLog('✅ Кадр извлечен')

      // Step 2: Generate prompts with the selected vision analyzer
      addKlingLog('🧠 Анализ видео...')
      const prompts = await generateKlingVideoAudioPromptsWithGrok(
        createVisionAnalyzer(visionProvider, apiKeys),
        frameDataUrl,
        klingWishes,
        addKlingLog
      )

      // Step 3: Convert video to base64 for Kling API
      addKlingLog('📦 Подготовка видео для отправки...')
      
      // Use direct file for clips, fetch for final output
      const videoBlob = outputUrl 
        ? await fetch(videoUrl).then((r) => r.blob())
        : selectedClip!.file
      
      const videoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(videoBlob)
      })
      addKlingLog('✅ Видео подготовлено')

      // Step 4: Submit to Kling Video-to-Audio
      addKlingLog('🚀 Отправка в Kling Video-to-Audio...')
      const { requestId } = await submitKlingVideoToAudio(
        apiKeys.wavespeed,
        videoDataUrl,
        prompts.soundEffectPrompt,
        klingBgmEnabled ? prompts.bgmPrompt : '', // Only include BGM if enabled
        klingAsmrMode,
        addKlingLog
      )

      // Step 5: Poll for result
      addKlingLog('⏳ Ожидание генерации звука...')
      const audioUrl = await pollKlingVideoToAudioResult(
        apiKeys.wavespeed,
        requestId,
        addKlingLog
      )

      setKlingAudioUrl(audioUrl)
      addKlingLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      addKlingLog('✅ ГОТОВО! Звук сгенерирован')
      addKlingLog(`🔊 SFX (RU): ${prompts.soundEffectPromptRu}`)
      addKlingLog(`🎵 BGM (RU): ${prompts.bgmPromptRu}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addKlingLog(`❌ Ошибка: ${msg}`)
    } finally {
      setKlingGenerating(false)
    }
  }

  function openKlingAudioFullscreen() {
    if (klingAudioUrl && klingAudioRef.current) {
      klingAudioRef.current.play()
    }
  }

  function downloadKlingAudio() {
    if (!klingAudioUrl) return
    const a = document.createElement('a')
    a.href = klingAudioUrl
    a.download = 'kling-audio.mp3'
    a.click()
  }

  // ── Waveform computation ─────────────────────────────────────────────────────

  async function computeWaveform(file: File, barCount = 1000) {
    try {
      const ctx = new AudioContext()
      const buf = await file.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(buf)
      const raw = audioBuffer.getChannelData(0)
      const blockSize = Math.floor(raw.length / barCount)
      const bars: number[] = []
      for (let i = 0; i < barCount; i++) {
        let sum = 0
        for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[i * blockSize + j] ?? 0)
        bars.push(sum / blockSize)
      }
      const maxAmp = bars.reduce((m, v) => Math.max(m, v), 0)
      const normalized = maxAmp > 0 ? bars.map(v => v / maxAmp) : bars
      setWaveformData(normalized)
      ctx.close()
    } catch { /* skip */ }
  }

  // ── Global timeline helpers ───────────────────────────────────────────────────

  function getGlobalTime(): number {
    let acc = 0
    for (const clip of clipsRef.current) {
      if (clip.id === selectedIdRef.current) return acc + (currentTimeRef.current - clip.trimStart)
      acc += clip.trimEnd - clip.trimStart
    }
    return acc
  }

  function syncBgAudio(globalTime: number) {
    const bg = bgAudioRef.current
    if (!bg) return
    const seg = audioSegmentsRef.current.find(s =>
      globalTime >= s.videoStart && globalTime < s.videoStart + s.duration
    )
    if (seg) bg.currentTime = seg.sourceStart + (globalTime - seg.videoStart)
  }

  function seekToGlobalTime(targetGlobal: number) {
    let acc = 0
    for (const clip of clipsRef.current) {
      const dur = clip.trimEnd - clip.trimStart
      if (targetGlobal <= acc + dur) {
        const clipTime = clip.trimStart + (targetGlobal - acc)
        setSelectedId(clip.id)
        setCurrentTime(clipTime)
        if (videoRef.current) videoRef.current.currentTime = clipTime
        syncBgAudio(targetGlobal)
        return
      }
      acc += dur
    }
  }

  function onTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    const container = timelineBodyRef.current
    if (!container || totalDurationRef.current === 0) return
    const rect = container.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left)
    const t = Math.min((x / rect.width) * totalDurationRef.current, totalDurationRef.current)
    seekToGlobalTime(t)
  }

  // ── Audio segment edge resize ──────────────────────────────────────────────

  function onLeftEdgeMouseDown(e: React.MouseEvent, segId: string) {
    e.stopPropagation()
    e.preventDefault()
    const track = audioTrackRef.current
    if (!track) return
    const seg = audioSegmentsRef.current.find(s => s.id === segId)
    if (!seg) return
    const startX = e.clientX
    const startVideoStart = seg.videoStart
    const startSourceStart = seg.sourceStart
    const startDuration = seg.duration
    const onMove = (ev: MouseEvent) => {
      const trackW = audioTrackRef.current!.getBoundingClientRect().width
      const secPerPx = totalDurationRef.current / trackW
      const dtSec = (ev.clientX - startX) * secPerPx
      const newVideoStart = Math.max(0, startVideoStart + dtSec)
      const newSourceStart = Math.max(0, startSourceStart + dtSec)
      const actualDelta = newVideoStart - startVideoStart
      const newDuration = Math.max(0.05, startDuration - actualDelta)
      setAudioSegments(prev => prev.map(s =>
        s.id === segId ? { ...s, videoStart: newVideoStart, sourceStart: newSourceStart, duration: newDuration } : s
      ))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function onRightEdgeMouseDown(e: React.MouseEvent, segId: string) {
    e.stopPropagation()
    e.preventDefault()
    const track = audioTrackRef.current
    if (!track) return
    const seg = audioSegmentsRef.current.find(s => s.id === segId)
    if (!seg) return
    const startX = e.clientX
    const startDuration = seg.duration
    const onMove = (ev: MouseEvent) => {
      const trackW = audioTrackRef.current!.getBoundingClientRect().width
      const secPerPx = totalDurationRef.current / trackW
      const dtSec = (ev.clientX - startX) * secPerPx
      const maxDuration = Math.max(0.05, audioDurationRef.current - seg.sourceStart)
      const newDuration = Math.min(maxDuration, Math.max(0.05, startDuration + dtSec))
      setAudioSegments(prev => prev.map(s =>
        s.id === segId ? { ...s, duration: newDuration } : s
      ))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Audio segment operations ─────────────────────────────────────────────────

  function cutAudioSegment(segId: string, cutVideoTime: number) {
    setAudioSegments(prev => {
      const idx = prev.findIndex(s => s.id === segId)
      if (idx === -1) return prev
      const seg = prev[idx]
      const relCut = cutVideoTime - seg.videoStart
      if (relCut <= 0.1 || relCut >= seg.duration - 0.1) return prev
      const arr = [...prev]
      arr.splice(idx, 1,
        { id: generateId(), sourceStart: seg.sourceStart, duration: relCut, videoStart: seg.videoStart },
        { id: generateId(), sourceStart: seg.sourceStart + relCut, duration: seg.duration - relCut, videoStart: seg.videoStart + relCut }
      )
      return arr
    })
  }

  function deleteAudioSegment(segId: string) {
    setAudioSegments(prev => prev.filter(s => s.id !== segId))
    if (selectedAudioSegId === segId) setSelectedAudioSegId(null)
  }

  function onAudioSegmentMouseDown(e: React.MouseEvent, segId: string) {
    e.stopPropagation()
    const track = audioTrackRef.current
    if (!track) return

    if (audioCutMode) {
      const rect = track.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const cutTime = (clickX / rect.width) * totalDurationRef.current
      cutAudioSegment(segId, cutTime)
      return
    }

    setSelectedAudioSegId(segId)
    const seg = audioSegmentsRef.current.find(s => s.id === segId)
    if (!seg) return
    audioDragRef.current = { segmentId: segId, startX: e.clientX, startVideoStart: seg.videoStart }

    const onMove = (ev: MouseEvent) => {
      if (!audioDragRef.current || !audioTrackRef.current) return
      const trackWidth = audioTrackRef.current.getBoundingClientRect().width
      const dx = ev.clientX - audioDragRef.current.startX
      const dtSec = (dx / trackWidth) * totalDurationRef.current
      const newStart = Math.max(0, audioDragRef.current.startVideoStart + dtSec)
      setAudioSegments(prev => prev.map(s =>
        s.id === audioDragRef.current?.segmentId ? { ...s, videoStart: newStart } : s
      ))
    }
    const onUp = () => {
      audioDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Video preview ───────────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    if (!video || !selectedClip) return
    if (video.src !== selectedClip.objectUrl) {
      video.src = selectedClip.objectUrl
      video.currentTime = selectedClip.trimStart
      setCurrentTime(selectedClip.trimStart)
      advancingRef.current = false
      if (sequencePlayingRef.current) {
        video.addEventListener('loadeddata', () => {
          video.play().then(() => setIsPlaying(true)).catch(() => {})
        }, { once: true })
      }
    }
  }, [selectedClip?.objectUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => {
      setCurrentTime(video.currentTime)

      // ── Audio segment sync ─────────────────────────────────────────────
      const bg = bgAudioRef.current
      if (bg && audioSegmentsRef.current.length > 0 && !video.paused) {
        // Compute accumulated time before the current clip
        let acc = 0
        for (const clip of clipsRef.current) {
          if (clip.id === selectedClip?.id) break
          acc += clip.trimEnd - clip.trimStart
        }
        const globalTime = acc + (video.currentTime - (selectedClip?.trimStart ?? 0))
        const seg = audioSegmentsRef.current.find(s =>
          globalTime >= s.videoStart && globalTime < s.videoStart + s.duration
        )
        if (seg) {
          const expected = seg.sourceStart + (globalTime - seg.videoStart)
          if (bg.paused) {
            bg.currentTime = expected
            bg.play().catch(() => {})
          } else if (Math.abs(bg.currentTime - expected) > 0.35) {
            bg.currentTime = expected  // resync drift
          }
        } else {
          if (!bg.paused) bg.pause()
        }
      }

      if (selectedClip && video.currentTime >= selectedClip.trimEnd) {
        if (sequencePlayingRef.current && !advancingRef.current) {
          advancingRef.current = true
          const idx = clipsRef.current.findIndex(c => c.id === selectedClip.id)
          if (idx >= 0 && idx < clipsRef.current.length - 1) {
            setSelectedId(clipsRef.current[idx + 1].id)
          } else {
            video.pause()
            bgAudioRef.current?.pause()
            setIsPlaying(false)
            setSequencePlaying(false)
            sequencePlayingRef.current = false
            advancingRef.current = false
          }
        } else if (!sequencePlayingRef.current) {
          video.pause()
          video.currentTime = selectedClip.trimStart
          setIsPlaying(false)
        }
      }
      redrawCanvas()
    }
    const onLoad = () => redrawCanvas()
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadeddata', onLoad)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadeddata', onLoad)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClip])

  const togglePlay = () => {
    const v = videoRef.current
    const bg = bgAudioRef.current
    if (!v) return
    if (isPlaying) {
      v.pause()
      bg?.pause()
      setIsPlaying(false)
    } else {
      if (bg && audioSegmentsRef.current.length > 0) {
        syncBgAudio(getGlobalTime())
        bg.play().catch(() => {})
      }
      v.play()
      setIsPlaying(true)
    }
  }

  const playSequence = useCallback(() => {
    if (clips.length === 0) return
    setSequencePlaying(true)
    sequencePlayingRef.current = true
    advancingRef.current = false
    const firstClip = clips[0]
    const bg = bgAudioRef.current
    if (selectedId === firstClip.id) {
      const video = videoRef.current
      if (video) {
        video.currentTime = firstClip.trimStart
        setCurrentTime(firstClip.trimStart)
        if (bg && audioSegmentsRef.current.length > 0) {
          syncBgAudio(0)
          bg.play().catch(() => {})
        }
        video.play().then(() => setIsPlaying(true)).catch(() => {})
      }
    } else {
      setSelectedId(firstClip.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, selectedId])

  const stopSequence = useCallback(() => {
    setSequencePlaying(false)
    sequencePlayingRef.current = false
    advancingRef.current = false
    const video = videoRef.current
    if (video) { video.pause(); setIsPlaying(false) }
    bgAudioRef.current?.pause()
  }, [])

  const playFromCurrent = useCallback(() => {
    const video = videoRef.current
    const bg = bgAudioRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      bg?.pause()
      setIsPlaying(false)
      setSequencePlaying(false)
      sequencePlayingRef.current = false
    } else {
      setSequencePlaying(true)
      sequencePlayingRef.current = true
      advancingRef.current = false
      if (bg && audioSegmentsRef.current.length > 0) {
        syncBgAudio(getGlobalTime())
        bg.play().catch(() => {})
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  // ── Canvas overlay ──────────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || !video.videoWidth) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw saved masks
    if (selectedClip) {
      for (const mask of selectedClip.masks) {
        ctx.fillStyle = mask.type === 'erase' ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)'
        ctx.strokeStyle = mask.type === 'erase' ? 'rgba(239,68,68,0.9)' : 'rgba(59,130,246,0.9)'
        ctx.lineWidth = 3
        ctx.fillRect(mask.x, mask.y, mask.w, mask.h)
        ctx.strokeRect(mask.x, mask.y, mask.w, mask.h)
        // Label
        ctx.fillStyle = mask.type === 'erase' ? 'rgba(239,68,68,1)' : 'rgba(59,130,246,1)'
        ctx.font = `bold ${Math.max(12, canvas.height * 0.025)}px sans-serif`
        ctx.fillText(mask.type === 'erase' ? '✕ Удалить' : '~ Размыть', mask.x + 4, mask.y + 18)
      }
    }

    // Draw current selection
    if (drawRect && drawing) {
      ctx.fillStyle = tool === 'erase' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'
      ctx.strokeStyle = tool === 'erase' ? 'rgba(239,68,68,0.9)' : 'rgba(59,130,246,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.fillRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h)
      ctx.strokeRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h)
      ctx.setLineDash([])
    }
  }, [selectedClip, drawRect, drawing, tool])

  useEffect(() => { redrawCanvas() }, [redrawCanvas])

  const canvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'select') return
    const pos = canvasCoords(e)
    setDrawing(true)
    setDrawStart(pos)
    setDrawRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !drawStart) return
    const pos = canvasCoords(e)
    setDrawRect({
      x: Math.min(pos.x, drawStart.x),
      y: Math.min(pos.y, drawStart.y),
      w: Math.abs(pos.x - drawStart.x),
      h: Math.abs(pos.y - drawStart.y),
    })
  }

  const onCanvasMouseUp = () => {
    if (!drawing || !drawRect || !selectedId) { setDrawing(false); return }
    setDrawing(false)
    if (drawRect.w > 10 && drawRect.h > 10) {
      const mask: VideoMask = {
        id: generateId(),
        x: Math.round(drawRect.x),
        y: Math.round(drawRect.y),
        w: Math.round(drawRect.w),
        h: Math.round(drawRect.h),
        type: tool as 'erase' | 'blur',
      }
      updateClip(selectedId, {
        masks: [...(selectedClip?.masks ?? []), mask],
      })
    }
    setDrawStart(null)
    setDrawRect(null)
  }

  // ── FFmpeg Preload ────────────────────────────────────────────────────────────

  const loadFfmpeg = useCallback(async () => {
    if (ffmpegRef.current) return
    if (ffmpegLoadPromiseRef.current) return ffmpegLoadPromiseRef.current
    const p = (async () => {
      try {
        const base = `${window.location.origin}/ffmpeg`

        // Phase 1: Download WASM with real progress
        setFfmpegStage('loading-wasm')
        setFfmpegWasmProgress(0)
        const wasmResp = await fetch(`${base}/ffmpeg-core.wasm`)
        const total = Number(wasmResp.headers.get('content-length') || 0)
        const reader = wasmResp.body!.getReader()
        const chunks: Uint8Array[] = []
        let loaded = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          loaded += value.length
          if (total) setFfmpegWasmProgress(Math.round(loaded / total * 100))
        }
        const wasmBytes = new Uint8Array(loaded)
        let off = 0
        for (const chunk of chunks) { wasmBytes.set(chunk, off); off += chunk.length }
        const wasmBlobUrl = URL.createObjectURL(new Blob([wasmBytes], { type: 'application/wasm' }))

        // Phase 2: WASM compilation (CPU-bound, show spinner)
        setFfmpegStage('compiling')
        setFfmpegWasmProgress(100)
        const { FFmpeg } = await import('@ffmpeg/ffmpeg')
        const ffmpeg = new FFmpeg()
        ffmpeg.on('log', ({ message }: { message: string }) => {
          setFfmpegLog((prev) => [...prev.slice(-80), message])
        })
        ffmpeg.on('progress', ({ progress: pg }: { progress: number }) => {
          setProgress(Math.round(pg * 100))
        })
        await ffmpeg.load({ coreURL: `${base}/ffmpeg-core.js`, wasmURL: wasmBlobUrl })
        URL.revokeObjectURL(wasmBlobUrl)
        ffmpegRef.current = ffmpeg
        setFfmpegStage('ready')
      } catch {
        setFfmpegStage('failed')
      } finally {
        ffmpegLoadPromiseRef.current = null
      }
    })()
    ffmpegLoadPromiseRef.current = p
    return p
  }, [])

  // Check native FFmpeg + preload WASM on mount
  useEffect(() => {
    fetch('/api/ffmpeg/check')
      .then(r => r.json())
      .then(({ available }) => {
        setNativeFfmpeg(available)
        if (!available) loadFfmpeg()  // Only preload WASM if native not available
      })
      .catch(() => { setNativeFfmpeg(false); loadFfmpeg() })
  }, [loadFfmpeg])

  // ── Native FFmpeg processing (via Vite dev server) ──────────────────────────

  const processVideosNative = async () => {
    if (clips.length === 0) return
    setIsProcessing(true); setProgress(0); setOutputUrl(null)
    setProcessError(null); setFfmpegLog([])
    const log = (msg: string) => { setFfmpegLog(p => [...p.slice(-80), msg]); setProcessStep(msg) }
    const allFiles: string[] = []
    let refW = 0, refH = 0  // Reference dimensions from clip 0 output
    try {
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        const inputName = `input_${i}.mp4`
        const outputName = `clip_${i}.mp4`
        log(`📤 Загружаю клип ${i + 1}/${clips.length}...`)
        const buf = await clip.file.arrayBuffer()
        const wr = await fetch(`/api/ffmpeg/write?name=${inputName}`, { method: 'POST', body: buf })
        if (!wr.ok) throw new Error(`Ошибка загрузки клипа ${i + 1}`)
        allFiles.push(inputName, outputName)

        const hasMasks = clip.masks.length > 0
        let args: string[]

        if (!hasMasks) {
          // Input-side seeking + re-encode; -map 0:a? makes audio optional (silent sources ok)
          args = [
            '-ss', String(clip.trimStart), '-i', inputName,
            '-t', String(clip.trimEnd - clip.trimStart),
            '-map', '0:v', '-map', '0:a?',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
            '-c:a', 'aac', '-ar', '44100',
            outputName,
          ]
          log(`🎬 Обрабатываю клип ${i + 1}...`)
        } else {
          const hasTrim = clip.trimStart > 0 || clip.trimEnd < clip.duration - 0.05
          args = ['-i', inputName]
          if (hasTrim) args.push('-ss', String(clip.trimStart), '-to', String(clip.trimEnd))
          const eraseFilters = clip.masks.filter(m => m.type === 'erase')
            .map(m => `delogo=x=${m.x}:y=${m.y}:w=${m.w}:h=${m.h}:show=0`)
          const blurMasks = clip.masks.filter(m => m.type === 'blur')
          if (eraseFilters.length > 0) args.push('-vf', eraseFilters.join(','))
          else if (blurMasks.length > 0) {
            const n = blurMasks.length + 1
            let chain = `[0:v]split=${n}[base]${blurMasks.map((_, j) => `[s${j}]`).join('')};`
            blurMasks.forEach((m, j) => { chain += `[s${j}]crop=${m.w}:${m.h}:${m.x}:${m.y},boxblur=20:5[b${j}];` })
            blurMasks.forEach((m, j) => {
              chain += `${j === 0 ? '[base]' : `[ov${j-1}]`}[b${j}]overlay=${m.x}:${m.y}${j === blurMasks.length - 1 ? '[vout]' : `[ov${j}]`};`
            })
            args.push('-filter_complex', chain, '-map', '[vout]', '-map', '0:a?')
          }
          args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-ar', '44100', outputName)
          log(`⚙️ Перекодирую клип ${i + 1} (с масками)...`)
        }
        const execRes = await fetch('/api/ffmpeg/exec', { method: 'POST', body: JSON.stringify({ args }), headers: { 'Content-Type': 'application/json' } })
        const execData = await execRes.json() as { exitCode: number; logs: string[]; error?: string }
        if (execData.error) throw new Error(execData.error)
        if (execData.exitCode !== 0) throw new Error(`FFmpeg exit ${execData.exitCode}:\n${execData.logs.slice(-5).join('\n')}`)
        // Parse output dimensions from first clip's FFmpeg log
        if (i === 0) {
          const logStr = execData.logs.join('\n')
          const outIdx = logStr.lastIndexOf('Output #')
          const outSection = outIdx >= 0 ? logStr.substring(outIdx) : logStr
          const m = outSection.match(/Video:.*?(\d{3,5})x(\d{3,5})/)
          if (m) { refW = parseInt(m[1]); refH = parseInt(m[2]) }
        }
        setProgress(Math.round(((i + 1) / clips.length) * 70))
      }

      log('🔗 Объединяю клипы...')
      let finalName: string
      if (clips.length === 1) {
        finalName = 'clip_0.mp4'
      } else {
        allFiles.push('output_final.mp4')
        const n = clips.length
        const inputArgs = clips.flatMap((_, i) => ['-i', `clip_${i}.mp4`])
        log(`🔗 Склеиваю ${n} клипов...`)

        // Normalize all clips to first clip's dimensions (handles minor resolution mismatches)
        const W = refW || 1080, H = refH || 1920
        const scaleFilter = (idx: number) =>
          `[${idx}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2[sv${idx}]`

        const execConcat = async (withAudio: boolean) => {
          const scaleParts = clips.map((_, i) => scaleFilter(i)).join(';')
          // concat requires interleaved pairs: [v0][a0][v1][a1]…
          const interleaved = withAudio
            ? clips.map((_, i) => `[sv${i}][${i}:a:0]`).join('')
            : clips.map((_, i) => `[sv${i}]`).join('')
          const outPads = withAudio ? '[outv][outa]' : '[outv]'
          const filter = `${scaleParts};${interleaved}concat=n=${n}:v=1:a=${withAudio ? 1 : 0}${outPads}`
          const mapArgs = withAudio
            ? ['-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-c:a', 'aac']
            : ['-map', '[outv]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-an']
          const res = await fetch('/api/ffmpeg/exec', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [...inputArgs, '-filter_complex', filter, ...mapArgs, 'output_final.mp4'] }),
          })
          return res.json() as Promise<{ exitCode: number; logs: string[]; error?: string }>
        }

        let concatData = await execConcat(true)
        if (concatData.error) throw new Error(concatData.error)
        if (concatData.exitCode !== 0 && concatData.logs.join('').includes('matches no streams')) {
          log('🔇 Аудио не найдено, склеиваю только видео...')
          concatData = await execConcat(false)
        }
        if (concatData.error) throw new Error(concatData.error)
        if (concatData.exitCode !== 0) throw new Error(`Concat failed:\n${concatData.logs.slice(-5).join('\n')}`)
        finalName = 'output_final.mp4'
      }

      // Mix background audio segments if provided
      if (audioFile && audioSegments.length > 0) {
        log('🎵 Добавляю фоновую озвучку...')
        const audioExt = audioFile.name.split('.').pop() ?? 'mp3'
        const audioName = `bg_audio.${audioExt}`
        const audioBuf = await audioFile.arrayBuffer()
        const audioWr = await fetch(`/api/ffmpeg/write?name=${audioName}`, { method: 'POST', body: audioBuf })
        if (audioWr.ok) {
          allFiles.push(audioName)
          const mixedName = 'output_mixed.mp4'
          allFiles.push(mixedName)
          const bgVol = (bgVolume / 100).toFixed(2)
          const bgFilter = buildAudioSegmentFilter(audioSegments, bgVol)
          // Try mixing with video audio
          const mixRes = await fetch('/api/ffmpeg/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [
            '-i', finalName, '-i', audioName,
            '-filter_complex', `${bgFilter};[0:a]volume=1.0[va];[va][bgmix]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
            '-map', '0:v', '-map', '[aout]',
            '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', mixedName,
          ] }) })
          const mixData = await mixRes.json() as { exitCode: number }
          if (mixData.exitCode === 0) {
            finalName = mixedName
          } else {
            log('🎵 Видео без аудиодорожки — использую только фон...')
            const fbRes = await fetch('/api/ffmpeg/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [
              '-i', finalName, '-i', audioName,
              '-filter_complex', bgFilter,
              '-map', '0:v', '-map', '[bgmix]',
              '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', mixedName,
            ] }) })
            const fbData = await fbRes.json() as { exitCode: number }
            if (fbData.exitCode === 0) finalName = mixedName
          }
        }
      }

      log('📥 Скачиваю результат...')
      const resultResp = await fetch(`/api/ffmpeg/read?name=${finalName}`)
      if (!resultResp.ok) throw new Error('Не удалось прочитать результат')
      const blob = await resultResp.blob()
      setOutputUrl(URL.createObjectURL(blob))
      setProgress(100)
      log('✅ Готово!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setProcessError(msg); log(`❌ Ошибка: ${msg}`)
    } finally {
      setIsProcessing(false)
      fetch('/api/ffmpeg/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: allFiles }) }).catch(() => {})
    }
  }

  // ── FFmpeg Processing ────────────────────────────────────────────────────────

  const processVideos = async () => {
    if (clips.length === 0) return
    setIsProcessing(true)
    setProgress(0)
    setOutputUrl(null)
    setProcessError(null)
    setFfmpegLog([])

    const log = (msg: string) => {
      setFfmpegLog((prev) => [...prev.slice(-80), msg])
      setProcessStep(msg)
    }

    try {
      if (!ffmpegRef.current) {
        log('⏳ Загружаю FFmpeg WASM...')
        await loadFfmpeg()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ffmpeg = ffmpegRef.current as any
      const { fetchFile } = await import('@ffmpeg/util')

      const processedFiles: string[] = []

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        log(`📥 Загружаю клип ${i + 1}/${clips.length}: ${clip.name}`)
        const inputFile = `input_${i}.mp4`
        const outputFile = `clip_${i}.mp4`

        await ffmpeg.writeFile(inputFile, await fetchFile(clip.file))

        const hasMasks = clip.masks.length > 0
        let args: string[]

        if (!hasMasks) {
          // ── Fast path: stream copy (output-side seeking for accurate trim) ──
          args = [
            '-i', inputFile,
            '-ss', String(clip.trimStart), '-to', String(clip.trimEnd),
            '-c', 'copy', '-avoid_negative_ts', 'make_zero', outputFile,
          ]
          log(`⚡ Копирую клип ${i + 1}/${clips.length} (без перекодирования)...`)
        } else {
          // ── Slow path: re-encode with filters ──
          const hasTrim = clip.trimStart > 0 || clip.trimEnd < clip.duration - 0.05
          args = ['-i', inputFile]
          if (hasTrim) args.push('-ss', String(clip.trimStart), '-to', String(clip.trimEnd))

          const eraseFilters = clip.masks
            .filter((m) => m.type === 'erase')
            .map((m) => `delogo=x=${m.x}:y=${m.y}:w=${m.w}:h=${m.h}:show=0`)
          const blurMasks = clip.masks.filter((m) => m.type === 'blur')

          if (eraseFilters.length > 0 && blurMasks.length === 0) {
            args.push('-vf', eraseFilters.join(','))
          } else if (eraseFilters.length === 0 && blurMasks.length > 0) {
            const splitN = blurMasks.length + 1
            let chain = `[0:v]split=${splitN}[base]${blurMasks.map((_, j) => `[s${j}]`).join('')};`
            blurMasks.forEach((m, j) => { chain += `[s${j}]crop=${m.w}:${m.h}:${m.x}:${m.y},boxblur=20:5[b${j}];` })
            blurMasks.forEach((m, j) => {
              const src = j === 0 ? '[base]' : `[ov${j - 1}]`
              const dst = j === blurMasks.length - 1 ? '[vout]' : `[ov${j}]`
              chain += `${src}[b${j}]overlay=${m.x}:${m.y}${dst};`
            })
            args.push('-filter_complex', chain, '-map', '[vout]', '-map', '0:a?')
          } else if (eraseFilters.length > 0 && blurMasks.length > 0) {
            const splitN = blurMasks.length + 1
            let chain = `[0:v]${eraseFilters.join(',')},split=${splitN}[base]${blurMasks.map((_, j) => `[s${j}]`).join('')};`
            blurMasks.forEach((m, j) => { chain += `[s${j}]crop=${m.w}:${m.h}:${m.x}:${m.y},boxblur=20:5[b${j}];` })
            blurMasks.forEach((m, j) => {
              const src = j === 0 ? '[base]' : `[ov${j - 1}]`
              const dst = j === blurMasks.length - 1 ? '[vout]' : `[ov${j}]`
              chain += `${src}[b${j}]overlay=${m.x}:${m.y}${dst};`
            })
            args.push('-filter_complex', chain, '-map', '[vout]', '-map', '0:a?')
          }
          args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', outputFile)
          log(`⚙️ Перекодирую клип ${i + 1}/${clips.length} (с масками)...`)
        }

        await ffmpeg.exec(args)
        processedFiles.push(outputFile)
        setProgress(Math.round(((i + 1) / clips.length) * 70))
      }

      log('🔗 Объединяю клипы...')

      let finalFile: string

      if (processedFiles.length === 1) {
        finalFile = processedFiles[0]
      } else {
        const concatContent = processedFiles.map((f) => `file '${f}'`).join('\n')
        await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent))
        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0',
          '-i', 'concat.txt',
          '-c', 'copy',
          'output_final.mp4',
        ])
        finalFile = 'output_final.mp4'
      }

      // Mix background audio segments if provided
      if (audioFile && audioSegments.length > 0) {
        log('🎵 Добавляю фоновую озвучку...')
        const audioExt = audioFile.name.split('.').pop() ?? 'mp3'
        const audioName = `bg_audio.${audioExt}`
        await ffmpeg.writeFile(audioName, await fetchFile(audioFile))
        const mixedName = 'output_mixed.mp4'
        const bgVol = (bgVolume / 100).toFixed(2)
        const bgFilter = buildAudioSegmentFilter(audioSegments, bgVol)
        try {
          await ffmpeg.exec([
            '-i', finalFile, '-i', audioName,
            '-filter_complex', `${bgFilter};[0:a]volume=1.0[va];[va][bgmix]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
            '-map', '0:v', '-map', '[aout]',
            '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', mixedName,
          ])
          finalFile = mixedName
        } catch {
          try {
            log('🎵 Видео без аудиодорожки — использую только фон...')
            await ffmpeg.exec([
              '-i', finalFile, '-i', audioName,
              '-filter_complex', bgFilter,
              '-map', '0:v', '-map', '[bgmix]',
              '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-shortest', mixedName,
            ])
            finalFile = mixedName
          } catch { /* skip */ }
        }
      }

      log('📤 Экспортирую...')
      const data = await ffmpeg.readFile(finalFile) as Uint8Array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawData = data as any
      const safeBuffer = rawData instanceof Uint8Array
        ? new Uint8Array(rawData.buffer.slice(0) as ArrayBuffer)
        : new Uint8Array(rawData as ArrayBuffer)
      const blob = new Blob([safeBuffer], { type: 'video/mp4' })
      setOutputUrl(URL.createObjectURL(blob))
      setProgress(100)
      log('✅ Готово!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setProcessError(msg)
      log(`❌ Ошибка: ${msg}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadOutput = () => {
    if (!outputUrl) return
    const a = document.createElement('a')
    a.href = outputUrl
    a.download = `montage_${Date.now()}.mp4`
    a.click()
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const totalDuration = clips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)
  totalDurationRef.current = totalDuration
  audioDurationRef.current = audioDuration

  // ── Fullscreen ───────────────────────────────────────────────────────────────

  const toggleFullscreen = () => {
    const el = videoContainerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ── Timeline drag-and-drop ───────────────────────────────────────────────────

  const onTimelineDragStart = (e: React.DragEvent, idx: number) => {
    dragItemIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  const onTimelineDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  const onTimelineDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    const fromIdx = dragItemIdx.current
    if (fromIdx === null || fromIdx === toIdx) { setDragOverIdx(null); return }
    setClips((prev) => {
      const arr = [...prev]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
    dragItemIdx.current = null
    setDragOverIdx(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clapperboard className="h-6 w-6 text-primary" />
            Montage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Склейка видео · Обрезка · Удаление объектов · Экспорт MP4
          </p>
        </div>
        {clips.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Film className="h-3.5 w-3.5" />
            <span>{clips.length} клип{clips.length > 1 ? 'а' : ''} · {formatTime(totalDuration)} итого</span>
          </div>
        )}
      </div>

      {/* Empty state drop zone */}
      {clips.length === 0 && (
        <div
          className={cn(
            'rounded-2xl border-2 border-dashed transition-colors flex flex-col items-center justify-center py-24 cursor-pointer',
            isDragOver ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/40 hover:bg-secondary/20'
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-foreground">Перетащите видеофайлы сюда</p>
          <p className="text-sm text-muted-foreground mt-1">или нажмите для выбора · MP4, MOV, AVI, MKV</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*"
            className="hidden"
            onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
          />
        </div>
      )}

      {/* Editor — 9:16 preview left, controls right */}
      {clips.length > 0 && (
        <div className="flex gap-4 items-start">

          {/* ── LEFT: Large 9:16 Video Preview ── */}
          <div className="flex-none w-[320px] rounded-xl border border-border bg-card overflow-hidden">

            {/* Header: name + tools */}
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
                {selectedClip ? selectedClip.name : 'Превью'}
              </span>
              <div className="flex items-center gap-0.5 bg-secondary/60 rounded-lg p-0.5 shrink-0">
                {([
                  { t: 'select', icon: MousePointer, label: 'Курсор' },
                  { t: 'erase', icon: Eraser, label: 'Удалить объект' },
                  { t: 'blur', icon: SquareDashed, label: 'Размыть область' },
                ] as const).map(({ t, icon: Icon, label }) => (
                  <button
                    key={t}
                    title={label}
                    onClick={() => setTool(t)}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      tool === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* 9:16 Video + canvas */}
            <div
              ref={videoContainerRef}
              className={cn(
                'relative bg-black select-none group/video w-full',
                tool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
              )}
              style={{ aspectRatio: '9/16' }}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                playsInline
                onEnded={() => setIsPlaying(false)}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-auto z-10"
                onMouseDown={onCanvasMouseDown}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={onCanvasMouseUp}
                onMouseLeave={() => { if (drawing) onCanvasMouseUp() }}
              />
              {!selectedClip && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm z-10">
                  Выберите клип
                </div>
              )}

              {/* ── Fullscreen overlay controls ── */}
              {isFullscreen && (
                <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-5 pt-16 space-y-3 pointer-events-auto">
                  {/* Tool selector */}
                  <div className="flex justify-center gap-1 bg-black/50 rounded-xl p-1 w-fit mx-auto">
                    {([  
                      { t: 'select', icon: MousePointer, label: 'Курсор' },
                      { t: 'erase', icon: Eraser, label: 'Удалить объект' },
                      { t: 'blur', icon: SquareDashed, label: 'Размыть область' },
                    ] as const).map(({ t, icon: Icon, label }) => (
                      <button
                        key={t}
                        title={label}
                        onClick={() => setTool(t)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          tool === t ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Play + scrub */}
                  {selectedClip && (
                    <>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={togglePlay}
                          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <input
                          type="range"
                          min={selectedClip.trimStart}
                          max={selectedClip.trimEnd}
                          step={0.05}
                          value={currentTime}
                          onChange={(e) => {
                            const t = Number(e.target.value)
                            if (videoRef.current) videoRef.current.currentTime = t
                            setCurrentTime(t)
                          }}
                          className="flex-1 accent-white h-1.5 cursor-pointer"
                        />
                        <span className="text-xs text-white/80 tabular-nums shrink-0 w-12 text-right">
                          {formatTime(currentTime)}
                        </span>
                      </div>
                      {/* Trim slider */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-white/60 flex items-center gap-1">
                            <Scissors className="h-3 w-3" /> Обрезка
                          </span>
                          <span className="text-[11px] text-white/50 tabular-nums">
                            {formatTime(selectedClip.trimStart)} – {formatTime(selectedClip.trimEnd)}
                          </span>
                        </div>
                        <Slider
                          value={[selectedClip.trimStart, selectedClip.trimEnd]}
                          onValueChange={([s, e]) => {
                            updateClip(selectedClip.id, { trimStart: s, trimEnd: e })
                            if (videoRef.current && videoRef.current.currentTime < s) videoRef.current.currentTime = s
                          }}
                          min={0}
                          max={selectedClip.duration}
                          step={0.05}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Fullscreen button */}
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Выйти из полного экрана' : 'Полный экран'}
                className="absolute bottom-2 right-2 opacity-0 group-hover/video:opacity-100 transition-opacity p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white z-30"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </div>

            {/* Playback + trim controls — hidden in fullscreen (shown as overlay instead) */}
            {!isFullscreen && selectedClip && (
              <div className="px-3 py-2.5 border-t border-border/50 space-y-2.5">
                {/* Play + scrub */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-secondary/60 hover:bg-secondary text-foreground transition-colors"
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    type="range"
                    min={selectedClip.trimStart}
                    max={selectedClip.trimEnd}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value)
                      if (videoRef.current) videoRef.current.currentTime = t
                      setCurrentTime(t)
                    }}
                    className="flex-1 accent-primary h-1.5"
                  />
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {formatTime(currentTime)}
                  </span>
                </div>
                {/* Trim */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Scissors className="h-3 w-3" /> Обрезка
                    </span>
                    <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                      {formatTime(selectedClip.trimStart)} – {formatTime(selectedClip.trimEnd)}
                    </span>
                  </div>
                  <Slider
                    value={[selectedClip.trimStart, selectedClip.trimEnd]}
                    onValueChange={([s, e]) => {
                      updateClip(selectedClip.id, { trimStart: s, trimEnd: e })
                      if (videoRef.current && videoRef.current.currentTime < s) videoRef.current.currentTime = s
                    }}
                    min={0}
                    max={selectedClip.duration}
                    step={0.05}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Clip list + Masks + Process ── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Clip list */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Клипы ({clips.length})
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  + Добавить
                </button>
                <input ref={fileInputRef} type="file" multiple accept="video/*" className="hidden"
                  onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
              </div>
              <div className="divide-y divide-border/50 max-h-[320px] overflow-y-auto">
                {clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    onClick={() => setSelectedId(clip.id)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors group',
                      selectedId === clip.id ? 'bg-primary/10' : 'hover:bg-secondary/30'
                    )}
                  >
                    <div className="w-9 h-14 rounded shrink-0 bg-secondary/60 border border-border/40 overflow-hidden flex items-center justify-center">
                      {clip.thumbnail
                        ? <img src={clip.thumbnail} className="w-full h-full object-contain" />
                        : <Film className="h-3 w-3 text-muted-foreground/40" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{clip.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatTime(clip.trimEnd - clip.trimStart)}
                        {clip.masks.length > 0 && <span className="ml-1 text-primary/70">· {clip.masks.length}M</span>}
                      </p>
                    </div>
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 'up') }}
                        disabled={i === 0}
                        className="p-0.5 hover:text-primary disabled:opacity-20 text-muted-foreground">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveClip(clip.id, 'down') }}
                        disabled={i === clips.length - 1}
                        className="p-0.5 hover:text-primary disabled:opacity-20 text-muted-foreground">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removeClip(clip.id) }}
                        className="p-0.5 hover:text-red-400 text-muted-foreground">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mask list */}
            {selectedClip && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Маски удаления</span>
                  <span className="text-xs text-muted-foreground ml-auto">{selectedClip.masks.length}</span>
                </div>
                {selectedClip.masks.length === 0 ? (
                  <div className="px-3 py-5 text-center">
                    <p className="text-xs text-muted-foreground/60">
                      Выберите инструмент «Удалить» или «Размыть»<br />и нарисуйте область на видео
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50 max-h-[160px] overflow-y-auto">
                    {selectedClip.masks.map((mask, i) => (
                      <div key={mask.id} className="flex items-center gap-2 px-3 py-2">
                        <div className={cn('w-2.5 h-2.5 rounded-sm shrink-0',
                          mask.type === 'erase' ? 'bg-red-500/60' : 'bg-blue-500/60'
                        )} />
                        <span className="text-xs text-foreground flex-1">
                          {mask.type === 'erase' ? 'Удалить' : 'Размыть'} #{i + 1}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{mask.w}×{mask.h}</span>
                        <button onClick={() => removeMask(selectedClip.id, mask.id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Background audio */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Фоновая озвучка</span>
                {audioFile && (
                  <button
                    onClick={removeAudioFile}
                    className="ml-auto text-muted-foreground hover:text-red-400 transition-colors"
                    title="Удалить аудио"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {!audioFile ? (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 py-5 px-3 cursor-pointer transition-colors',
                    audioIsDragOver ? 'bg-primary/10' : 'hover:bg-secondary/20'
                  )}
                  onDragOver={(e) => { e.preventDefault(); setAudioIsDragOver(true) }}
                  onDragLeave={() => setAudioIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setAudioIsDragOver(false)
                    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('audio/') || /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(f.name))
                    if (file) handleAudioFile(file)
                  }}
                  onClick={() => audioInputRef.current?.click()}
                >
                  <Music className="h-6 w-6 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground text-center">Перетащи аудиофайл<br /><span className="text-muted-foreground/60">MP3, WAV, AAC, M4A</span></p>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.aac,.m4a,.ogg,.flac"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleAudioFile(file)
                    }}
                  />
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2">
                    <Music className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs text-foreground truncate">{audioFile.name}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Громкость фона</span>
                      <span className="text-[11px] font-mono font-medium text-foreground">{bgVolume}%</span>
                    </div>
                    <Slider min={0} max={100} step={5} value={[bgVolume]} onValueChange={([v]) => setBgVolume(v)} className="w-full" />
                  </div>
                </div>
              )}
            </div>

            {/* Kling Video-to-Audio */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Kling Video-to-Audio</span>
                </div>
                <VisionProviderToggle />
              </div>
              <div className="p-3 space-y-3">
                {/* Video source indicator */}
                {(outputUrl || selectedClip) && (
                  <div className="flex items-center gap-2 text-xs bg-secondary/30 rounded-lg px-3 py-2">
                    <Film className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-muted-foreground">
                      Видео: <span className="text-foreground font-medium">
                        {outputUrl ? 'Финальное видео' : selectedClip?.name || 'Выбранный клип'}
                      </span>
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Пожелания по звуку</label>
                  <Textarea
                    value={klingWishes}
                    onChange={(e) => setKlingWishes(e.target.value)}
                    placeholder="Опишите желаемый звук: ASMR шепот, природные звуки, музыка в стиле lofi..."
                    className="min-h-[80px] text-xs resize-none"
                    disabled={klingGenerating}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="bgm-enabled"
                      checked={klingBgmEnabled}
                      onChange={(e) => setKlingBgmEnabled(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border"
                      disabled={klingGenerating}
                    />
                    <label htmlFor="bgm-enabled" className="text-xs text-foreground cursor-pointer select-none">
                      Генерировать фоновую музыку (BGM)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="asmr-mode"
                      checked={klingAsmrMode}
                      onChange={(e) => setKlingAsmrMode(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border"
                      disabled={klingGenerating}
                    />
                    <label htmlFor="asmr-mode" className="text-xs text-foreground cursor-pointer select-none">
                      ASMR режим (гипердетализация, близость микрофона)
                    </label>
                  </div>
                </div>

                <Button
                  onClick={handleGenerateKlingAudio}
                  disabled={klingGenerating || (!outputUrl && !selectedClip)}
                  className="w-full gap-2"
                  variant={klingAudioUrl ? 'outline' : 'default'}
                  title={!outputUrl && !selectedClip ? 'Выбери клип или склей финальное видео' : ''}
                >
                  {klingGenerating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Генерация звука...</>
                  ) : (
                    <><Wand2 className="h-4 w-4" /> Сгенерировать звук</>
                  )}
                </Button>

                {!outputUrl && !selectedClip && !klingGenerating && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Загрузи видео или выбери клип из списка
                  </p>
                )}

                {klingAudioUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg p-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Звук готов!</span>
                    </div>
                    <audio ref={klingAudioRef} src={klingAudioUrl} controls className="w-full" />
                    <div className="flex gap-2">
                      <Button
                        onClick={openKlingAudioFullscreen}
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-xs h-8"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Воспроизвести
                      </Button>
                      <Button
                        onClick={downloadKlingAudio}
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-xs h-8"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Скачать
                      </Button>
                    </div>
                  </div>
                )}

                {klingLog.length > 0 && (
                  <details className="rounded-lg border border-border/50 overflow-hidden">
                    <summary className="px-2 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-secondary/20 select-none">
                      Лог генерации ({klingLog.length} строк)
                    </summary>
                    <div className="max-h-[200px] overflow-y-auto bg-black/40 p-2 space-y-0.5">
                      {klingLog.map((line, i) => (
                        <p key={i} className="text-[10px] font-mono text-muted-foreground leading-tight">
                          {line}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>

            {/* Process + progress */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Финальное видео</p>
                <p className="text-xs text-muted-foreground">
                  {clips.length} клип{clips.length > 1 ? 'а' : ''} · {formatTime(totalDuration)} · MP4
                </p>
              </div>
              {/* FFmpeg preload progress */}
              {!isProcessing && ffmpegStage !== 'idle' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    {ffmpegStage === 'loading-wasm' && (
                      <><Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />
                      <span className="text-muted-foreground">Загружаю FFmpeg WASM... <span className="tabular-nums text-primary font-medium">{ffmpegWasmProgress}%</span></span></>
                    )}
                    {ffmpegStage === 'compiling' && (
                      <><Loader2 className="h-3 w-3 animate-spin shrink-0 text-amber-400" />
                      <span className="text-amber-400">Компилирую WASM в браузере...</span></>
                    )}
                    {ffmpegStage === 'ready' && (
                      <><CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span className="text-emerald-400">FFmpeg готов — экспорт будет быстрым</span></>
                    )}
                    {ffmpegStage === 'failed' && (
                      <><AlertCircle className="h-3 w-3 shrink-0 text-red-400" />
                      <span className="text-red-400">Ошибка загрузки FFmpeg — попробуй ещё раз</span></>
                    )}
                  </div>
                  {ffmpegStage === 'loading-wasm' && (
                    <div className="w-full bg-secondary/60 rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all duration-100"
                        style={{ width: `${ffmpegWasmProgress}%` }} />
                    </div>
                  )}
                  {ffmpegStage === 'compiling' && (
                    <div className="w-full bg-secondary/60 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-amber-400/70 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                  )}
                </div>
              )}
              {isProcessing && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />
                    <span className="truncate">{processStep}</span>
                  </div>
                  <div className="w-full bg-secondary/60 rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              {processError && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-all">{processError}</span>
                </div>
              )}
              {outputUrl && !isProcessing && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg p-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Видео готово!</span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {/* Engine indicator */}
                {nativeFfmpeg !== null && !isProcessing && (
                  <div className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg w-fit', nativeFfmpeg ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400')}>
                    {nativeFfmpeg
                      ? <><CheckCircle2 className="h-3 w-3" /> Нативный FFmpeg (быстро)</>
                      : <><AlertCircle className="h-3 w-3" /> WASM — установи FFmpeg для скорости</>}
                  </div>
                )}
                <Button
                  onClick={nativeFfmpeg ? processVideosNative : processVideos}
                  disabled={isProcessing || clips.length === 0 || nativeFfmpeg === null}
                  className="w-full gap-2"
                >
                  {isProcessing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Обработка...</>
                    : nativeFfmpeg === null
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Проверка FFmpeg...</>
                      : <><Film className="h-4 w-4" /> Склеить и экспортировать</>}
                </Button>
                {outputUrl && (
                  <Button variant="outline" onClick={downloadOutput}
                    className="w-full gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                    <Download className="h-4 w-4" />
                    Скачать MP4
                  </Button>
                )}
              </div>
            </div>

            {/* FFmpeg logs */}
            {ffmpegLog.length > 0 && (
              <details className="rounded-xl border border-border overflow-hidden">
                <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-secondary/20 select-none">
                  Лог FFmpeg ({ffmpegLog.length} строк)
                </summary>
                <div className="max-h-[160px] overflow-y-auto bg-black/40 p-2">
                  {ffmpegLog.map((l, i) => (
                    <p key={i} className="text-[10px] font-mono text-muted-foreground/70 leading-tight">{l}</p>
                  ))}
                </div>
              </details>
            )}

          </div>
        </div>
      )}

      {/* Hidden background audio element */}
      <audio ref={bgAudioRef} preload="auto" style={{ display: 'none' }} />

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      {clips.length > 0 && (() => {
        // Compute global playhead position
        let selectedClipAccum = 0
        for (const clip of clips) {
          if (clip.id === selectedId) break
          selectedClipAccum += clip.trimEnd - clip.trimStart
        }
        const globalCurrentTime = selectedClipAccum + (currentTime - (selectedClip?.trimStart ?? 0))
        const playheadPct = totalDuration > 0 ? (globalCurrentTime / totalDuration) * 100 : 0

        return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2">
            <Film className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Таймлайн</span>
            {/* Play/Pause from current position */}
            <button
              onClick={playFromCurrent}
              title={isPlaying ? 'Пауза' : 'Играть с текущей позиции'}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
                isPlaying
                  ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {isPlaying
                ? <Pause className="h-3.5 w-3.5" />
                : <Play className="h-3.5 w-3.5 ml-0.5" />}
            </button>
            {/* Play all from start */}
            <button
              onClick={sequencePlaying ? stopSequence : playSequence}
              title={sequencePlaying ? 'Остановить воспроизведение' : 'Воспроизвести все клипы с начала'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                sequencePlaying && !isPlaying
                  ? 'bg-secondary/60 text-muted-foreground'
                  : sequencePlaying
                    ? 'bg-primary/20 text-primary hover:bg-primary/30'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {sequencePlaying
                ? <><StopCircle className="h-3.5 w-3.5" /> Остановить</>
                : <><PlayCircle className="h-3.5 w-3.5" /> Воспроизвести всё</>}
            </button>
            <span className="text-xs text-muted-foreground/50 ml-auto">{formatTime(totalDuration)} итого · перетащите для изменения порядка</span>
          </div>
          {/* Scrub ruler */}
          <div
            className="relative mx-3 mt-2.5 mb-0 h-5 rounded cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors overflow-hidden group"
            ref={timelineBodyRef}
            onClick={onTimelineClick}
          >
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 bg-primary/20 pointer-events-none"
              style={{ width: `${playheadPct}%` }}
            />
            {/* Playhead line */}
            <div
              className="absolute inset-y-0 w-0.5 bg-primary pointer-events-none"
              style={{ left: `${playheadPct}%` }}
            />
            {/* Time label */}
            <span
              className="absolute top-0.5 text-[9px] font-mono text-primary pointer-events-none select-none"
              style={{ left: `clamp(0px, calc(${playheadPct}% - 12px), calc(100% - 30px))` }}
            >
              {formatTime(globalCurrentTime)}
            </span>
          </div>
          <div className="p-3 pt-1.5 overflow-x-auto space-y-2">
            {/* ── Video clips row ── */}
            <div className="relative flex gap-1.5 min-w-0" style={{ minHeight: 80 }}>
              {/* Playhead overlay */}
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/70 pointer-events-none z-20"
                style={{ left: `${playheadPct}%` }}
              />
              {clips.map((clip, i) => {
                const clipDur = clip.trimEnd - clip.trimStart
                const widthPct = totalDuration > 0 ? (clipDur / totalDuration) * 100 : 100 / clips.length
                const isDragTarget = dragOverIdx === i
                return (
                  <div
                    key={clip.id}
                    draggable
                    onDragStart={(e) => onTimelineDragStart(e, i)}
                    onDragOver={(e) => onTimelineDragOver(e, i)}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={(e) => onTimelineDrop(e, i)}
                    onClick={() => setSelectedId(clip.id)}
                    className={cn(
                      'relative flex flex-col rounded-lg border-2 overflow-hidden cursor-pointer transition-all duration-150 shrink-0',
                      selectedId === clip.id && !sequencePlaying
                        ? 'border-primary shadow-[0_0_0_2px] shadow-primary/20'
                        : sequencePlaying && selectedId === clip.id
                          ? 'border-emerald-400 shadow-[0_0_0_2px] shadow-emerald-400/30'
                          : 'border-border/50 hover:border-border',
                      isDragTarget && 'border-primary/60 bg-primary/5 scale-[1.02]',
                    )}
                    style={{ width: `max(80px, ${widthPct}%)`, minWidth: 80 }}
                  >
                    {/* Thumbnail strip */}
                    <div className="relative h-14 bg-[#111] overflow-hidden">
                      {clip.timelineThumbnail
                        ? <img src={clip.timelineThumbnail} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Film className="h-4 w-4 text-muted-foreground/30" /></div>
                      }
                      {/* Clip index badge */}
                      <span className="absolute top-1 left-1 text-[10px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded">
                        {i + 1}
                      </span>
                      {/* Drag handle */}
                      <span className="absolute top-1 right-1 text-white/40">
                        <GripVertical className="h-3 w-3" />
                      </span>
                      {/* Mask indicator */}
                      {clip.masks.length > 0 && (
                        <span className="absolute bottom-1 right-1 text-[9px] bg-primary/80 text-white px-1 rounded">
                          {clip.masks.length}M
                        </span>
                      )}
                    </div>
                    {/* Clip info */}
                    <div className="px-1.5 py-1 bg-card">
                      <p className="text-[10px] font-medium text-foreground truncate leading-tight">{clip.name}</p>
                      <p className="text-[9px] text-muted-foreground tabular-nums">{formatTime(clipDur)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Audio track row ── */}
            {audioSegments.length > 0 && (
              <div className="space-y-1">
                {/* Track header */}
                <div className="flex items-center gap-2 px-1">
                  <Music className="h-3 w-3 text-violet-400 shrink-0" />
                  <span className="text-[10px] text-violet-400/80 font-semibold uppercase tracking-wide">Аудио</span>
                  <button
                    onClick={() => setAudioCutMode(v => !v)}
                    className={cn(
                      'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors',
                      audioCutMode
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    )}
                    title="Режим разрезания — нажми на сегмент чтобы разрезать"
                  >
                    <Scissors className="h-2.5 w-2.5" />
                    {audioCutMode ? 'Разрезать (вкл)' : 'Разрезать'}
                  </button>
                  {selectedAudioSegId && (
                    <button
                      onClick={() => deleteAudioSegment(selectedAudioSegId)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                      Удалить
                    </button>
                  )}
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {audioFile?.name ?? ''}
                  </span>
                </div>
                {/* Track surface */}
                <div
                  ref={audioTrackRef}
                  className={cn(
                    'relative w-full rounded-md overflow-hidden',
                    audioCutMode ? 'cursor-crosshair' : ''
                  )}
                  style={{ height: 40 }}
                >
                  {/* Track background */}
                  <div className="absolute inset-0 bg-violet-950/30 border border-violet-500/15 rounded-md" />
                  {/* Segments */}
                  {audioSegments.map(seg => {
                    const leftPct = totalDuration > 0 ? (seg.videoStart / totalDuration) * 100 : 0
                    const widthPct = totalDuration > 0 ? (seg.duration / totalDuration) * 100 : 0
                    const isSelected = selectedAudioSegId === seg.id
                    return (
                      <div
                        key={seg.id}
                        className={cn(
                          'absolute top-1 bottom-1 rounded border overflow-hidden select-none',
                          isSelected
                            ? 'border-violet-400 bg-violet-500/35 z-10'
                            : 'border-violet-500/40 bg-violet-600/20 hover:bg-violet-500/28',
                          audioCutMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
                        )}
                        style={{ left: `${leftPct}%`, width: `max(3px, ${widthPct}%)` }}
                        onMouseDown={(e) => onAudioSegmentMouseDown(e, seg.id)}
                      >
                        {/* Left resize handle */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2.5 z-20 cursor-ew-resize flex items-center justify-center group/lh hover:bg-white/10 rounded-l"
                          onMouseDown={(e) => onLeftEdgeMouseDown(e, seg.id)}
                        >
                          <div className="w-0.5 h-3/5 bg-violet-300/50 rounded-full group-hover/lh:bg-violet-200/90 transition-colors" />
                        </div>
                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2.5 z-20 cursor-ew-resize flex items-center justify-center group/rh hover:bg-white/10 rounded-r"
                          onMouseDown={(e) => onRightEdgeMouseDown(e, seg.id)}
                        >
                          <div className="w-0.5 h-3/5 bg-violet-300/50 rounded-full group-hover/rh:bg-violet-200/90 transition-colors" />
                        </div>
                        {/* Real waveform */}
                        <div className="absolute inset-0 flex items-end px-px pb-px overflow-hidden pointer-events-none">
                          {(() => {
                            if (waveformData.length === 0 || audioDuration === 0) {
                              return Array.from({ length: 20 }, (_, i) => (
                                <div key={i} className="flex-1 bg-violet-400/30 rounded-sm" style={{ height: '40%' }} />
                              ))
                            }
                            const startIdx = Math.floor((seg.sourceStart / audioDuration) * waveformData.length)
                            const endIdx = Math.min(Math.ceil(((seg.sourceStart + seg.duration) / audioDuration) * waveformData.length), waveformData.length)
                            const raw = waveformData.slice(startIdx, endIdx)
                            const BAR_COUNT = 80
                            const step = Math.max(1, raw.length / BAR_COUNT)
                            const bars = Array.from({ length: Math.min(BAR_COUNT, raw.length) }, (_, i) => raw[Math.floor(i * step)] ?? 0)
                            return bars.map((amp, i) => (
                              <div
                                key={i}
                                className="flex-1 min-w-0 bg-violet-400/70 rounded-sm"
                                style={{ height: `${Math.max(8, amp * 92)}%` }}
                              />
                            ))
                          })()}
                        </div>
                        {/* Time label */}
                        {widthPct > 4 && (
                          <span className="absolute left-1 top-0.5 text-[9px] text-violet-300/70 font-mono leading-none pointer-events-none select-none">
                            {seg.videoStart.toFixed(1)}s
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        )
      })()}

      {/* Output preview */}
      {outputUrl && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-foreground">Готовое видео</span>
            </div>
            <Button variant="outline" size="sm" onClick={downloadOutput}
              className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              <Download className="h-3.5 w-3.5" />
              Скачать MP4
            </Button>
          </div>
          <div className="p-3 space-y-2">
            {/* Video */}
            <div
              className="relative cursor-pointer group/out"
              onClick={() => {
                const v = outVideoRef.current
                if (!v) return
                if (outPlaying) { v.pause(); setOutPlaying(false) }
                else { v.play(); setOutPlaying(true) }
              }}
            >
              <video
                ref={outVideoRef}
                src={outputUrl}
                className="w-full max-h-[480px] rounded-lg bg-black object-contain"
                onTimeUpdate={() => setOutTime(outVideoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => { setOutDuration(outVideoRef.current?.duration ?? 0); setOutTime(0) }}
                onEnded={() => setOutPlaying(false)}
              />
              {/* Play/pause overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/out:opacity-100 transition-opacity pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                  {outPlaying
                    ? <Pause className="h-5 w-5 text-white" />
                    : <Play className="h-5 w-5 text-white ml-0.5" />}
                </div>
              </div>
            </div>
            {/* Scrubber */}
            <div className="px-1 space-y-1">
              <div
                className="relative h-2 rounded-full bg-emerald-900/50 cursor-pointer group/scrub"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  const t = pct * outDuration
                  if (outVideoRef.current) outVideoRef.current.currentTime = t
                  setOutTime(t)
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setOutHoverPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
                }}
                onMouseLeave={() => setOutHoverPct(null)}
              >
                {/* Filled */}
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-400/70 rounded-full transition-none"
                  style={{ width: outDuration > 0 ? `${(outTime / outDuration) * 100}%` : '0%' }}
                />
                {/* Hover ghost */}
                {outHoverPct !== null && (
                  <div
                    className="absolute inset-y-0 left-0 bg-emerald-300/30 rounded-full pointer-events-none"
                    style={{ width: `${outHoverPct * 100}%` }}
                  />
                )}
                {/* Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-400 shadow opacity-0 group-hover/scrub:opacity-100 transition-opacity"
                  style={{ left: outDuration > 0 ? `${(outTime / outDuration) * 100}%` : '0%' }}
                />
              </div>
              {/* Times */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 transition-colors text-emerald-400"
                    onClick={() => {
                      const v = outVideoRef.current
                      if (!v) return
                      if (outPlaying) { v.pause(); setOutPlaying(false) }
                      else { v.play(); setOutPlaying(true) }
                    }}
                  >
                    {outPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-px" />}
                  </button>
                  <span className="text-[11px] font-mono text-emerald-400">{formatTime(outTime)}</span>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground/60">{formatTime(outDuration)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
