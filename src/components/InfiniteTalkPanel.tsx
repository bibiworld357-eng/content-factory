import { useState, useRef, useCallback, useEffect } from 'react'
import { Clapperboard, Download, Loader2, Play, Pause, CheckCircle2, AlertCircle, ImageIcon, Music, RefreshCw, ChevronDown, ChevronUp, X, Upload, Eye, Shuffle, ZoomIn, Paintbrush, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useContentStore } from '@/store/useContentStore'
import {
  generateInfiniteTalkPrompts,
  generateNanoBananaMultiRef,
  submitInfiniteTalk,
  generateLipSyncPromptFromImage,
} from '@/lib/api'
import type { InfiniteTalkPrompts, NanoBananaMultiResult, LipSyncFromImageResult } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────

const EMOTIONS = [
  { id: 'neutral',   label: 'Нейтр.',    emoji: '😐' },
  { id: 'happy',     label: 'Радость',   emoji: '😊' },
  { id: 'sad',       label: 'Грусть',    emoji: '😢' },
  { id: 'angry',     label: 'Злость',    emoji: '😠' },
  { id: 'fearful',   label: 'Страх',     emoji: '😨' },
  { id: 'disgusted', label: 'Отвращ.',   emoji: '🤢' },
  { id: 'surprised', label: 'Удивл.',    emoji: '😲' },
] as const

const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '3:4'] as const
const RESOLUTIONS = ['1k', '2k', '4k'] as const

const BEDROOM_IMAGES = [
  '/assets/infinitetalk/bedroom1.jpg',
  '/assets/infinitetalk/bedroom2.jpg',
  '/assets/infinitetalk/bedroom3.jpg',
  '/assets/infinitetalk/bedroom4.jpg',
]

const LIVINGROOM_IMAGES = [
  '/assets/infinitetalk/livingroom1.jpg',
  '/assets/infinitetalk/livingroom2.jpg',
  '/assets/infinitetalk/livingroom3.jpg',
  '/assets/infinitetalk/livingroom4.jpg',
]

const ROOM_TYPES = [
  { id: 'bedroom', name: '🛏️ Спальня', images: BEDROOM_IMAGES },
  { id: 'livingroom', name: '🛋️ Гостиная', images: LIVINGROOM_IMAGES },
] as const

const DNA_IMAGE = '/assets/infinitetalk/dna-face.jpg'

const LIPSYNC_EMOTION_TEMPLATES: Record<string, string> = {
  neutral:   'Young woman with heterochromia looking directly at camera with calm neutral expression, natural selfie video.',
  happy:     'Young woman with heterochromia speaking to camera with a bright joyful smile, natural selfie video.',
  sad:       'Young woman with heterochromia speaking to camera with sad melancholy expression, slightly downcast, selfie video.',
  angry:     'Young woman with heterochromia speaking directly to camera with intense angry expression, selfie video.',
  fearful:   'Young woman with heterochromia speaking to camera with wide frightened eyes, fearful expression, selfie video.',
  disgusted: 'Young woman with heterochromia speaking to camera with a subtle disgusted expression, selfie video.',
  surprised: 'Young woman with heterochromia speaking to camera with surprised wide eyes, slightly open mouth, selfie video.',
}

const DNA_DISPLAY_TEXT = `A young woman with subtle, natural heterochromia — left eye soft realistic blue, right eye natural warm brown. Long black hair with a full straight fringe and soft natural waves to the chest. Style: minimalist and elegant — dark neutral tones (black, charcoal, deep navy, muted taupe), clean silhouettes, no excessive accessories, always impeccably neat and put-together.`

