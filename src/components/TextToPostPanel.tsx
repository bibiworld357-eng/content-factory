import { useState, useRef, useEffect } from 'react'
import { Sparkles, Copy, Check, BookOpen, AlertCircle, Loader2, RefreshCw, Mic, Mic2, FileText, Video, Upload, Hash, X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useContentStore } from '@/store/useContentStore'
import type { SarahTextToPostResult, ContentBasedPostResult } from '@/lib/api'
import { generateSarahTextToPost, generateContentBasedPost } from '@/lib/api'
import { createVisionAnalyzer } from '@/lib/vision'
import { cn } from '@/lib/utils'

// ── Sarah Icelyn mind map (same as in NewsToPostPanel) ────────────────────

const SARAH_MINDMAP = `**Sarah Icelyn: Лор и Стратегия Продвижения** (полный текстовый майнд-мап)

**1. Личность и Биография (Лор)**  
├── **Происхождение**  
│   ├── Возраст: 27 лет (род. 20 ноября 1998)  
│   ├── Локация: Toledo, Ohio → Bloomfield Hills, Michigan (США)  
│   └── Корни: Ашкеназские евреи (мама, Польша) + польские (папа)  
├── **Психологический портрет**  
│   ├── Тип: Наблюдатель / Стратег (скрытый эмпат)  
│   ├── Травма: Эмоциональная пустота в семье (мать — только функции, отец отсутствовал)  
│   ├── Страх: Зависимость от других + потеря контроля  
│   ├── Конфликт: Рациональность против чувств  
│   ├── Ключевой страх: если открыться — останешься одна  
│   └── Главная формула персонажа: «Она продаёт ощущение близости, потому что больше всего боится в неё войти»  
└── **Внешность**  
    ├── Гетерохромия (левый глаз — голубой, правый — карий 💙🤎)  
    ├── Длинные чёрные волосы с густой прямой челкой и мягкими волнами до груди  
    ├── Фигура: песочные часы 34-25-37, рост 168 см  
    └── Стиль: минимализм и элегантность (тёмные нейтральные цвета, безупречная опрятность)

**2. Профессиональный Образ (РД)**  
├── **Роль: Дворецкий (Butler) в люксовом отеле / VIP-сервис**  
│   ├── Локация: 5★-отель, частный люкс, апартаменты, VIP-этаж  
│   ├── Атрибуты: идеально сидящая форма, белые перчатки, безупречная выправка  
│   └── Суть: персонализированная забота через строгую дистанцию (помнит предпочтения гостей, создаёт ощущение исключительности)  
└── **Границы сервиса**  
    ├── Без личных встреч  
    ├── Нет видеозвонков и голосовых звонков  
    └── Только иллюзия исключительности и заботы

**3. Маркетинговая Стратегия (OFM)**  
├── **Формула Виральности**  
│   ├── Рабочий референс (трендовый формат, который уже набрал миллионы)  
│   ├── Локация ГЕО (только США: Мичиган, американские спальни, гаражи, люксовые отели, флаги США)  
│   ├── Уникальные черты персонажа (гетерохромия, стиль дворецкого, ЛОР)  
│   └── Триггерная тема (Red Flags в отношениях, психология «холодной» девушки, контраст униформы и домашнего уюта)  
└── **Принципы Контента**  
    ├── Стабильность визуала (единый цветокор, стиль, локации)  
    ├── Запрет на прыжки по нишам (только «Люкс-дворецкий» или «Соседка из Мичигана»)  
    ├── Математический перебор комбинаций (меняем только одну переменную)  
    └── Масштабирование успешных связок (один удачный формат → 5–10 роликов)

**4. Интересы и Привычки**  
├── **Вкусы**  
│   ├── Еда: суши, итальянская паста (карбонара), ночная пицца в 2 часа ночи, клубника в шоколаде, шампанское к десертам  
│   ├── Музыка: The Weeknd, медленный R&B, сексуальная поп (Doja Cat, Ariana Grande)  
│   └── Кино/сериалы: Bridgerton, 365 дней, романтические комедии и драмы  
├── **Стиль общения**  
│   ├── Игривый и кокетливый, но всегда сдержанный и элегантный  
│   ├── Короткие предложения  
│   └── Много комплиментов, вопросов к аудитории и лёгких поддразниваний  
└── **Питомец**: мини-пиг по имени Reaper

**Дополнительно из полного ЛОРа (арки и конфликты)**  
- Конфликты: контроль vs близость, образ vs реальность, забота о других vs отказ заботиться о себе  
- Арка роста: научиться принимать тепло, не теряя контроля  
- Арка стагнации: оставаться идеальной и недосягаемой  
- Теневая арка: эмоциональное истощение от вечного контроля`

// ── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary/50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  )
}

// ── Result card ────────────────────────────────────────────────────────────

function ResultCard({
  icon,
  title,
  enText,
  ruText,
  onAddToVoice,
}: {
  icon: React.ReactNode
  title: string
  enText: string
  ruText: string
  onAddToVoice?: () => void
}) {
  const [showRu, setShowRu] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-card/80">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRu((v) => !v)}
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-md border transition-colors',
              showRu
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/40'
            )}
          >
            {showRu ? '🇷🇺 RU' : '🇺🇸 EN'}
          </button>
          <CopyButton text={showRu ? ruText : enText} />
        </div>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {showRu ? ruText || '—' : enText || '—'}
        </p>
        {onAddToVoice && (
          <button
            onClick={onAddToVoice}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors px-2 py-1 rounded hover:bg-violet-400/10 border border-violet-400/20 hover:border-violet-400/40"
          >
            <Mic2 className="h-3.5 w-3.5" />
            Добавить в voice
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

// ── Extract frames from video file ────────────────────────────────────────
async function extractVideoFrames(file: File, count = 3): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url
    video.onloadedmetadata = () => {
      const dur = video.duration
      const times = count === 1
        ? [dur * 0.3]
        : Array.from({ length: count }, (_, i) => dur * ((i + 1) / (count + 1)))
      const frames: string[] = []
      let idx = 0
      const capture = () => {
        if (idx >= times.length) {
          URL.revokeObjectURL(url)
          resolve(frames)
          return
        }
        video.currentTime = times[idx]
      }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', 0.85))
        idx++
        capture()
      }
      capture()
    }
    video.onerror = () => { URL.revokeObjectURL(url); resolve([]) }
  })
}

