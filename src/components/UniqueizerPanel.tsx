import { useCallback, useRef, useState } from 'react'
import { Copy, Upload, Play, Download, Loader2, X, AlertCircle, CheckCircle2, FileVideo } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateId } from '@/lib/utils'
import {
  mulberry32,
  buildVariantPlan,
  buildFfmpegArgs,
  buildVariantName,
} from '@/lib/uniqueizer'
import type { LogLevel } from '@/types'

interface LogEntry {
  id: string
  message: string
  level: LogLevel
  timestamp: number
}

interface VariantResult {
  index: number
  name: string
  url?: string
  status: 'pending' | 'processing' | 'success' | 'error'
  error?: string
}

const ACCEPTED = '.mp4,.mov,.avi,video/mp4,video/quicktime,video/x-msvideo'

async function getVideoSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth || 720, height: v.videoHeight || 1280 })
      URL.revokeObjectURL(v.src)
    }
    v.onerror = () => resolve({ width: 720, height: 1280 })
    v.src = URL.createObjectURL(file)
  })
}

export function UniqueizerPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [count, setCount] = useState(3)
  const [watermark, setWatermark] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<VariantResult[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  // Lazily-loaded FFmpeg-WASM instance (shared across a run).
  const ffmpegRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null)
  const loadPromiseRef = useRef<Promise<void> | null>(null)

  const addLog = useCallback((message: string, level: LogLevel = 'info') => {
    setLogs((prev) => [...prev.slice(-200), { id: generateId(), message, level, timestamp: Date.now() }])
  }, [])

  const loadFfmpeg = useCallback(async () => {
    if (ffmpegRef.current) return
    if (loadPromiseRef.current) return loadPromiseRef.current
    const p = (async () => {
      const base = `${window.location.origin}/ffmpeg`
      const wasmResp = await fetch(`${base}/ffmpeg-core.wasm`)
      if (!wasmResp.ok) throw new Error(`Не удалось загрузить ffmpeg-core.wasm (${wasmResp.status})`)
      const wasmBlobUrl = URL.createObjectURL(await wasmResp.blob())
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const ffmpeg = new FFmpeg()
      ffmpeg.on('log', ({ message }: { message: string }) => {
        if (message.trim()) setLogs((prev) => [...prev.slice(-200), { id: generateId(), message, level: 'info', timestamp: Date.now() }])
      })
      ffmpeg.on('progress', ({ progress: pg }: { progress: number }) => {
        setProgress((prev) => Math.max(prev, Math.min(99, Math.round(pg * 100))))
      })
      // The FFmpeg worker is a module worker, so it must import the ESM core
      // (the UMD build has no `export default` and fails in a module worker).
      await ffmpeg.load({ coreURL: `${base}/ffmpeg-core.esm.js`, wasmURL: wasmBlobUrl })
      URL.revokeObjectURL(wasmBlobUrl)
      ffmpegRef.current = ffmpeg
    })()
    loadPromiseRef.current = p
    try {
      await p
    } finally {
      loadPromiseRef.current = null
    }
  }, [])

  const pickFile = (f: File | null) => {
    if (!f) return
    setResults((prev) => {
      prev.forEach((r) => r.url && URL.revokeObjectURL(r.url))
      return []
    })
    setFile(f)
    setProgress(0)
    addLog(`Выбран файл: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} МБ)`)
  }

  /** Prefer native FFmpeg exposed by the dev server (faster, full codec set). */
  async function isNativeAvailable(): Promise<boolean> {
    if (new URLSearchParams(window.location.search).has('wasm')) return false
    try {
      const r = await fetch('/api/ffmpeg/check')
      if (!r.ok) return false
      const { available } = (await r.json()) as { available: boolean }
      return !!available
    } catch {
      return false
    }
  }

  async function runNative(file: File, dims: { width: number; height: number }, n: number) {
    addLog('Использую системный FFmpeg (dev-сервер).')
    const inputName = 'uniq_src.mp4'
    const buf = await file.arrayBuffer()
    const wr = await fetch(`/api/ffmpeg/write?name=${inputName}`, { method: 'POST', body: buf })
    if (!wr.ok) throw new Error('Не удалось передать файл на обработку')

    // Probe audio via a no-output exec (non-zero exit, logs carry stream info).
    let hasAudio = true
    try {
      const probe = await fetch('/api/ffmpeg/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: ['-i', inputName] }),
      })
      const pd = (await probe.json()) as { logs?: string[] }
      hasAudio = (pd.logs ?? []).some((l) => /Stream.*Audio/i.test(l))
    } catch {
      hasAudio = true
    }
    addLog(hasAudio ? 'Аудиодорожка найдена.' : 'Аудиодорожка не найдена.')

    const rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)
    const produced: string[] = [inputName]
    for (let i = 0; i < n; i++) {
      setResults((prev) => prev.map((r) => (r.index === i + 1 ? { ...r, status: 'processing' } : r)))
      const outName = `uniq_out_${i + 1}.mp4`
      const plan = buildVariantPlan(rng, dims.width, dims.height, { watermark })
      const args = buildFfmpegArgs(inputName, outName, plan, hasAudio)
      addLog(`Копия ${i + 1}/${n}: ffmpeg ${args.join(' ')}`)
      try {
        const execRes = await fetch('/api/ffmpeg/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ args }),
        })
        const execData = (await execRes.json()) as { exitCode: number; logs: string[]; error?: string }
        if (execData.error) throw new Error(execData.error)
        if (execData.exitCode !== 0) throw new Error(`FFmpeg exit ${execData.exitCode}:\n${(execData.logs ?? []).slice(-4).join('\n')}`)
        produced.push(outName)
        const readRes = await fetch(`/api/ffmpeg/read?name=${outName}`)
        if (!readRes.ok) throw new Error('Не удалось прочитать результат')
        const url = URL.createObjectURL(await readRes.blob())
        setResults((prev) => prev.map((r) => (r.index === i + 1 ? { ...r, status: 'success', url } : r)))
        addLog(`Копия ${i + 1} готова.`, 'success')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setResults((prev) => prev.map((r) => (r.index === i + 1 ? { ...r, status: 'error', error: msg } : r)))
        addLog(`Копия ${i + 1}: ошибка — ${msg}`, 'error')
      }
      setProgress(Math.round(((i + 1) / n) * 100))
    }
    fetch('/api/ffmpeg/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: produced }),
    }).catch(() => {})
  }

  async function runWasm(file: File, dims: { width: number; height: number }, n: number) {
    addLog('Загружаю FFmpeg (WASM)…')
    await loadFfmpeg()
    const ffmpeg = ffmpegRef.current
    if (!ffmpeg) throw new Error('FFmpeg не загрузился')

    const { fetchFile } = await import('@ffmpeg/util')
    const inputName = `src_${Date.now()}.${(file.name.split('.').pop() || 'mp4').toLowerCase()}`
    await ffmpeg.writeFile(inputName, await fetchFile(file))

    let hasAudio = true
    try {
      const probeLog: string[] = []
      const off = (e: { message: string }) => probeLog.push(e.message)
      ffmpeg.on('log', off)
      await ffmpeg.exec(['-hide_banner', '-i', inputName]).catch(() => {})
      ffmpeg.off('log', off)
      hasAudio = probeLog.some((l) => /Stream.*Audio/i.test(l))
    } catch {
      hasAudio = true
    }
    addLog(hasAudio ? 'Аудиодорожка найдена.' : 'Аудиодорожка не найдена.')

    const rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)
    for (let i = 0; i < n; i++) {
      setResults((prev) => prev.map((r) => (r.index === i + 1 ? { ...r, status: 'processing' } : r)))
      const outName = `out_${i + 1}_${Date.now()}.mp4`
      const plan = buildVariantPlan(rng, dims.width, dims.height, { watermark })
      const args = buildFfmpegArgs(inputName, outName, plan, hasAudio)
      addLog(`Копия ${i + 1}/${n}: ffmpeg ${args.join(' ')}`)
      try {
        await ffmpeg.exec(args)
        const data = (await ffmpeg.readFile(outName)) as Uint8Array
        const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }))
        await ffmpeg.deleteFile(outName).catch(() => {})
        setResults((prev) => prev.map((r) => (r.index === i + 1 ? { ...r, status: 'success', url } : r)))
        addLog(`Копия ${i + 1} готова.`, 'success')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setResults((prev) => prev.map((r) => (r.index === i + 1 ? { ...r, status: 'error', error: msg } : r)))
        addLog(`Копия ${i + 1}: ошибка — ${msg}`, 'error')
      }
      setProgress(Math.round(((i + 1) / n) * 100))
    }
    await ffmpeg.deleteFile(inputName).catch(() => {})
  }

  const handleStart = async () => {
    if (!file || processing) return
    setProcessing(true)
    setProgress(0)
    const dims = await getVideoSize(file)
    addLog(`Разрешение источника: ${dims.width}×${dims.height}`)

    setResults(
      Array.from({ length: count }, (_, i) => ({
        index: i + 1,
        name: buildVariantName(file.name, i + 1),
        status: 'pending' as const,
      }))
    )

    try {
      if (await isNativeAvailable()) await runNative(file, dims, count)
      else await runWasm(file, dims, count)
      addLog('Обработка завершена.', 'success')
    } catch (err) {
      addLog(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setProcessing(false)
      setProgress(100)
    }
  }

  const downloadAll = () => {
    results.forEach((r) => {
      if (r.status === 'success' && r.url) {
        const a = document.createElement('a')
        a.href = r.url
        a.download = r.name
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
    })
  }

  const successCount = results.filter((r) => r.status === 'success').length

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Copy className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Уникализатор видео</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Создаёт 1–10 уникальных копий видео: к каждой копии применяется случайный набор из ≥4 фильтров FFmpeg
        (кроп+масштаб, микро-поворот, цветокоррекция, шум, микро-изменение скорости), плюс рандомные GOP/CRF/профиль
        x264 и удаление метаданных. Всё одной командой; результаты скачиваются файлами.
      </p>

      {/* File picker */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null) }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileVideo className="h-4 w-4 text-primary" />
            <span className="font-medium">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null) }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-6 w-6" />
            <span className="text-sm">Выберите видео (mp4, mov, avi) или перетащите сюда</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Количество копий (1–10)</span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            disabled={processing}
            className="w-24 rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={watermark}
            onChange={(e) => setWatermark(e.target.checked)}
            disabled={processing}
          />
          <span>Водяной знак (drawtext, экспериментально)</span>
        </label>
        <button
          onClick={handleStart}
          disabled={!file || processing}
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {processing ? 'Обработка…' : 'Старт'}
        </button>
      </div>

      {/* Progress */}
      {(processing || progress > 0) && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-right text-xs text-muted-foreground">{progress}%</div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Результаты ({successCount}/{results.length})</span>
            {successCount > 0 && (
              <button
                onClick={downloadAll}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Download className="h-4 w-4" /> Скачать все
              </button>
            )}
          </div>
          <div className="grid gap-2">
            {results.map((r) => (
              <div key={r.index} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                {r.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {r.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {r.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                {r.status === 'pending' && <div className="h-4 w-4 rounded-full border border-border" />}
                <span className="font-mono">{r.name}</span>
                {r.status === 'error' && <span className="text-xs text-destructive">{r.error}</span>}
                {r.status === 'success' && r.url && (
                  <a
                    href={r.url}
                    download={r.name}
                    className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Download className="h-4 w-4" /> скачать
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed">
            {logs.map((l) => (
              <div
                key={l.id}
                className={cn(
                  l.level === 'error' && 'text-destructive',
                  l.level === 'success' && 'text-emerald-500',
                  l.level === 'info' && 'text-muted-foreground'
                )}
              >
                {l.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