async function downloadImageClean(url: string, filename = 'image.png'): Promise<void> {
  const resp = await fetch(url)
  const sourceBlob = await resp.blob()
  const bitmap = await createImageBitmap(sourceBlob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const cleanBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  )
  const objectUrl = URL.createObjectURL(cleanBlob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
}

async function fetchImageAsDataUrl(path: string): Promise<string> {
  const resp = await fetch(path)
  if (!resp.ok) throw new Error(`Failed to load reference image: ${path}`)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface UploadedFrame {
  id: string
  objectUrl: string
  emotion: string
  fileName: string
  maskDataUrl?: string
}

// ── Mask Drawing Modal ─────────────────────────────────────────────────────

function MaskDrawingModal({
  imageUrl,
  existingMask,
  onSave,
  onClose,
}: {
  imageUrl: string
  existingMask?: string
  onSave: (maskDataUrl: string) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(20)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    // Don't use crossOrigin for blob: URLs
    if (!imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    
    img.onerror = () => {
      console.error('[MaskDrawing] Failed to load image:', imageUrl)
      setImageLoaded(false)
    }
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      
      // Load existing mask if provided
      if (existingMask) {
        const maskImg = new Image()
        if (!existingMask.startsWith('blob:') && !existingMask.startsWith('data:')) {
          maskImg.crossOrigin = 'anonymous'
        }
        maskImg.onload = () => {
          ctx.drawImage(maskImg, 0, 0)
          setImageLoaded(true)
        }
        maskImg.onerror = () => {
          console.error('[MaskDrawing] Failed to load mask:', existingMask)
          setImageLoaded(true) // Still allow drawing even if mask fails
        }
        maskImg.src = existingMask
      } else {
        setImageLoaded(true)
      }
    }
    img.src = imageUrl
  }, [imageUrl, existingMask])

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !imageLoaded) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.beginPath()
    ctx.arc(x, y, brushSize, 0, Math.PI * 2)
    ctx.fill()
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    if (!imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = imageUrl
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Create a new canvas for black & white mask
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = canvas.width
    maskCanvas.height = canvas.height
    const maskCtx = maskCanvas.getContext('2d')
    if (!maskCtx) return

    // Fill entire canvas with black background
    maskCtx.fillStyle = 'black'
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
    
    // Copy current canvas to get the drawn white regions
    maskCtx.drawImage(canvas, 0, 0)
    
    // Get image data and convert to pure black & white
    const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    const data = imageData.data
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      
      // Calculate brightness (if pixel is whitish from drawing)
      const brightness = (r + g + b) / 3
      
      if (brightness > 150) {
        // White mask region (drawn area)
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        data[i + 3] = 255
      } else {
        // Black background
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 255
      }
    }
    
    maskCtx.putImageData(imageData, 0, 0)
    const maskDataUrl = maskCanvas.toDataURL('image/png')
    onSave(maskDataUrl)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-card rounded-xl border border-border max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Нарисовать маску</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary/60">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>🎨 Обведите <strong className="text-foreground">белым маркером</strong> персонажа, который должен двигать ртом</p>
              <p>⚠️ Закрашивайте только лицо и область рта — остальное должно оставаться черным</p>
              <p>💡 Маска сохранится как черно-белое изображение (белое = движение, черное = фон)</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Размер кисти:</span>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-xs font-mono text-foreground w-8">{brushSize}px</span>
              </div>
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-xs"
              >
                <Eraser className="h-3.5 w-3.5" />
                Очистить
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden bg-black/5">
              <canvas
                ref={canvasRef}
                onMouseDown={(e) => { setIsDrawing(true); draw(e) }}
                onMouseMove={draw}
                onMouseUp={() => setIsDrawing(false)}
                onMouseLeave={() => setIsDrawing(false)}
                className="max-w-full h-auto cursor-crosshair"
                style={{ display: 'block', width: '100%' }}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <Button onClick={onClose} variant="outline" className="flex-1">
            Отмена
          </Button>
          <Button onClick={handleSave} className="flex-1 gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Применить маску
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Emotion Picker Modal ───────────────────────────────────────────────────

function EmotionPickerModal({
  imageUrl,
  onSelect,
  onCancel,
}: {
  imageUrl: string
  onSelect: (emotion: string) => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">🎭 Назначь эмоцию кадру</h2>
          <button onClick={onCancel} className="h-7 w-7 rounded-lg hover:bg-secondary/50 flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <img src={imageUrl} alt="Frame" className="w-full h-44 object-contain rounded-lg bg-muted/30 border border-border" />
          <p className="text-[11px] text-muted-foreground text-center">Эмоция будет использоваться в промпте InfiniteTalk</p>
          <div className="grid grid-cols-4 gap-2">
            {EMOTIONS.map((em) => (
              <button
                key={em.id}
                onClick={() => onSelect(em.id)}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/10 transition-colors"
              >
                <span className="text-xl leading-none">{em.emoji}</span>
                <span className="text-[10px] text-muted-foreground">{em.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Room Images Modal ─────────────────────────────────────────────────────

interface RoomImage {
  path: string
  loaded: boolean
  missing: boolean
}

function RoomImagesModal({
  onClose,
  images,
  selectedRefIndex,
  onSelectRef,
  onUpload,
  roomType,
}: {
  onClose: () => void
  images: RoomImage[]
  selectedRefIndex: number | null
  onSelectRef: (index: number | null) => void
  onUpload: (index: number, file: File) => void
  roomType: 'bedroom' | 'livingroom'
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {roomType === 'bedroom' ? '🛏️ Спальня' : '🛋️ Гостиная'} — референс-изображения
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Нажмите на фото чтобы зафиксировать его как референс интерьера, или используйте случайный.</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg hover:bg-secondary/50 flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Random button */}
        <div className="px-5 pt-4">
          <button
            onClick={() => onSelectRef(null)}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors',
              selectedRefIndex === null
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-secondary/50'
            )}
          >
            <Shuffle className="h-4 w-4" />
            Взять случайный реф из этого пространства
            {selectedRefIndex === null && <CheckCircle2 className="h-3.5 w-3.5 ml-auto" />}
          </button>
        </div>

        {/* Grid */}
        <div className="p-5 grid grid-cols-2 gap-4">
          {images.map((img, i) => {
            const isSelected = selectedRefIndex === i
            return (
              <div
                key={i}
                onClick={() => !img.missing && onSelectRef(i)}
                className={cn(
                  'relative group rounded-xl overflow-hidden border-2 aspect-video bg-muted/30 transition-all',
                  img.missing ? 'cursor-default' : 'cursor-pointer',
                  isSelected
                    ? 'border-primary shadow-lg shadow-primary/20'
                    : 'border-border hover:border-border/80'
                )}
              >
                {img.missing ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    <span className="text-[11px] text-muted-foreground/60">bedroom{i + 1}.jpg — не найден</span>
                  </div>
                ) : (
                  <img
                    src={img.path}
                    alt={`Bedroom ref ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Index badge */}
                <div className="absolute top-2 left-2 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded">#{i + 1}</div>

                {/* Selected badge */}
                {isSelected && (
                  <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}

                {/* Hover overlay — buttons only, no stopPropagation on container */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 gap-1.5 pointer-events-none">
                  {!img.missing && (
                    <a
                      href={img.path}
                      target="_blank"
                      rel="noreferrer"
                      className="pointer-events-auto h-7 w-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Eye className="h-3.5 w-3.5 text-white" />
                    </a>
                  )}
                  <button
                    className="pointer-events-auto h-7 w-7 rounded-lg bg-primary/80 hover:bg-primary flex items-center justify-center transition-colors"
                    onClick={(e) => { e.stopPropagation(); inputRefs.current[i]?.click() }}
                  >
                    <Upload className="h-3.5 w-3.5 text-white" />
                  </button>
                  <input
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onUpload(i, f)
                    }}
                  />
                </div>

                {/* Status dot */}
                <div className={cn(
                  'absolute bottom-2 right-2 h-2.5 w-2.5 rounded-full border-2 border-black/40 group-hover:opacity-0 transition-opacity',
                  img.missing ? 'bg-red-500' : 'bg-emerald-400'
                )} />
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex items-center gap-2">
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Загружено</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Отсутствует</span>
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground/60">
            Файлы: <code className="font-mono text-primary/70">public/assets/infinitetalk/bedroom1-4.jpg</code>
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export function InfiniteTalkPanel() {
  const { apiKeys, addLog, voiceResult } = useContentStore()

  // Settings
  const [emotion, setEmotion] = useState('neutral')
  const [disorderEnabled, setDisorderEnabled] = useState(false)
  const [disorder, setDisorder] = useState(0)
  const [variantCount, setVariantCount] = useState(2)
  const [aspectRatio, setAspectRatio] = useState<string>('9:16')
  const [resolution, setResolution] = useState<string>('4k')
  const [roomType, setRoomType] = useState<'bedroom' | 'livingroom'>('bedroom')
  const [userWishes, setUserWishes] = useState('')

  // Image generation
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [prompts, setPrompts] = useState<InfiniteTalkPrompts | null>(null)
  const [variants, setVariants] = useState<NanoBananaMultiResult[]>([])
  const [selectedVariantUrl, setSelectedVariantUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [showPromptsDetail, setShowPromptsDetail] = useState(true)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadedFrameGrokResult, setUploadedFrameGrokResult] = useState<LipSyncFromImageResult | null>(null)

  // Uploaded frames
  const [uploadedFrames, setUploadedFrames] = useState<UploadedFrame[]>([])
  const [pendingFrameUrl, setPendingFrameUrl] = useState<string | null>(null)
  const [isDraggingFrame, setIsDraggingFrame] = useState(false)
  const frameInputRef = useRef<HTMLInputElement>(null)
  
  // Mask drawing
  const [maskDrawingFrame, setMaskDrawingFrame] = useState<UploadedFrame | null>(null)

  // LipSync prompt (editable)
  const [lipSyncPromptOverride, setLipSyncPromptOverride] = useState('')

  // Audio
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null)
  const [isDraggingAudio, setIsDraggingAudio] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // InfiniteTalk generation
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isPlayingVideo, setIsPlayingVideo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Params panel
  const [showParams, setShowParams] = useState(false)

  // Room modal
  const [showRoomModal, setShowRoomModal] = useState(false)
  const [selectedRoomRefIndex, setSelectedRoomRefIndex] = useState<number | null>(null)
  const [roomImages, setRoomImages] = useState<RoomImage[]>(
    BEDROOM_IMAGES.map((path) => ({ path, loaded: false, missing: false }))
  )
  const [livingroomImages, setLivingroomImages] = useState<RoomImage[]>(
    LIVINGROOM_IMAGES.map((path) => ({ path, loaded: false, missing: false }))
  )

  // Probe which room images actually exist
  useEffect(() => {
    // Check bedroom images
    BEDROOM_IMAGES.forEach((path, i) => {
      const img = new Image()
      img.onload = () => setRoomImages((prev) => prev.map((ri, j) => j === i ? { ...ri, loaded: true, missing: false } : ri))
      img.onerror = () => setRoomImages((prev) => prev.map((ri, j) => j === i ? { ...ri, loaded: false, missing: true } : ri))
      img.src = path
    })
    
    // Check livingroom images
    LIVINGROOM_IMAGES.forEach((path, i) => {
      const img = new Image()
      img.onload = () => setLivingroomImages((prev) => prev.map((ri, j) => j === i ? { ...ri, loaded: true, missing: false } : ri))
      img.onerror = () => setLivingroomImages((prev) => prev.map((ri, j) => j === i ? { ...ri, loaded: false, missing: true } : ri))
      img.src = path
    })
  }, [])

  function handleRoomImageUpload(index: number, file: File) {
    const objectUrl = URL.createObjectURL(file)
    setRoomImages((prev) => prev.map((ri, j) =>
      j === index ? { path: objectUrl, loaded: true, missing: false } : ri
    ))
    // Also update BEDROOM_IMAGES substitute for generation
    bedroomOverrides.current[index] = objectUrl
    addLog(`📷 Фото спальни #${index + 1} заменено: ${file.name}`, 'success')
  }

  const bedroomOverrides = useRef<(string | null)[]>([null, null, null, null])

  function getRoomImages(): string[] {
    const currentImages = roomType === 'bedroom' ? BEDROOM_IMAGES : LIVINGROOM_IMAGES
    const all = currentImages.map((path, i) => bedroomOverrides.current[i] ?? path)
    if (selectedRoomRefIndex !== null) return [all[selectedRoomRefIndex]]
    return all
  }
  
  function getRoomName(): string {
    return roomType === 'bedroom' ? 'Спальня' : 'Гостиная'
  }

  function handleFrameFile(file: File) {
    if (!file.type.startsWith('image/')) { addLog('❌ Неверный формат: нужно изображение', 'error'); return }
    // Replace existing frame (InfiniteTalk supports only 1 image)
    if (uploadedFrames.length > 0) {
      setUploadedFrames([])
      setSelectedVariantUrl((prev) => {
        const existing = uploadedFrames[0]
        return existing && prev === existing.objectUrl ? null : prev
      })
    }
    const objectUrl = URL.createObjectURL(file)
    setPendingFrameUrl(objectUrl)
  }

  function handleFrameFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    handleFrameFile(file)
    e.target.value = ''
  }

  function handleFrameDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingFrame(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFrameFile(file)
  }

  function handleEmotionAssigned(emotion: string) {
    if (!pendingFrameUrl) return
    const em = EMOTIONS.find((e) => e.id === emotion)!
    const newFrame: UploadedFrame = {
      id: crypto.randomUUID(),
      objectUrl: pendingFrameUrl,
      emotion,
      fileName: emotion,
    }
    setUploadedFrames((prev) => [...prev, newFrame])
    // Auto-select so the generate button is immediately enabled
    setSelectedVariantUrl(pendingFrameUrl)
    setLipSyncPromptOverride(LIPSYNC_EMOTION_TEMPLATES[emotion] ?? LIPSYNC_EMOTION_TEMPLATES.neutral)
    setPendingFrameUrl(null)
    addLog(`🖼️ Кадр загружен и выбран: эмоция «${em.label}»`, 'success')
  }

  function handleSelectUploadedFrame(frame: UploadedFrame) {
    setSelectedVariantUrl(frame.objectUrl)
    const template = LIPSYNC_EMOTION_TEMPLATES[frame.emotion] ?? LIPSYNC_EMOTION_TEMPLATES.neutral
    setLipSyncPromptOverride(template)
  }

  function handleDeleteFrame(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setUploadedFrames((prev) => prev.filter((f) => f.id !== id))
    setSelectedVariantUrl((prev) => {
      const frame = uploadedFrames.find((f) => f.id === id)
      return frame && prev === frame.objectUrl ? null : prev
    })
  }

  function handleSaveMask(maskDataUrl: string) {
    if (!maskDrawingFrame) return
    setUploadedFrames((prev) =>
      prev.map((f) => (f.id === maskDrawingFrame.id ? { ...f, maskDataUrl } : f))
    )
    addLog('✅ Маска сохранена', 'success')
    setMaskDrawingFrame(null)
  }

  const hasKeys = !!apiKeys.grok && !!apiKeys.wavespeed
  const canGenerateImage = hasKeys && !isGeneratingImage
  const hasAudio = !!audioDataUrl
  const hasImage = !!selectedVariantUrl
  const canGenerateVideo = hasKeys && hasAudio && hasImage && !isGeneratingVideo

  // ── Image Generation ──────────────────────────────────────────────────

  async function handleGenerateImage() {
    if (!canGenerateImage) return
    setIsGeneratingImage(true)
    setImageError(null)
    setVariants([])
    setSelectedVariantUrl(null)
    setVideoUrl(null)

    try {
      // 1. Generate prompts with Grok
      const generatedPrompts = await generateInfiniteTalkPrompts(
        apiKeys.grok,
        emotion,
        disorderEnabled ? disorder : 0,
        getRoomName(),
        userWishes,
        addLog
      )
      setPrompts(generatedPrompts)
      setLipSyncPromptOverride(generatedPrompts.lipSyncPrompt)

      // 2. Load reference images
      addLog('📁 Загружаю референсные изображения...', 'info')
      const activeBedroomImages = getRoomImages()
      const randomBedroom = activeBedroomImages[Math.floor(Math.random() * activeBedroomImages.length)]

      // If override is an object URL, fetch directly; otherwise use path
      const [dnaDataUrl, bedroomDataUrl] = await Promise.all([
        fetchImageAsDataUrl(DNA_IMAGE),
        fetchImageAsDataUrl(randomBedroom),
      ])

      // 3. Generate image variants
      const results = await generateNanoBananaMultiRef(
        apiKeys.wavespeed,
        [bedroomDataUrl, dnaDataUrl],
        generatedPrompts.photoPrompt,
        aspectRatio,
        resolution,
        variantCount,
        addLog
      )

      setVariants(results)
      if (results.length > 0) setSelectedVariantUrl(results[0].imageUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setImageError(msg)
      addLog(`❌ Ошибка генерации: ${msg}`, 'error')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  // ── Audio Handling ────────────────────────────────────────────────────

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  async function handleAudioFile(file: File) {
    if (!file.type.startsWith('audio/')) {
      addLog('❌ Неверный формат: нужен аудио файл (MP3, WAV, etc.)', 'error')
      return
    }
    setAudioFile(file)
    const dataUrl = await readFileAsDataUrl(file)
    setAudioDataUrl(dataUrl)
    addLog(`🎵 Аудио загружено: ${file.name} (${formatFileSize(file.size)})`, 'success')
  }

  function handleAudioDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingAudio(false)
    const file = e.dataTransfer.files[0]
    if (file) handleAudioFile(file)
  }

  async function handleUseVoiceResult() {
    if (!voiceResult) return
    // voiceResult.audioUrl is a blob: URL — need to fetch it and re-encode
    try {
      addLog('🎵 Беру аудио из Voice...', 'info')
      const resp = await fetch(voiceResult.audioUrl)
      const blob = await resp.blob()
      const file = new File([blob], 'voice-result.mp3', { type: 'audio/mp3' })
      setAudioFile(file)
      const dataUrl = await readFileAsDataUrl(file)
      setAudioDataUrl(dataUrl)
      addLog(`✅ Аудио из Voice загружено (${formatFileSize(blob.size)})`, 'success')
    } catch (err) {
      addLog(`❌ Не удалось взять аудио из Voice: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  // ── Video Generation ──────────────────────────────────────────────────

  async function handleGenerateVideo() {
    if (!canGenerateVideo || !selectedVariantUrl || !audioDataUrl) return
    setIsGeneratingVideo(true)
    setVideoError(null)
    setVideoUrl(null)

    try {
      // Convert selectedVariantUrl to data URL
      let imageDataUrl = selectedVariantUrl
      if (selectedVariantUrl.startsWith('http')) {
        addLog('📥 Конвертирую изображение...', 'info')
        imageDataUrl = await fetchImageAsDataUrl(selectedVariantUrl)
      } else if (selectedVariantUrl.startsWith('blob:')) {
        imageDataUrl = await fetchImageAsDataUrl(selectedVariantUrl)
      }

      // If using an uploaded frame → call Grok vision to generate lipsync prompt
      const uploadedFrame = uploadedFrames.find((f) => f.objectUrl === selectedVariantUrl)
      let finalLipSyncPrompt = lipSyncPromptOverride || (prompts?.lipSyncPrompt ?? '')
      let maskDataUrl: string | undefined

      if (uploadedFrame && apiKeys.grok) {
        setUploadedFrameGrokResult(null)
        const grokResult = await generateLipSyncPromptFromImage(
          apiKeys.grok,
          imageDataUrl,
          uploadedFrame.emotion,
          addLog
        )
        setUploadedFrameGrokResult(grokResult)
        setLipSyncPromptOverride(grokResult.lipSyncPrompt)
        finalLipSyncPrompt = grokResult.lipSyncPrompt
        
        // Get mask if available
        if (uploadedFrame.maskDataUrl) {
          maskDataUrl = uploadedFrame.maskDataUrl
        }
      }

      const result = await submitInfiniteTalk(
        apiKeys.wavespeed,
        imageDataUrl,
        audioDataUrl,
        finalLipSyncPrompt,
        addLog,
        maskDataUrl
      )
      setVideoUrl(result.videoUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setVideoError(msg)
      addLog(`❌ InfiniteTalk ошибка: ${msg}`, 'error')
    } finally {
      setIsGeneratingVideo(false)
    }
  }

  function toggleVideo() {
    const v = videoRef.current
    if (!v) return
    if (isPlayingVideo) { v.pause(); setIsPlayingVideo(false) }
    else { v.play(); setIsPlayingVideo(true) }
  }

  function handleDownloadVideo() {
    if (!videoUrl) return
    window.open(videoUrl, '_blank')
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">InfiniteTalk</h1>
        <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
          Wavespeed · InfiniteTalk
        </span>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Генерация лип-синк видео: создай изображение → добавь аудио → запусти InfiniteTalk
      </p>

      {!hasKeys && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">Нужны ключи Grok и Wavespeed в настройках (⚙)</p>
        </div>
      )}

      {/* Emotion picker for new uploaded frame */}
      {pendingFrameUrl && (
        <EmotionPickerModal
          imageUrl={pendingFrameUrl}
          onSelect={handleEmotionAssigned}
          onCancel={() => setPendingFrameUrl(null)}
        />
      )}

      {/* Mask drawing modal */}
      {maskDrawingFrame && (
        <MaskDrawingModal
          imageUrl={maskDrawingFrame.objectUrl}
          existingMask={maskDrawingFrame.maskDataUrl}
          onSave={handleSaveMask}
          onClose={() => setMaskDrawingFrame(null)}
        />
      )}

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            className="absolute top-4 right-4 h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <button
            className="absolute top-4 right-16 h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Скачать без метаданных"
            onClick={(e) => { e.stopPropagation(); void downloadImageClean(previewUrl!, `image-clean-${Date.now()}.png`) }}
          >
            <Download className="h-4 w-4 text-white" />
          </button>
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {showRoomModal && (
        <RoomImagesModal
          onClose={() => setShowRoomModal(false)}
          images={roomType === 'bedroom' ? roomImages : livingroomImages}
          selectedRefIndex={selectedRoomRefIndex}
          onSelectRef={setSelectedRoomRefIndex}
          onUpload={handleRoomImageUpload}
          roomType={roomType}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

        {/* ── Left panel: settings ── */}
        <div className="space-y-4">

          {/* Room selector */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <span className="text-sm font-medium text-foreground">Комната</span>
            
            {/* Room Type Selector */}
            <div className="flex gap-2">
              {ROOM_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setRoomType(type.id)
                    setSelectedRoomRefIndex(null)
                  }}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                    roomType === type.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                  )}
                >
                  {type.name}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowRoomModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-left hover:bg-primary/15 transition-colors group"
            >
              <div className="h-8 w-8 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                {roomType === 'bedroom' ? '🛏️' : '🛋️'}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {roomType === 'bedroom' ? 'Спальня' : 'Гостиная'}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {selectedRoomRefIndex !== null
                    ? `Фиксирован реф #${selectedRoomRefIndex + 1}`
                    : `Случайный • ${(roomType === 'bedroom' ? roomImages : livingroomImages).filter((r) => !r.missing).length}/4 загружено`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Miniature previews */}
                <div className="flex -space-x-1.5">
                  {(roomType === 'bedroom' ? roomImages : livingroomImages).slice(0, 3).map((ri, i) => (
                    <div key={i} className={cn(
                      'h-5 w-5 rounded-sm border border-border overflow-hidden',
                      ri.missing ? 'bg-red-500/30' : 'bg-muted'
                    )}>
                      {!ri.missing && <img src={ri.path} alt="" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              </div>
            </button>
          </div>

          {/* Emotion */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Эмоция</label>
            <div className="grid grid-cols-4 gap-1.5">
              {EMOTIONS.map((em) => (
                <button
                  key={em.id}
                  onClick={() => setEmotion(em.id)}
                  disabled={isGeneratingImage}
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

          {/* User Wishes */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <label className="text-sm font-medium text-foreground">
              Пожелания к промпту
              <span className="text-xs text-muted-foreground/60 ml-2">опционально</span>
            </label>
            <textarea
              value={userWishes}
              onChange={(e) => setUserWishes(e.target.value)}
              placeholder="Например: в кожаной куртке, с книгой, кофе на столе..."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={3}
            />
          </div>

          {/* Disorder */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disorderEnabled}
                  onChange={(e) => setDisorderEnabled(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                Беспорядок
              </label>
              <span className={cn(
                'text-sm font-semibold tabular-nums',
                disorderEnabled ? 'text-primary' : 'text-muted-foreground/40'
              )}>{disorder}%</span>
            </div>
            <Slider
              min={0} max={100} step={5}
              value={[disorder]}
              onValueChange={([v]) => setDisorder(v)}
              disabled={!disorderEnabled || isGeneratingImage}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0% — идеальная чистота</span>
              <span>100% — хаос</span>
            </div>
          </div>

          {/* Generation params */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            {/* Variant count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Вариантов фото</label>
                <span className="text-sm font-semibold text-primary tabular-nums">{variantCount}</span>
              </div>
              <Slider min={1} max={4} step={1} value={[variantCount]} onValueChange={([v]) => setVariantCount(v)} disabled={isGeneratingImage} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1</span><span>2</span><span>3</span><span>4</span>
              </div>
            </div>

            {/* Aspect ratio */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Соотношение сторон</label>
              <div className="flex gap-1.5 flex-wrap">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    disabled={isGeneratingImage}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md border transition-colors',
                      aspectRatio === ar ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/50'
                    )}
                  >{ar}</button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Разрешение</label>
              <div className="flex gap-1.5">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    disabled={isGeneratingImage}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md border transition-colors',
                      resolution === r ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/50'
                    )}
                  >{r.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate Image button */}
          <Button
            onClick={handleGenerateImage}
            disabled={!canGenerateImage}
            className="w-full gap-2"
            size="lg"
          >
            {isGeneratingImage
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Генерирую изображение...</>
              : <><ImageIcon className="h-4 w-4" /> Сгенерировать изображение</>}
          </Button>
        </div>

        {/* ── Right panel: result ── */}
        <div className="space-y-4">

          {/* DNA card */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">🧬 ДНК-внешность</span>
            </div>
            <div className="p-4 space-y-3">
              <img
                src={DNA_IMAGE}
                alt="DNA reference"
                className="w-full h-auto rounded-lg border border-border"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{DNA_DISPLAY_TEXT}</p>
            </div>
          </div>

          {/* Image error */}
          {imageError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{imageError}</p>
            </div>
          )}

          {/* Prompts */}
          {prompts && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setShowPromptsDetail(!showPromptsDetail)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <span className="text-sm font-semibold text-foreground">Промпты Grok</span>
                {showPromptsDetail ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showPromptsDetail && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {/* Photo prompt */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Photo Prompt (EN)</span>
                    <p className="text-xs text-foreground bg-muted/30 rounded-lg p-3 leading-relaxed">{prompts.photoPrompt}</p>
                    <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2 leading-relaxed">{prompts.photoPromptRu}</p>
                  </div>
                  {/* LipSync prompt */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">LipSync Prompt (EN) — редактируемый</span>
                    <textarea
                      value={lipSyncPromptOverride}
                      onChange={(e) => setLipSyncPromptOverride(e.target.value)}
                      className="w-full text-xs bg-muted/30 rounded-lg p-3 border border-border resize-y focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                    />
                    <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2 leading-relaxed">{prompts.lipSyncPromptRu}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading shimmer */}
          {isGeneratingImage && variants.length === 0 && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: variantCount }, (_, i) => (
                <div key={i} className="aspect-[9/16] rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          )}

          {/* Uploaded frames */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">🖼️ Стартовые кадры</span>
              <button
                onClick={() => frameInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Upload className="h-3 w-3" /> Загрузить
              </button>
            </div>
            <input ref={frameInputRef} type="file" accept="image/*" className="hidden" onChange={handleFrameFileInput} />
            {uploadedFrames.length === 0 ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingFrame(true) }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFrame(false) }}
                onDrop={handleFrameDrop}
                onClick={() => frameInputRef.current?.click()}
                className={cn(
                  'w-full rounded-xl border-2 border-dashed transition-colors p-6 flex flex-col items-center gap-2 cursor-pointer',
                  isDraggingFrame
                    ? 'border-primary bg-primary/10 scale-[1.01]'
                    : 'border-border hover:border-primary/40 hover:bg-primary/5'
                )}
              >
                <ImageIcon className={cn('h-7 w-7 transition-colors', isDraggingFrame ? 'text-primary' : 'text-muted-foreground/50')} />
                <p className="text-xs text-muted-foreground">
                  {isDraggingFrame ? 'Отпустите чтобы загрузить' : 'Перетащи кадр сюда или нажми для загрузки'}
                </p>
                <p className="text-[10px] text-muted-foreground/60">После загрузки выбери эмоцию</p>
              </div>
            ) : (
              <>
              {uploadedFrames.map((frame) => {
                const em = EMOTIONS.find((e) => e.id === frame.emotion)!
                const isSelected = selectedVariantUrl === frame.objectUrl
                return (
                  <div
                    key={frame.id}
                    className={cn(
                      'relative group rounded-xl overflow-hidden border-2 transition-all cursor-pointer',
                      isSelected ? 'border-primary shadow-lg shadow-primary/20' : 'border-border hover:border-primary/40'
                    )}
                    onClick={() => handleSelectUploadedFrame(frame)}
                  >
                    <img src={frame.objectUrl} alt="frame" className="w-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    {/* Zoom */}
                    <button
                      className="pointer-events-auto absolute top-2 left-2 h-7 w-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setPreviewUrl(frame.objectUrl) }}
                    >
                      <ZoomIn className="h-3.5 w-3.5 text-white" />
                    </button>
                    {/* Draw Mask */}
                    <button
                      className="pointer-events-auto absolute top-2 left-10 h-7 w-7 rounded-lg bg-black/60 hover:bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setMaskDrawingFrame(frame) }}
                      title="Нарисовать маску"
                    >
                      <Paintbrush className="h-3.5 w-3.5 text-white" />
                    </button>
                    {/* Replace */}
                    <button
                      className="pointer-events-auto absolute top-2 right-10 h-7 w-7 rounded-lg bg-black/60 hover:bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-colors"
                      onClick={(e) => { e.stopPropagation(); frameInputRef.current?.click() }}
                      title="Заменить"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-white" />
                    </button>
                    {/* Delete */}
                    <button
                      className="pointer-events-auto absolute top-2 right-2 h-7 w-7 rounded-lg bg-black/60 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-colors"
                      onClick={(e) => handleDeleteFrame(frame.id, e)}
                    >
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                    {/* Emotion badge */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white">
                      <span>{em.emoji}</span> {em.label}
                    </div>
                    {/* Mask indicator */}
                    {frame.maskDataUrl && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/80 border border-white/50 px-2 py-0.5 rounded text-[10px] text-white font-medium">
                        <Paintbrush className="h-2.5 w-2.5" />
                        Маска
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute bottom-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                )
              })}
              </>
            )}
          </div>

          {/* Grok lipsync prompt for uploaded frame */}
          {(uploadedFrameGrokResult || (isGeneratingVideo && uploadedFrames.some(f => f.objectUrl === selectedVariantUrl))) && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">🧠 Grok — LipSync промпт</span>
                {isGeneratingVideo && !uploadedFrameGrokResult && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>
              {uploadedFrameGrokResult && (
                <div className="px-4 pb-4 pt-3 space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">LIPSYNC PROMPT (EN)</p>
                    <p className="text-xs text-foreground leading-relaxed bg-secondary/30 rounded-lg px-3 py-2">
                      {uploadedFrameGrokResult.lipSyncPrompt}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">ПЕРЕВОД (RU)</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {uploadedFrameGrokResult.lipSyncPromptRu}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Variants grid */}
          {variants.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-foreground">Выберите вариант для лип-синка</span>
              <div className={cn(
                'grid gap-3',
                variants.length === 1 ? 'grid-cols-1 max-w-[200px]' : 'grid-cols-2'
              )}>
                {variants.map((v) => (
                  <div
                    key={v.index}
                    className={cn(
                      'relative group rounded-xl overflow-hidden border-2 transition-all cursor-pointer',
                      selectedVariantUrl === v.imageUrl
                        ? 'border-primary shadow-lg shadow-primary/20'
                        : 'border-transparent hover:border-border'
                    )}
                    onClick={() => setSelectedVariantUrl(v.imageUrl)}
                  >
                    <img src={v.imageUrl} alt={`Вариант ${v.index + 1}`} className="w-full object-cover" />

                    {/* Zoom button on hover */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <button
                      className="pointer-events-auto absolute top-2 left-2 h-7 w-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setPreviewUrl(v.imageUrl) }}
                    >
                      <ZoomIn className="h-3.5 w-3.5 text-white" />
                    </button>

                    {selectedVariantUrl === v.imageUrl && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow">
                        <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 text-[10px] font-medium bg-black/50 text-white px-1.5 py-0.5 rounded">
                      #{v.index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isGeneratingImage && variants.length === 0 && !imageError && (
            <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Настройте параметры и нажмите «Сгенерировать изображение»</p>
              <p className="text-xs text-muted-foreground/60">Grok напишет промпты → Nano Banana 2 создаст фото</p>
            </div>
          )}

          {/* ── Audio section ── */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Аудио</span>
              {voiceResult && (
                <button
                  onClick={handleUseVoiceResult}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Взять из Voice
                </button>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingAudio(true) }}
              onDragLeave={() => setIsDraggingAudio(false)}
              onDrop={handleAudioDrop}
              onClick={() => audioInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors',
                isDraggingAudio ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-secondary/30'
              )}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioFile(f) }}
              />
              <Music className={cn('h-5 w-5', audioFile ? 'text-primary' : 'text-muted-foreground')} />
              {audioFile ? (
                <div className="text-center">
                  <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{audioFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatFileSize(audioFile.size)}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Перетащите MP3/WAV сюда или нажмите для загрузки
                </p>
              )}
            </div>
          </div>

          {/* ── InfiniteTalk params (collapsible) ── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setShowParams(!showParams)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">Параметры InfiniteTalk</span>
              {showParams ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showParams && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Prompt (из LipSync)</label>
                  <textarea
                    value={lipSyncPromptOverride}
                    onChange={(e) => setLipSyncPromptOverride(e.target.value)}
                    placeholder="Будет заполнен автоматически из Grok после генерации изображения..."
                    className="w-full text-xs bg-muted/30 rounded-lg p-3 border border-border resize-y focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Resolution</label>
                    <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground">720p (locked)</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Seed</label>
                    <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground">-1 (random)</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Video error */}
          {videoError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{videoError}</p>
            </div>
          )}

          {/* Generate InfiniteTalk button */}
          <Button
            onClick={handleGenerateVideo}
            disabled={!canGenerateVideo}
            className="w-full gap-2"
            size="lg"
            variant={canGenerateVideo ? 'default' : 'outline'}
          >
            {isGeneratingVideo
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Генерирую видео InfiniteTalk...</>
              : <><Clapperboard className="h-4 w-4" /> Сгенерировать в InfiniteTalk</>}
          </Button>

          {!hasImage && !isGeneratingImage && (
            <p className="text-[11px] text-muted-foreground text-center">Сначала сгенерируйте и выберите изображение</p>
          )}
          {hasImage && !hasAudio && (
            <p className="text-[11px] text-muted-foreground text-center">Добавьте аудио для генерации видео</p>
          )}

          {/* Video result */}
          {isGeneratingVideo && !videoUrl && (
            <div className="rounded-xl border border-border bg-card/30 p-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">Создаю лип-синк видео…</p>
              <p className="text-xs text-muted-foreground/60">InfiniteTalk обрабатывает ~10–30 сек на каждую секунду видео</p>
            </div>
          )}

          {videoUrl && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Результат InfiniteTalk</span>
                <span className="text-xs text-emerald-400 font-medium">MP4 · 720p</span>
              </div>

              {/* Video player */}
              <div className="relative rounded-xl overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full max-h-[400px] object-contain"
                  onEnded={() => setIsPlayingVideo(false)}
                  onPause={() => setIsPlayingVideo(false)}
                  onPlay={() => setIsPlayingVideo(true)}
                  playsInline
                  controls={false}
                />
                <button
                  onClick={toggleVideo}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
                >
                  <div className="h-14 w-14 rounded-full bg-black/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                    {isPlayingVideo
                      ? <Pause className="h-6 w-6 text-white" />
                      : <Play className="h-6 w-6 text-white translate-x-0.5" />}
                  </div>
                </button>
              </div>

              <Button onClick={handleDownloadVideo} variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" />
                Открыть видео в новой вкладке
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
