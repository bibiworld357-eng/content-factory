import { useState, useRef } from 'react'
import { ImagePlay, Link, Upload, X, Loader2, Copy, Check, Download, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import {
  fetchInstagramImage,
  analyzeInstagramImageWithGrok,
  editImageWithGPTImage2,
  editImageWithWavespeed,
  editImageWithSeedream,
  editImageWithGrokImage,
  loadDnaReferenceImage,
  type InstToPostAnalysis,
} from '@/lib/api'
import { createVisionAnalyzer } from '@/lib/vision'
import { VisionProviderToggle } from '@/components/VisionProviderToggle'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function ResultCard({ label, imageUrl, prompt }: { label: string; imageUrl: string; prompt: string }) {
  function handleDownload() {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `inst-to-post-${label.toLowerCase().replace(/\s+/g, '-')}.png`
    a.click()
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <button
          onClick={handleDownload}
          className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <img src={imageUrl} alt={label} className="w-full object-cover" style={{ aspectRatio: '9/16' }} />
      <div className="p-2">
        <div className="flex items-start gap-1">
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 flex-1">{prompt}</p>
          <CopyButton text={prompt} />
        </div>
      </div>
    </div>
  )
}

type GenerationState = 'idle' | 'loading' | 'done' | 'error'

export function InstToPostPanel() {
  const { apiKeys, addLog, visionProvider } = useContentStore()

  const [instagramUrl, setInstagramUrl] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [isFetchingImage, setIsFetchingImage] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [resolution, setResolution] = useState<'0.5k' | '1k' | '2k' | '4k'>('2k')
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '9:16' | '16:9'>('9:16')

  const [analysis, setAnalysis] = useState<InstToPostAnalysis | null>(null)
  const [showPrompts, setShowPrompts] = useState(false)
  const [nanoBananaState, setNanoBananaState] = useState<GenerationState>('idle')
  const [gptImage2State, setGptImage2State] = useState<GenerationState>('idle')
  const [seedreamState, setSeedreamState] = useState<GenerationState>('idle')
  const [grokImageState, setGrokImageState] = useState<GenerationState>('idle')
  const [nanoBananaUrl, setNanoBananaUrl] = useState<string | null>(null)
  const [gptImage2Url, setGptImage2Url] = useState<string | null>(null)
  const [seedreamUrl, setSeedreamUrl] = useState<string | null>(null)
  const [grokImageUrl, setGrokImageUrl] = useState<string | null>(null)
  const [nanoBananaError, setNanoBananaError] = useState<string | null>(null)
  const [gptImage2Error, setGptImage2Error] = useState<string | null>(null)
  const [seedreamError, setSeedreamError] = useState<string | null>(null)
  const [grokImageError, setGrokImageError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState<{ url: string; title: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const grokKey = apiKeys.grok ?? ''
  const wavespeedKey = apiKeys.wavespeed ?? ''

  async function handleFetchImage() {
    if (!instagramUrl.trim()) return
    setFetchError(null)
    setIsFetchingImage(true)
    setImageDataUrl(null)
    setAnalysis(null)
    resetResults()
    try {
      const { dataUrl } = await fetchInstagramImage(instagramUrl.trim())
      setImageDataUrl(dataUrl)
      addLog('✅ Изображение из Instagram загружено', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFetchError(msg)
      addLog(`❌ ${msg}`, 'error')
    } finally {
      setIsFetchingImage(false)
    }
  }

  function handleFileUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    setFetchError(null)
    setAnalysis(null)
    resetResults()
    const reader = new FileReader()
    reader.onload = (e) => setImageDataUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function resetResults() {
    setNanoBananaUrl(null)
    setGptImage2Url(null)
    setSeedreamUrl(null)
    setGrokImageUrl(null)
    setNanoBananaState('idle')
    setGptImage2State('idle')
    setSeedreamState('idle')
    setGrokImageState('idle')
    setNanoBananaError(null)
    setGptImage2Error(null)
    setSeedreamError(null)
    setGrokImageError(null)
    setShowPrompts(false)
  }

  function getResolutionDimensions(res: string, ar: string): { width: number; height: number } {
    const baseSize = res === '0.5k' ? 512 : res === '1k' ? 1024 : res === '2k' ? 2048 : 4096
    if (ar === '1:1') return { width: baseSize, height: baseSize }
    if (ar === '3:4') return { width: Math.round(baseSize * 0.75), height: baseSize }
    if (ar === '9:16') return { width: Math.round(baseSize * 0.5625), height: baseSize }
    if (ar === '16:9') return { width: baseSize, height: Math.round(baseSize * 0.5625) }
    return { width: baseSize, height: baseSize }
  }

  async function handleAnalyze() {
    if (!imageDataUrl || isAnalyzing) return
    if (visionProvider === 'gemini' ? !apiKeys.gemini : !grokKey) {
      addLog(`❌ Нет ${visionProvider === 'gemini' ? 'Gemini' : 'Grok'} API ключа`, 'error'); return
    }
    if (!wavespeedKey) { addLog('❌ Нет Wavespeed API ключа', 'error'); return }

    setIsAnalyzing(true)
    resetResults()
    setAnalysis(null)

    try {
      const analyzer = createVisionAnalyzer(visionProvider, apiKeys)
      const analysisResult = await analyzeInstagramImageWithGrok(analyzer, imageDataUrl, addLog)
      setAnalysis(analysisResult)
      setShowPrompts(true)
      
      // Auto-start generations after 2 seconds to show prompts
      setTimeout(() => {
        handleGenerateWithAnalysis(analysisResult)
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`❌ Ошибка анализа: ${msg}`, 'error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleGenerateWithAnalysis(analysisData: InstToPostAnalysis) {
    if (!imageDataUrl || !wavespeedKey) return
    setShowPrompts(false)

    const dnaRef = await loadDnaReferenceImage()
    if (!dnaRef) { addLog('❌ Не удалось загрузить DNA reference', 'error'); return }
    const { width, height } = getResolutionDimensions(resolution, aspectRatio)

    setNanoBananaState('loading')
    setGptImage2State('loading')
    setSeedreamState('loading')
    setGrokImageState('loading')

    Promise.all([
      (async () => {
        try {
          const res = await editImageWithWavespeed(
            wavespeedKey,
            dnaRef.replace(/^data:[^;]+;base64,/, ''),
            analysisData.nanoBananaPrompt,
            0,
            addLog,
            { resolution, aspectRatio, intensity: 50, extraImages: [] }
          )
          setNanoBananaUrl(res.imageUrl)
          setNanoBananaState('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setNanoBananaError(msg)
          setNanoBananaState('error')
          addLog(`❌ Nano Banana 2: ${msg}`, 'error')
        }
      })(),
      (async () => {
        try {
          const res = await editImageWithGPTImage2(wavespeedKey, [dnaRef], analysisData.gptImage2Prompt, resolution, aspectRatio, addLog)
          setGptImage2Url(res.imageUrl)
          setGptImage2State('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setGptImage2Error(msg)
          setGptImage2State('error')
          addLog(`❌ GPT Image 2: ${msg}`, 'error')
        }
      })(),
      (async () => {
        try {
          const res = await editImageWithSeedream(wavespeedKey, [dnaRef], analysisData.seedreamPrompt, width, height, addLog)
          setSeedreamUrl(res.imageUrl)
          setSeedreamState('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setSeedreamError(msg)
          setSeedreamState('error')
          addLog(`❌ Seedream v4.5: ${msg}`, 'error')
        }
      })(),
      (async () => {
        try {
          const res = await editImageWithGrokImage(grokKey, dnaRef, analysisData.grokImagePrompt, aspectRatio, resolution, addLog)
          setGrokImageUrl(res.imageUrl)
          setGrokImageState('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setGrokImageError(msg)
          setGrokImageState('error')
          addLog(`❌ Grok Image: ${msg}`, 'error')
        }
      })(),
    ])
  }

  async function handleGenerate() {
    if (!analysis || !wavespeedKey || !imageDataUrl) return
    setShowPrompts(false)

    const dnaRef = await loadDnaReferenceImage()
    if (!dnaRef) { addLog('❌ Не удалось загрузить DNA reference', 'error'); return }
    const { width, height } = getResolutionDimensions(resolution, aspectRatio)

    setNanoBananaState('loading')
    setGptImage2State('loading')
    setSeedreamState('loading')
    setGrokImageState('loading')

    Promise.all([
      (async () => {
        try {
          const res = await editImageWithWavespeed(
            wavespeedKey,
            imageDataUrl.replace(/^data:[^;]+;base64,/, ''),
            analysis.nanoBananaPrompt,
            0,
            addLog,
            { resolution, aspectRatio, intensity: 50, extraImages: [] }
          )
          setNanoBananaUrl(res.imageUrl)
          setNanoBananaState('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setNanoBananaError(msg)
          setNanoBananaState('error')
          addLog(`❌ Nano Banana 2: ${msg}`, 'error')
        }
      })(),
      (async () => {
        try {
          const res = await editImageWithGPTImage2(wavespeedKey, [imageDataUrl], analysis.gptImage2Prompt, resolution, aspectRatio, addLog)
          setGptImage2Url(res.imageUrl)
          setGptImage2State('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setGptImage2Error(msg)
          setGptImage2State('error')
          addLog(`❌ GPT Image 2: ${msg}`, 'error')
        }
      })(),
      (async () => {
        try {
          const res = await editImageWithSeedream(wavespeedKey, [imageDataUrl], analysis.seedreamPrompt, width, height, addLog)
          setSeedreamUrl(res.imageUrl)
          setSeedreamState('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setSeedreamError(msg)
          setSeedreamState('error')
          addLog(`❌ Seedream v4.5: ${msg}`, 'error')
        }
      })(),
      (async () => {
        try {
          const res = await editImageWithGrokImage(grokKey, imageDataUrl, analysis.grokImagePrompt, aspectRatio, resolution, addLog)
          setGrokImageUrl(res.imageUrl)
          setGrokImageState('done')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setGrokImageError(msg)
          setGrokImageState('error')
          addLog(`❌ Grok Image: ${msg}`, 'error')
        }
      })(),
    ])
  }

  const canAnalyze = !!imageDataUrl && !isAnalyzing && !analysis
  const canGenerate = !!analysis && nanoBananaState !== 'loading' && gptImage2State !== 'loading' && seedreamState !== 'loading' && grokImageState !== 'loading'
  const isRunning = isAnalyzing || nanoBananaState === 'loading' || gptImage2State === 'loading'

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImagePlay className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">inst-to-post</h2>
        </div>
        <VisionProviderToggle />
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Вставь ссылку из Instagram — Grok проанализирует сеттинг и сгенерирует твою модель в той же сцене
      </p>

      {/* DNA Reference */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🧬 DNA модели</span>
        </div>
        <div className="p-3 space-y-3">
          <img 
            src="/dna-reference.jpg" 
            alt="DNA reference" 
            className="w-full rounded-lg border border-border/50"
          />
          <div className="text-xs text-foreground/80 leading-relaxed space-y-1.5">
            <p>A young woman with subtle, natural heterochromia — left eye soft realistic blue, right eye natural warm brown.</p>
            <p>Long black hair with a full straight fringe and soft natural waves to the chest.</p>
            <p className="pt-1 border-t border-border/30">
              <span className="font-medium">Style:</span> minimalist and elegant — dark neutral tones (black, charcoal, deep navy, muted taupe), clean silhouettes, no excessive accessories, always impeccably neat and put-together.
            </p>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <span className="text-sm font-medium text-foreground">Настройки генерации</span>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Разрешение</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as typeof resolution)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            >
              <option value="0.5k">0.5k</option>
              <option value="1k">1k</option>
              <option value="2k">2k</option>
              <option value="4k">4k</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Соотношение сторон</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            >
              <option value="1:1">1:1 (квадрат)</option>
              <option value="3:4">3:4 (портрет)</option>
              <option value="9:16">9:16 (вертикальное)</option>
              <option value="16:9">16:9 (горизонтальное)</option>
            </select>
          </div>
        </div>
      </div>

      {/* URL Input */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <span className="text-sm font-medium text-foreground">Instagram пост</span>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="url"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFetchImage() }}
              placeholder="https://www.instagram.com/p/..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button
            onClick={handleFetchImage}
            disabled={!instagramUrl.trim() || isFetchingImage}
            variant="secondary"
            size="sm"
            className="shrink-0"
          >
            {isFetchingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Загрузить'}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>или</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            загрузить файл
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
          />
        </div>
        {fetchError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{fetchError}</p>
          </div>
        )}
      </div>

      {/* Image preview */}
      {imageDataUrl && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">Исходное фото</span>
            <button
              onClick={() => { setImageDataUrl(null); setAnalysis(null); resetResults() }}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <img src={imageDataUrl} alt="Instagram source" className="w-full max-h-80 object-contain bg-black/20" />
        </div>
      )}

      {/* Analyze button */}
      {imageDataUrl && !analysis && (
        <Button
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          size="lg"
          className="w-full gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Grok анализирует...
            </>
          ) : (
            <>
              <ImagePlay className="h-4 w-4" />
              Анализировать и Сгенерировать
            </>
          )}
        </Button>
      )}

      {/* Grok analysis + prompts */}
      {analysis && showPrompts && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">🔍 Анализ сеттинга</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{analysis.settingDescription}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Nano Banana 2 Edit — промпт</p>
                <CopyButton text={analysis.nanoBananaPrompt} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">{analysis.nanoBananaPrompt}</p>
              <p className="text-xs text-foreground/80 leading-relaxed pt-1 border-t border-border/50">{analysis.nanoBananaPromptRu}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">GPT Image 2 Edit — промпт</p>
                <CopyButton text={analysis.gptImage2Prompt} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">{analysis.gptImage2Prompt}</p>
              <p className="text-xs text-foreground/80 leading-relaxed pt-1 border-t border-border/50">{analysis.gptImage2PromptRu}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Seedream v4.5 Edit — промпт</p>
                <CopyButton text={analysis.seedreamPrompt} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">{analysis.seedreamPrompt}</p>
              <p className="text-xs text-foreground/80 leading-relaxed pt-1 border-t border-border/50">{analysis.seedreamPromptRu}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Grok Image — промпт</p>
                <CopyButton text={analysis.grokImagePrompt} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">{analysis.grokImagePrompt}</p>
              <p className="text-xs text-foreground/80 leading-relaxed pt-1 border-t border-border/50">{analysis.grokImagePromptRu}</p>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            size="lg"
            className="w-full gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Генерирую...
              </>
            ) : (
              <>
                <ImagePlay className="h-4 w-4" />
                Сгенерировать
              </>
            )}
          </Button>
        </div>
      )}

      {/* Results grid */}
      {!showPrompts && (nanoBananaState !== 'idle' || gptImage2State !== 'idle' || seedreamState !== 'idle' || grokImageState !== 'idle') && (
        <div className="grid grid-cols-4 gap-3">
          {/* Nano Banana */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Nano Banana 2</span>
              {nanoBananaState === 'done' && nanoBananaUrl && (
                <button
                  onClick={() => { const a = document.createElement('a'); a.href = nanoBananaUrl; a.download = 'nano-banana.png'; a.click() }}
                  className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {nanoBananaState === 'loading' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 bg-secondary/10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Генерирую...</span>
              </div>
            )}
            {nanoBananaState === 'done' && nanoBananaUrl && (
              <>
                <img 
                  src={nanoBananaUrl} 
                  alt="Nano Banana result" 
                  className="w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                  style={{ aspectRatio: '9/16' }} 
                  onClick={() => setFullscreenImage({ url: nanoBananaUrl, title: 'Nano Banana 2' })}
                />
                {analysis && (
                  <div className="p-2 flex items-start gap-1">
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 flex-1">{analysis.nanoBananaPrompt}</p>
                    <CopyButton text={analysis.nanoBananaPrompt} />
                  </div>
                )}
              </>
            )}
            {nanoBananaState === 'error' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 px-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-xs text-destructive text-center">{nanoBananaError}</p>
              </div>
            )}
          </div>

          {/* GPT Image 2 */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">GPT Image 2</span>
              {gptImage2State === 'done' && gptImage2Url && (
                <button
                  onClick={() => { const a = document.createElement('a'); a.href = gptImage2Url; a.download = 'gpt-image-2.png'; a.click() }}
                  className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {gptImage2State === 'loading' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 bg-secondary/10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Генерирую...</span>
              </div>
            )}
            {gptImage2State === 'done' && gptImage2Url && (
              <>
                <img 
                  src={gptImage2Url} 
                  alt="GPT Image 2 result" 
                  className="w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                  style={{ aspectRatio: '9/16' }} 
                  onClick={() => setFullscreenImage({ url: gptImage2Url, title: 'GPT Image 2' })}
                />
                {analysis && (
                  <div className="p-2 flex items-start gap-1">
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 flex-1">{analysis.gptImage2Prompt}</p>
                    <CopyButton text={analysis.gptImage2Prompt} />
                  </div>
                )}
              </>
            )}
            {gptImage2State === 'error' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 px-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-xs text-destructive text-center">{gptImage2Error}</p>
              </div>
            )}
          </div>

          {/* Seedream v4.5 */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Seedream v4.5</span>
              {seedreamState === 'done' && seedreamUrl && (
                <button
                  onClick={() => { const a = document.createElement('a'); a.href = seedreamUrl; a.download = 'seedream-v4.5.png'; a.click() }}
                  className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {seedreamState === 'loading' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 bg-secondary/10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Генерирую...</span>
              </div>
            )}
            {seedreamState === 'done' && seedreamUrl && (
              <>
                <img 
                  src={seedreamUrl} 
                  alt="Seedream v4.5 result" 
                  className="w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                  style={{ aspectRatio: '9/16' }} 
                  onClick={() => setFullscreenImage({ url: seedreamUrl, title: 'Seedream v4.5' })}
                />
                {analysis && (
                  <div className="p-2 flex items-start gap-1">
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 flex-1">{analysis.seedreamPrompt}</p>
                    <CopyButton text={analysis.seedreamPrompt} />
                  </div>
                )}
              </>
            )}
            {seedreamState === 'error' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 px-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-xs text-destructive text-center">{seedreamError}</p>
              </div>
            )}
          </div>

          {/* Grok Image */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Grok Image</span>
              {grokImageState === 'done' && grokImageUrl && (
                <button
                  onClick={() => { const a = document.createElement('a'); a.href = grokImageUrl; a.download = 'grok-image.png'; a.click() }}
                  className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {grokImageState === 'loading' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 bg-secondary/10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Генерирую...</span>
              </div>
            )}
            {grokImageState === 'done' && grokImageUrl && (
              <>
                <img 
                  src={grokImageUrl} 
                  alt="Grok Image result" 
                  className="w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                  style={{ aspectRatio: '9/16' }} 
                  onClick={() => setFullscreenImage({ url: grokImageUrl, title: 'Grok Image' })}
                />
                {analysis && (
                  <div className="p-2 flex items-start gap-1">
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 flex-1">{analysis.grokImagePrompt}</p>
                    <CopyButton text={analysis.grokImagePrompt} />
                  </div>
                )}
              </>
            )}
            {grokImageState === 'error' && (
              <div className="aspect-[9/16] flex flex-col items-center justify-center gap-2 px-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-xs text-destructive text-center">{grokImageError}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prompts detail when both done */}
      {analysis && nanoBananaState === 'done' && gptImage2State === 'done' && (
        <ResultCard label="Nano Banana 2 — промпт" imageUrl={nanoBananaUrl!} prompt={analysis.nanoBananaPrompt} />
      )}

      {/* Fullscreen preview modal */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <div className="max-w-4xl max-h-[90vh] flex flex-col gap-3">
            <h3 className="text-white text-lg font-semibold text-center">{fullscreenImage.title}</h3>
            <img 
              src={fullscreenImage.url} 
              alt={fullscreenImage.title}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