export function TextToPostPanel() {
  const { apiKeys, addLog, setActiveTab, setPendingVoiceText, visionProvider } = useContentStore()

  const [duration, setDuration] = useState(15)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SarahTextToPostResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMindmap, setShowMindmap] = useState(false)

  // Content-based section
  const [contentMediaFile, setContentMediaFile] = useState<File | null>(null)
  const [contentMediaThumb, setContentMediaThumb] = useState<string | null>(null)
  const [contentMediaType, setContentMediaType] = useState<'video' | 'image' | null>(null)
  const [contentMessage, setContentMessage] = useState('')
  const [isContentLoading, setIsContentLoading] = useState(false)
  const [contentResult, setContentResult] = useState<ContentBasedPostResult | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [contentDuration, setContentDuration] = useState(15)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const wordsEstimate = Math.round(duration * 2.5)

  useEffect(() => {
    console.log('[TextToPost] contentResult changed:', contentResult)
  }, [contentResult])

  async function handleMediaSelect(file: File) {
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    
    if (!isVideo && !isImage) {
      addLog('⚠️ Поддерживаются только видео и фото', 'error')
      return
    }
    
    setContentMediaFile(file)
    setContentMediaType(isVideo ? 'video' : 'image')
    setContentResult(null)
    setContentError(null)
    
    if (isVideo) {
      const frames = await extractVideoFrames(file, 1)
      if (frames[0]) setContentMediaThumb(frames[0])
    } else {
      // For images, convert directly to base64
      const reader = new FileReader()
      reader.onload = () => setContentMediaThumb(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  async function handleContentGenerate() {
    if (!contentMediaFile || isContentLoading) return
    setIsContentLoading(true)
    setContentError(null)
    setContentResult(null)
    try {
      let frames: string[]
      
      if (contentMediaType === 'video') {
        addLog(`🎬 Извлекаю кадры из видео...`, 'info')
        frames = await extractVideoFrames(contentMediaFile, 3)
        if (frames.length === 0) throw new Error('Не удалось извлечь кадры из видео')
        addLog(`✅ Извлечено ${frames.length} кадров, отправляю в Grok...`, 'info')
      } else {
        // For images, convert to base64 directly
        addLog(`🖼️ Обрабатываю фото...`, 'info')
        const reader = new FileReader()
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(contentMediaFile)
        })
        frames = [imageDataUrl]
        addLog(`✅ Фото готово, отправляю в Grok...`, 'info')
      }
      
      const res = await generateContentBasedPost(createVisionAnalyzer(visionProvider, apiKeys), frames, contentMessage.trim(), contentDuration, addLog)
      console.log('[TextToPost] Content result:', res)
      setContentResult(res)
      addLog(`✅ Результат получен и установлен`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[TextToPost] Error:', err)
      setContentError(msg)
      addLog(`❌ Ошибка: ${msg}`, 'error')
    } finally {
      setIsContentLoading(false)
    }
  }

  async function handleGenerate() {
    if (isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await generateSarahTextToPost(apiKeys.grok, duration, addLog)
      setResult(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      addLog(`❌ Text-to-Post ошибка: ${msg}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">text-to-post</h1>
        <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          Viral Content
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Генерация вирального поста — максимальная эмоциональная реакция
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Left: Controls ── */}
        <div className="space-y-4">

          {/* Mind map button */}
          <button
            onClick={() => setShowMindmap(true)}
            className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors text-left group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Майнд-мап персонажа</p>
              <p className="text-[11px] text-muted-foreground">Лор · Стратегия · ОФМ</p>
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Открыть →</span>
          </button>

          {/* Duration slider */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Длительность видео</span>
              <span className="text-sm font-mono font-bold text-primary">{duration} сек</span>
            </div>
            <Slider
              min={5}
              max={30}
              step={1}
              value={[duration]}
              onValueChange={([v]) => setDuration(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>5 с</span>
              <span className="text-muted-foreground/70">≈ {wordsEstimate} слов озвучки</span>
              <span>30 с</span>
            </div>
          </div>

          {/* Viral tactics hint */}
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Целевые реакции</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { emoji: '😡', label: 'Гнев', desc: 'мужчины бесятся' },
                { emoji: '😂', label: 'Смех', desc: 'абсурдный юмор' },
                { emoji: '🤨', label: 'Недоумение', desc: 'споры в комментах' },
                { emoji: '🔥', label: 'Азарт', desc: 'хотят её жизнь' },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{r.emoji}</span>
                  <span className="font-medium text-foreground/80">{r.label}</span>
                  <span>— {r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isLoading}
            className="w-full gap-2"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Генерирую...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Сгенерировать пост
              </>
            )}
          </Button>

          {result && !isLoading && (
            <Button
              onClick={handleGenerate}
              variant="outline"
              className="w-full gap-2"
              size="sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Перегенерировать
            </Button>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* ── Right: Results ── */}
        <div className="space-y-3">
          {result ? (
            <>
              <ResultCard
                icon={<FileText className="h-4 w-4 text-primary" />}
                title="Текст поста (подпись)"
                enText={result.postText}
                ruText={result.postTextRu}
              />
              <ResultCard
                icon={<Mic className="h-4 w-4 text-violet-400" />}
                title={`Озвучка / Липсинк (${duration}с)`}
                enText={result.voiceoverText}
                ruText={result.voiceoverTextRu}
                onAddToVoice={() => {
                  setPendingVoiceText(result.voiceoverText)
                  setActiveTab('voice')
                }}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 flex flex-col items-center justify-center gap-3 text-center min-h-[300px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <Sparkles className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Нажми «Сгенерировать пост»</p>
              <p className="text-xs text-muted-foreground/60">
                Grok создаст виральный пост и текст озвучки
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Content-Based Post section ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
          {contentMediaType === 'image' ? (
            <ImageIcon className="h-4 w-4 text-primary" />
          ) : (
            <Video className="h-4 w-4 text-primary" />
          )}
          <span className="text-sm font-semibold text-foreground">Пост на основе контента</span>
          <span className="text-[11px] text-muted-foreground/60 ml-1">загрузи видео или фото + опиши происходящее</span>
        </div>

        <div className="p-4 space-y-4">
          {/* Media upload (video or image) */}
          <div
            className={cn(
              'relative rounded-lg border-2 border-dashed transition-colors cursor-pointer',
              contentMediaFile ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/20'
            )}
            onClick={() => mediaInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f && (f.type.startsWith('video/') || f.type.startsWith('image/'))) handleMediaSelect(f)
            }}
          >
            <input
              ref={mediaInputRef}
              type="file"
              accept="video/*,image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMediaSelect(f) }}
            />
            {contentMediaFile ? (
              <div className="flex items-center gap-3 p-3">
                {contentMediaThumb && (
                  <img src={contentMediaThumb} alt="preview" className="h-16 w-24 object-cover rounded-md shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {contentMediaType === 'image' ? (
                      <ImageIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <Video className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <p className="text-sm font-medium text-foreground truncate">{contentMediaFile.name}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {contentMediaType === 'image' ? '🖼️ Фото' : '🎬 Видео'} • {(contentMediaFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setContentMediaFile(null); setContentMediaThumb(null); setContentMediaType(null); setContentResult(null) }}
                  className="shrink-0 p-1 rounded hover:bg-secondary/60"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-6">
                <Upload className="h-7 w-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Загрузить видео или фото</p>
                <p className="text-[11px] text-muted-foreground/50">🎬 mp4, mov, webm • 🖼️ jpg, png, webp</p>
              </div>
            )}
          </div>

          {/* User description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Опиши, что происходит {contentMediaType === 'image' ? 'на фото' : 'в видео'}
            </label>
            <textarea
              value={contentMessage}
              onChange={(e) => setContentMessage(e.target.value)}
              placeholder="Необязательно. Например: снимаю утро в отеле, хочу спровоцировать мужчин... — если пусто, Grok проанализирует сам"
              className="w-full min-h-[90px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Duration for this mode */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground shrink-0">Длительность озвучки:</span>
            <Slider
              min={5} max={30} step={1}
              value={[contentDuration]}
              onValueChange={([v]) => setContentDuration(v)}
              className="flex-1"
            />
            <span className="text-xs font-bold text-primary tabular-nums w-10 text-right">{contentDuration}с</span>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleContentGenerate}
            disabled={isContentLoading || !contentMediaFile}
            className="w-full gap-2"
          >
            {isContentLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Анализирую {contentMediaType === 'image' ? 'фото' : 'видео'}...
              </>
            ) : (
              <><Sparkles className="h-4 w-4" />Сгенерировать пост на основе контента</>
            )}
          </Button>

          {contentError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{contentError}</p>
            </div>
          )}

          {/* Results */}
          {contentResult && (
            <div className="space-y-3 pt-1">
              {contentResult.videoAnalysis && (
                <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {contentMediaType === 'image' ? '🖼️ Анализ фото' : '🎬 Анализ видео'}
                  </p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{contentResult.videoAnalysis}</p>
                </div>
              )}
              <ResultCard
                icon={<FileText className="h-4 w-4 text-primary" />}
                title="Текст поста (подпись)"
                enText={contentResult.postText}
                ruText={contentResult.postTextRu}
              />
              <ResultCard
                icon={<Mic className="h-4 w-4 text-violet-400" />}
                title={`Озвучка (${contentDuration}с)`}
                enText={contentResult.voiceoverText}
                ruText={contentResult.voiceoverTextRu}
                onAddToVoice={() => {
                  setPendingVoiceText(contentResult.voiceoverText)
                  setActiveTab('voice')
                }}
              />
              {/* Hashtags */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Хештеги</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(contentResult.hashtags.join(' '))}
                    className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/50"
                  >
                    <Copy className="h-3 w-3" />Копировать
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contentResult.hashtags.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mind map dialog */}
      <Dialog open={showMindmap} onOpenChange={setShowMindmap}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Майнд-мап персонажа
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono bg-secondary/30 p-4 rounded-lg">
              {SARAH_MINDMAP}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
