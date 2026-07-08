import { useState, useRef, useEffect } from 'react'
import { Upload, Image as ImageIcon, X, Zap, AlertCircle, CheckCircle2, Sparkles, FolderOpen, Plus, Trash2, Shuffle } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import { generateNSFWPromptWithGrok, editImageWithSeedream, generateNanoBananaMultiRef, editImageWithGPTImage2 } from '@/lib/api'
import { fileToBase64, compressImage, generateId, cn } from '@/lib/utils'

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

const NSFW_CATEGORIES = [
  { id: 'blowjob', name: 'Blowjob', icon: '💋' },
  { id: 'pussy', name: 'Pussy', icon: '🌸' },
]

interface RoomImage {
  path: string
  loaded: boolean
  missing: boolean
}

interface NSFWResult {
  id: string
  imageUrl: string
  prompt: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
  error?: string
}

function RoomImagesModal({
  onClose,
  images,
  selectedRefIndex,
  onSelectRef,
  roomType,
}: {
  onClose: () => void
  images: RoomImage[]
  selectedRefIndex: number | null
  onSelectRef: (index: number | null) => void
  roomType: 'bedroom' | 'livingroom'
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
                    <span className="text-[11px] text-muted-foreground/60">
                      {roomType === 'bedroom' ? 'bedroom' : 'livingroom'}{i + 1}.jpg — не найден
                    </span>
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
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded">
                    <CheckCircle2 className="h-3 w-3" />
                    Выбран
                  </div>
                )}

                {/* Green indicator */}
                {!img.missing && (
                  <div className="absolute bottom-2 left-2 h-2 w-2 rounded-full bg-green-500" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function NSFWPanel() {
  const { apiKeys, addLog, nsfwReferences, addNSFWReference, removeNSFWReference } = useContentStore()

  // Images
  const [sarahImage, setSarahImage] = useState<string | null>(null)
  const [poseRefImage, setPoseRefImage] = useState<string | null>(null)
  const [nsfwRefs, setNsfwRefs] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [selectedSavedRefs, setSelectedSavedRefs] = useState<Set<string>>(new Set())
  
  // Room modal
  const [showRoomModal, setShowRoomModal] = useState(false)
  const [roomType, setRoomType] = useState<'bedroom' | 'livingroom'>('bedroom')
  const [selectedRoomRefIndex, setSelectedRoomRefIndex] = useState<number | null>(null)
  const [roomImages, setRoomImages] = useState<RoomImage[]>(
    BEDROOM_IMAGES.map((path) => ({ path, loaded: false, missing: false }))
  )
  const [livingroomImages, setLivingroomImages] = useState<RoomImage[]>(
    LIVINGROOM_IMAGES.map((path) => ({ path, loaded: false, missing: false }))
  )

  // Settings
  const [userWishes, setUserWishes] = useState('')
  const [frameCount, setFrameCount] = useState(1)
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('9:16')
  const [resolution, setResolution] = useState<'1k' | '2k' | '4k'>('1k')
  const [selectedModel, setSelectedModel] = useState<'seedream' | 'nanoBanana' | 'gptImage2'>('seedream')
  const [useSceneFromPose, setUseSceneFromPose] = useState(false)
  const [useSceneFromOutfit, setUseSceneFromOutfit] = useState(false)
  const [dnaFaceImage, setDnaFaceImage] = useState<string | null>(null)
  const [disorderEnabled, setDisorderEnabled] = useState(false)
  const [disorder, setDisorder] = useState(0)

  // Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [results, setResults] = useState<NSFWResult[]>([])

  // File inputs
  const sarahInputRef = useRef<HTMLInputElement>(null)
  const poseInputRef = useRef<HTMLInputElement>(null)
  const nsfwInputRef = useRef<HTMLInputElement>(null)
  const categoryUploadRef = useRef<HTMLInputElement>(null)
  
  // Drag & drop states
  const [isDraggingSarah, setIsDraggingSarah] = useState(false)
  const [isDraggingPose, setIsDraggingPose] = useState(false)

  const keysConfigured = apiKeys.grok.length > 0 && apiKeys.wavespeed.length > 0

  // Check room images on mount and load DNA face
  useEffect(() => {
    // Check bedroom images
    roomImages.forEach((img, i) => {
      const imgEl = new Image()
      imgEl.onload = () => {
        setRoomImages(prev => {
          const next = [...prev]
          next[i] = { ...next[i], loaded: true, missing: false }
          return next
        })
      }
      imgEl.onerror = () => {
        setRoomImages(prev => {
          const next = [...prev]
          next[i] = { ...next[i], loaded: true, missing: true }
          return next
        })
      }
      imgEl.src = img.path
    })
    
    // Check livingroom images
    livingroomImages.forEach((img, i) => {
      const imgEl = new Image()
      imgEl.onload = () => {
        setLivingroomImages(prev => {
          const next = [...prev]
          next[i] = { ...next[i], loaded: true, missing: false }
          return next
        })
      }
      imgEl.onerror = () => {
        setLivingroomImages(prev => {
          const next = [...prev]
          next[i] = { ...next[i], loaded: true, missing: true }
          return next
        })
      }
      imgEl.src = img.path
    })
    
    // Load DNA face reference
    fetch('/dna-reference.jpg')
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onloadend = () => setDnaFaceImage(reader.result as string)
        reader.readAsDataURL(blob)
      })
      .catch(() => addLog('⚠️ DNA-reference.jpg не найден', 'error'))
  }, [])

  function getRoomImage(): string {
    const currentImages = roomType === 'bedroom' ? BEDROOM_IMAGES : LIVINGROOM_IMAGES
    const currentRoomImages = roomType === 'bedroom' ? roomImages : livingroomImages
    
    if (selectedRoomRefIndex !== null) {
      return currentImages[selectedRoomRefIndex]
    }
    const availableImages = currentImages.filter((_, i) => !currentRoomImages[i]?.missing)
    return availableImages[Math.floor(Math.random() * availableImages.length)] || currentImages[0]
  }

  async function handleFileUpload(
    file: File,
    setter: React.Dispatch<React.SetStateAction<string | null>>
  ) {
    try {
      const base64 = await fileToBase64(file)
      setter(base64)
    } catch (err) {
      addLog(`Ошибка загрузки: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }

  async function handleNSFWRefsUpload(files: FileList) {
    try {
      const promises = Array.from(files).map(f => fileToBase64(f))
      const base64Images = await Promise.all(promises)
      setNsfwRefs(prev => [...prev, ...base64Images])
    } catch (err) {
      addLog(`Ошибка загрузки NSFW референсов: ${err instanceof Error ? err.message : 'Unknown'}`, 'error')
    }
  }

  function removeNSFWRef(index: number) {
    setNsfwRefs(prev => prev.filter((_, i) => i !== index))
  }

  async function handleCategoryUpload(files: FileList) {
    if (!selectedCategory) {
      addLog('Выберите категорию для загрузки', 'error')
      return
    }
    
    const fileArray = Array.from(files)
    const MAX_FILES_PER_UPLOAD = 100
    const MAX_TOTAL_PER_CATEGORY = 500
    
    if (fileArray.length > MAX_FILES_PER_UPLOAD) {
      addLog(`⚠️ Максимум ${MAX_FILES_PER_UPLOAD} изображений за раз. Выбрано: ${fileArray.length}`, 'error')
      return
    }
    
    const currentCount = nsfwReferences[selectedCategory]?.length || 0
    if (currentCount + fileArray.length > MAX_TOTAL_PER_CATEGORY) {
      addLog(`⚠️ Лимит категории: ${MAX_TOTAL_PER_CATEGORY} изображений. Сейчас: ${currentCount}. Попытка добавить: ${fileArray.length}`, 'error')
      return
    }
    
    try {
      addLog(`📤 Загрузка ${fileArray.length} изображений в ${selectedCategory}...`, 'info')
      addLog('🗃️ Сжатие изображений для localStorage...', 'info')
      
      // Compress images to reduce localStorage usage
      const promises = fileArray.map(f => compressImage(f, 1024, 1024, 0.85))
      const base64Images = await Promise.all(promises)
      
      let successCount = 0
      let errorCount = 0
      
      base64Images.forEach((dataUrl, idx) => {
        try {
          addNSFWReference(selectedCategory!, dataUrl, files[idx].name)
          successCount++
          
          // Log progress every 10 images
          if (fileArray.length > 10 && (successCount % 10 === 0 || successCount === fileArray.length)) {
            addLog(`📊 Прогресс: ${successCount}/${fileArray.length}`, 'info')
          }
        } catch (err) {
          errorCount++
          // Handle localStorage quota exceeded
          if (err instanceof Error && err.message.includes('QuotaExceededError')) {
            addLog('⚠️ Превышен лимит хранилища! Удалите старые референсы.', 'error')
            throw err
          }
        }
      })
      
      if (errorCount > 0) {
        addLog(`⚠️ Добавлено ${successCount} из ${fileArray.length} референсов (${errorCount} ошибок)`, 'error')
      } else {
        addLog(`✅ Добавлено ${successCount} референсов в ${selectedCategory}`, 'success')
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('QuotaExceededError')) {
        addLog(`Ошибка загрузки в категорию: ${err.message}`, 'error')
      }
    }
  }

  function toggleSavedRef(id: string, dataUrl: string) {
    setSelectedSavedRefs(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setNsfwRefs(current => current.filter(url => url !== dataUrl))
      } else {
        next.add(id)
        setNsfwRefs(current => {
          // Check if URL already exists to avoid duplicates
          if (current.includes(dataUrl)) {
            return current
          }
          return [...current, dataUrl]
        })
      }
      return next
    })
  }

  async function handleGenerate() {
    if (!keysConfigured) {
      addLog('Добавьте API ключи в настройках', 'error')
      return
    }

    if (!poseRefImage) {
      addLog('Загрузите референс позы', 'error')
      return
    }
    
    if (!dnaFaceImage) {
      addLog('⚠️ DNA-лицо не загружено. Подождите...', 'error')
      return
    }

    setIsGenerating(true)
    setGeneratedPrompt('')
    setResults([])
    
    try {
      // Step 1: Generate single NSFW prompt with Grok
      addLog('🔍 Grok анализирует все референсы...', 'info')
      
      // CRITICAL: When useSceneFromPose is true, do NOT load room from library
      // Pass empty string instead - Grok will use pose reference for environment
      let roomDataUrl = ''
      if (!useSceneFromPose) {
        const roomImagePath = getRoomImage()
        // Convert room image to base64 (Grok doesn't support http://)
        const roomBlob = await fetch(roomImagePath).then(r => r.blob())
        roomDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(roomBlob)
        })
        addLog('🛏️ Загружена комната из библиотеки для Grok анализа', 'info')
      } else {
        addLog('🎬 Комната из библиотеки НЕ загружается - используется референс позы', 'info')
      }
      
      // Generate single prompt for all frames
      const prompt = await generateNSFWPromptWithGrok(
        apiKeys.grok,
        sarahImage,
        poseRefImage,
        roomDataUrl,
        nsfwRefs,
        userWishes,
        disorderEnabled ? disorder : 0,
        useSceneFromPose,
        addLog
      )
      
      setGeneratedPrompt(prompt)
      addLog(`✅ Промпт готов (${prompt.length} символов)`, 'success')
      addLog(`📝 Промпт: ${prompt.substring(0, 200)}...`, 'info')

      // Step 2: Create result placeholders
      const newResults: NSFWResult[] = Array.from({ length: frameCount }, () => ({
        id: generateId(),
        imageUrl: '',
        prompt,
        status: 'pending',
      }))
      setResults(newResults)

      // Calculate dimensions based on aspect ratio and resolution
      const resolutionMap: Record<string, number> = {
        '1k': 1024,
        '2k': 2048,
        '4k': 4096,
      }
      const baseSize = resolutionMap[resolution]
      
      // Aspect ratio calculation: smaller number is width for portrait, height for landscape
      const dimensionsMap: Record<string, { width: number; height: number }> = {
        '1:1': { width: baseSize, height: baseSize },
        '3:4': { width: Math.round(baseSize * (3/4)), height: baseSize }, // Portrait: width < height
        '4:3': { width: baseSize, height: Math.round(baseSize * (3/4)) }, // Landscape: width > height
        '9:16': { width: Math.round(baseSize * (9/16)), height: baseSize }, // Portrait: 576x1024 @ 1k
        '16:9': { width: baseSize, height: Math.round(baseSize * (9/16)) }, // Landscape: 1024x576 @ 1k
      }
      const { width, height } = dimensionsMap[aspectRatio]
      addLog(`📐 Выбрано: ${aspectRatio} @ ${resolution} → ${width}x${height}px`, 'info')

      // Step 3: Prepare common data once
      const modelName = selectedModel === 'seedream' ? 'Seedream 4.5' : selectedModel === 'nanoBanana' ? 'Nano Banana 2' : 'GPT Image 2'
      addLog(`🤖 Используется модель: ${modelName}`, 'info')
      
      // Get scene/room image as base64 (prepare once)
      // CRITICAL PRIORITY ORDER:
      // 1. useSceneFromPose (highest priority) → NO scene image, generate from pose ref description
      // 2. useSceneFromOutfit → use outfit photo as scene
      // 3. Default → use room from library
      let sceneDataUrl: string | null = null
      if (useSceneFromPose) {
        // HIGHEST PRIORITY: DON'T add ANY scene image - AI will generate environment from pose ref description
        // This overrides useSceneFromOutfit and room library selection
        sceneDataUrl = null
        addLog('🎬 Генерируется новое окружение из анализа референса позы (без копирования комнаты или окружения из референса)', 'info')
      } else if (useSceneFromOutfit && sarahImage) {
        sceneDataUrl = sarahImage
        addLog('👗 Используется сцена из референса наряда', 'info')
      } else {
        const roomImagePath = getRoomImage()
        const roomBlob = await fetch(roomImagePath).then(r => r.blob())
        sceneDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(roomBlob)
        })
        addLog('🛏️ Используется комната из библиотеки', 'info')
      }
      
      // Get DNA reference image as base64 (prepare once)
      const dnaRefDataUrl = dnaFaceImage || await fetch('/dna-reference.jpg')
        .then(r => r.blob())
        .then(blob => new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        }))
      
      // CRITICAL: Build reference images array based on mode
      // ⚠️ DNA REFERENCE MUST BE FIRST - models use first image as primary face source
      // This ensures face is ALWAYS taken from DNA reference, NOT from pose/outfit references
      // Pose ref provides: pose, camera angle, composition, objects in hands
      // Outfit ref provides: clothing only (NOT FACE)
      // When useSceneFromPose=true: sceneDataUrl is null, Grok Vision text description + strong prompt instructions prevent environment copying
      const allRefImages = useSceneFromPose
        ? [dnaRefDataUrl, poseRefImage, ...nsfwRefs, sarahImage].filter((img): img is string => img !== null)
        : [dnaRefDataUrl, poseRefImage, ...nsfwRefs, sarahImage, sceneDataUrl].filter((img): img is string => img !== null)
      
      const nsfwText = nsfwRefs.length > 0 ? `+ ${nsfwRefs.length} NSFW ` : ''
      const outfitText = sarahImage ? '+ Outfit ' : ''
      addLog(`🖼️ Изображений: ${allRefImages.length} (Pose ${nsfwText}+ DNA ${outfitText}+ Scene)`, 'info')
      addLog(`📏 Размер: ${width}x${height}px (${aspectRatio} @ ${resolution})`, 'info')
      addLog(`⚡ Запускаю ${frameCount} ${frameCount === 1 ? 'генерацию' : 'генерации параллельно'}...`, 'info')
      
      // Step 4: Generate all images in parallel
      const generatePromises = Array.from({ length: frameCount }, async (_, i) => {
        setResults(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: 'generating' } : r
        ))
        
        try {
          let result: { imageUrl: string }
          
          if (selectedModel === 'seedream') {
            result = await editImageWithSeedream(
              apiKeys.wavespeed,
              allRefImages,
              prompt,
              width,
              height,
              (msg, level) => addLog(`[${i + 1}/${frameCount}] ${msg}`, level)
            )
          } else if (selectedModel === 'gptImage2') {
            // GPT Image 2 - exclude dnaRefDataUrl as it's added internally by the function
            const gptRefImages = allRefImages.filter(img => img !== dnaRefDataUrl)
            result = await editImageWithGPTImage2(
              apiKeys.wavespeed,
              gptRefImages,
              prompt,
              resolution,
              aspectRatio,
              (msg, level) => addLog(`[${i + 1}/${frameCount}] ${msg}`, level)
            )
          } else {
            // Nano Banana 2 - use multi-ref function
            const results = await generateNanoBananaMultiRef(
              apiKeys.wavespeed,
              allRefImages,
              prompt,
              aspectRatio,
              resolution,
              1,
              (msg, level) => addLog(`[${i + 1}/${frameCount}] ${msg}`, level)
            )
            result = { imageUrl: results[0].imageUrl }
          }

          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, imageUrl: result.imageUrl, status: 'completed' } : r
          ))
          
          return { index: i, success: true }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'failed', error: errorMsg } : r
          ))
          addLog(`[${i + 1}/${frameCount}] ❌ Ошибка: ${errorMsg}`, 'error')
          return { index: i, success: false, error: errorMsg }
        }
      })
      
      // Wait for all generations to complete
      await Promise.all(generatePromises)

      addLog('🎉 Все изображения готовы!', 'success')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Неизвестная ошибка'
      addLog(`Ошибка: ${errorMsg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-5 w-5 text-pink-500" />
        <h1 className="text-lg font-semibold text-foreground">NSFW Content Generator</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Seedream 4.5 / Nano Banana 2 / GPT Image 2 + Grok Vision + DNA-лицо для создания NSFW контента
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* Main Content */}
        <div className="space-y-6">
          {/* Upload Outfit Photo */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">
                1. Фото наряда
              </label>
              <span className="text-xs text-muted-foreground/60">
                опционально
              </span>
            </div>
            <div
              onClick={() => sarahInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingSarah(true) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingSarah(false) }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDraggingSarah(false)
                const file = e.dataTransfer.files[0]
                if (file && file.type.startsWith('image/')) handleFileUpload(file, setSarahImage)
              }}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                isDraggingSarah
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : sarahImage
                    ? 'border-border hover:border-primary/50'
                    : 'border-border hover:border-primary/50 hover:bg-secondary/20'
              )}
            >
              {sarahImage ? (
                <div className="relative">
                  <img src={sarahImage} alt="Sarah" className="max-h-48 mx-auto rounded-lg" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSarahImage(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className={cn('h-12 w-12 mx-auto mb-2 transition-colors', isDraggingSarah ? 'text-primary' : 'text-muted-foreground')} />
                  <p className="text-sm text-muted-foreground">
                    {isDraggingSarah ? 'Отпустите чтобы загрузить' : 'Перетащите или нажмите для загрузки'}
                  </p>
                </>
              )}
            </div>
            <input
              ref={sarahInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], setSarahImage)}
            />
          </div>

          {/* DNA Face Reference (Always Used) */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <label className="text-sm font-medium text-foreground mb-3 block flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              2. DNA-лицо Sarah Icelyn (всегда учитывается)
            </label>
            <div className="border-2 border-primary/30 rounded-lg p-4 bg-card">
              {dnaFaceImage ? (
                <div className="relative">
                  <img src={dnaFaceImage} alt="DNA Face" className="max-h-48 mx-auto rounded-lg" />
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] px-2 py-1 rounded font-semibold">
                    ✅ Автоматически применяется
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <AlertCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Загрузка DNA-reference.jpg...</p>
                </div>
              )}
            </div>
            <div className="mt-3 p-3 bg-secondary/30 rounded-lg border border-border">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">📝 Описание внешности:</span><br/>
                A young woman with subtle, natural heterochromia — her left eye is a soft, realistic blue and her right eye is a natural warm brown, both matching the brightness and lighting of the environment without appearing overly vivid. She has long black hair with a full straight fringe and soft natural waves reaching to the chest.
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              🧠 Это фото и описание автоматически добавляются ко всем референсам для сохранения лица Sarah
            </p>
          </div>

          {/* Upload Pose Reference */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground mb-3 block">
              3. Референс позы / действия / ракурса
            </label>
            <div
              onClick={() => poseInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingPose(true) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingPose(false) }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDraggingPose(false)
                const file = e.dataTransfer.files[0]
                if (file && file.type.startsWith('image/')) handleFileUpload(file, setPoseRefImage)
              }}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
                isDraggingPose
                  ? 'border-primary bg-primary/10 scale-[1.01]'
                  : poseRefImage
                    ? 'border-border hover:border-primary/50'
                    : 'border-border hover:border-primary/50 hover:bg-secondary/20'
              )}
            >
              {poseRefImage ? (
                <div className="relative">
                  <img src={poseRefImage} alt="Pose" className="max-h-48 mx-auto rounded-lg" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPoseRefImage(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <ImageIcon className={cn('h-12 w-12 mx-auto mb-2 transition-colors', isDraggingPose ? 'text-primary' : 'text-muted-foreground')} />
                  <p className="text-sm text-muted-foreground">
                    {isDraggingPose ? 'Отпустите чтобы загрузить' : 'Перетащите или загрузите референс позы/ракурса'}
                  </p>
                </>
              )}
            </div>
            <input
              ref={poseInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], setPoseRefImage)}
            />
          </div>

          {/* Room Selection */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">
                4. Комната
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSceneFromOutfit}
                    onChange={(e) => {
                      setUseSceneFromOutfit(e.target.checked)
                      if (e.target.checked) setUseSceneFromPose(false)
                    }}
                    disabled={!sarahImage}
                    className="w-4 h-4 rounded border-border"
                  />
                  👗 Сцена из референса наряда
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSceneFromPose}
                    onChange={(e) => {
                      setUseSceneFromPose(e.target.checked)
                      if (e.target.checked) setUseSceneFromOutfit(false)
                    }}
                    className="w-4 h-4 rounded border-border"
                  />
                  🎬 Сцена из референса позы
                </label>
              </div>
            </div>
            {useSceneFromOutfit ? (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-xs text-primary font-medium">
                  ✅ Будет использоваться сцена/интерьер из референса наряда
                </p>
              </div>
            ) : useSceneFromPose ? (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-xs text-primary font-medium">
                  ✅ Будет использоваться сцена/интерьер из референса позы
                </p>
              </div>
            ) : (
              <>
            {/* Room Type Selector */}
            <div className="flex gap-2 mb-3">
              {ROOM_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setRoomType(type.id)
                    setSelectedRoomRefIndex(null) // Reset selected index when changing type
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
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
            >
              {/* Room Preview Image */}
              <div className="h-16 w-24 rounded overflow-hidden bg-secondary/30 shrink-0 border border-border">
                <img 
                  src={selectedRoomRefIndex !== null 
                    ? (roomType === 'bedroom' ? BEDROOM_IMAGES[selectedRoomRefIndex] : LIVINGROOM_IMAGES[selectedRoomRefIndex])
                    : (roomType === 'bedroom' ? BEDROOM_IMAGES[0] : LIVINGROOM_IMAGES[0])
                  } 
                  alt="Room preview" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-2xl">${roomType === 'bedroom' ? '🛏️' : '🛋️'}</div>`
                  }}
                />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="text-sm font-medium text-foreground">
                  {roomType === 'bedroom' ? 'Спальня' : 'Гостиная'}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {selectedRoomRefIndex !== null
                    ? `Фиксирован реф #${selectedRoomRefIndex + 1}`
                    : `Случайный • ${(roomType === 'bedroom' ? roomImages : livingroomImages).filter((r) => !r.missing).length}/4 загружено`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex gap-1">
                  {(roomType === 'bedroom' ? roomImages : livingroomImages).slice(0, 4).map((img, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-8 w-12 rounded border overflow-hidden bg-secondary/30 relative',
                        img.missing ? 'border-destructive/50' : 'border-green-500/50'
                      )}
                      title={`Реф #${i + 1}${img.missing ? ' - отсутствует' : ''}`}
                    >
                      {!img.missing && (
                        <img 
                          src={img.path} 
                          alt={`Room ${i + 1}`} 
                          className="w-full h-full object-cover"
                        />
                      )}
                      {img.missing && (
                        <div className="absolute inset-0 flex items-center justify-center text-destructive text-xs">✕</div>
                      )}
                      <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[8px] px-0.5 leading-none">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </button>
            
            {/* Disorder Control */}
            {!useSceneFromPose && !useSceneFromOutfit && (
              <div className="mt-3 pt-3 border-t border-border space-y-3">
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
                  disabled={!disorderEnabled || isGenerating}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0% — идеальная чистота</span>
                  <span>100% — хаос</span>
                </div>
              </div>
            )}
            </>
            )}
          </div>

          {/* Saved NSFW Categories */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground">
                  5. Сохраненные NSFW референсы
                </label>
                <span className="text-xs text-muted-foreground/60">
                  опционально
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCategoryManager(!showCategoryManager)}
                className="h-7 text-xs gap-1"
              >
                <FolderOpen className="h-3 w-3" />
                Управление
              </Button>
            </div>

            {!selectedCategory && (
              <p className="text-xs text-muted-foreground mb-3">
                👇 Нажмите на категорию чтобы посмотреть сохраненные референсы
              </p>
            )}

            {/* Category Tabs */}
            <div className="flex gap-2 mb-3">
              {NSFW_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(prev => prev === cat.id ? null : cat.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    selectedCategory === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80'
                  )}
                >
                  <span className="mr-1">{cat.icon}</span>
                  {cat.name}
                  {nsfwReferences[cat.id]?.length > 0 && (
                    <span className="ml-1 text-[10px] opacity-70">
                      ({nsfwReferences[cat.id].length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Category Manager */}
            {showCategoryManager && (
              <div className="mb-3 p-3 bg-secondary/30 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => categoryUploadRef.current?.click()}
                    disabled={!selectedCategory}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    {selectedCategory 
                      ? `Добавить в ${NSFW_CATEGORIES.find(c => c.id === selectedCategory)?.name}`
                      : 'Выберите категорию'}
                  </Button>
                  <input
                    ref={categoryUploadRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleCategoryUpload(e.target.files)}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground space-y-1">
                  <p>✅ Загруженные референсы сохранятся и будут доступны всегда</p>
                  <p>📸 Можно загружать до 100 изображений за раз, до 500 на категорию</p>
                  <p>🗜️ Изображения автоматически сжимаются (max 1024px, качество 85%)</p>
                  {selectedCategory && (
                    <p className="text-blue-500">
                      📊 В {NSFW_CATEGORIES.find(c => c.id === selectedCategory)?.name}: {nsfwReferences[selectedCategory]?.length || 0}/500
                    </p>
                  )}
                  <p className="text-primary">
                    💾 Всего сохранено: {Object.values(nsfwReferences).reduce((sum, refs) => sum + refs.length, 0)} референсов
                  </p>
                  {Object.values(nsfwReferences).reduce((sum, refs) => sum + refs.length, 0) > 100 && (
                    <p className="text-yellow-500">
                      ⚠️ Много референсов! При проблемах с сохранением удалите старые.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Saved References Grid */}
            {selectedCategory && nsfwReferences[selectedCategory]?.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {nsfwReferences[selectedCategory].map(ref => (
                  <div
                    key={ref.id}
                    onClick={() => toggleSavedRef(ref.id, ref.dataUrl)}
                    className={cn(
                      'relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-square bg-secondary/30',
                      selectedSavedRefs.has(ref.id)
                        ? 'border-primary shadow-lg'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <img src={ref.dataUrl} alt={ref.name} className="w-full h-full object-contain" />
                    {selectedSavedRefs.has(ref.id) && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeNSFWReference(selectedCategory!, ref.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : selectedCategory ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Нет сохраненных референсов в категории {NSFW_CATEGORIES.find(c => c.id === selectedCategory)?.name}
              </div>
            ) : null}
          </div>

          {/* Manual NSFW References Upload */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">
                6. Дополнительные NSFW референсы
              </label>
              <span className="text-xs text-muted-foreground/60">
                опционально
              </span>
            </div>
            <div
              onClick={() => nsfwInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors mb-3"
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Загрузите дополнительные NSFW референсы (не сохраняются)</p>
            </div>
            <input
              ref={nsfwInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleNSFWRefsUpload(e.target.files)}
            />
            
            {nsfwRefs.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {nsfwRefs.map((ref, idx) => (
                  <div key={idx} className="relative group aspect-square bg-secondary/30 rounded-lg overflow-hidden">
                    <img src={ref} alt={`NSFW ${idx + 1}`} className="w-full h-full object-contain" />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeNSFWRef(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generated Results */}
          {results.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Результаты генерации</h3>
              <div className="grid grid-cols-2 gap-4">
                {results.map((result, idx) => (
                  <div key={result.id} className="relative rounded-lg border border-border overflow-hidden">
                    {result.status === 'pending' && (
                      <div className="aspect-square bg-secondary/30 flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">Ожидание...</p>
                      </div>
                    )}
                    {result.status === 'generating' && (
                      <div className="aspect-square bg-secondary/50 flex flex-col items-center justify-center gap-2">
                        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                        <p className="text-xs text-muted-foreground">Генерация {idx + 1}...</p>
                      </div>
                    )}
                    {result.status === 'completed' && result.imageUrl && (
                      <div 
                        className="aspect-square bg-secondary/30 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(result.imageUrl, '_blank')}
                        title="Открыть в новой вкладке"
                      >
                        <img src={result.imageUrl} alt={`Result ${idx + 1}`} className="w-full h-full object-contain" />
                      </div>
                    )}
                    {result.status === 'failed' && (
                      <div className="aspect-square bg-destructive/10 flex flex-col items-center justify-center gap-2 p-4">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <p className="text-xs text-destructive text-center">{result.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* User Wishes */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Пожелания (опционально)
            </label>
            <textarea
              value={userWishes}
              onChange={(e) => setUserWishes(e.target.value)}
              placeholder="Например: больше крупных планов, мягкое освещение..."
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Frame Count */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground mb-3 block">
              Количество кадров: {frameCount}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={frameCount}
              onChange={(e) => setFrameCount(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Цена: ${(frameCount * 0.04).toFixed(2)}
            </p>
          </div>

          {/* Aspect Ratio */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground mb-3 block">
              Соотношение сторон
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: '1:1', label: '1:1', desc: 'Квадрат' },
                { value: '3:4', label: '3:4', desc: 'Портрет' },
                { value: '4:3', label: '4:3', desc: 'Альбом' },
                { value: '9:16', label: '9:16', desc: 'Stories' },
                { value: '16:9', label: '16:9', desc: 'Широкий' },
              ].map((ratio) => (
                <button
                  key={ratio.value}
                  onClick={() => setAspectRatio(ratio.value as any)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                    aspectRatio === ratio.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary hover:bg-secondary/80 border-border'
                  )}
                >
                  <div className="font-semibold">{ratio.label}</div>
                  <div className="text-[10px] opacity-70">{ratio.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground mb-3 block">
              Разрешение
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: '1k', label: '1K', desc: '1024px' },
                { value: '2k', label: '2K', desc: '2048px' },
                { value: '4k', label: '4K', desc: '4096px' },
              ].map((res) => (
                <button
                  key={res.value}
                  onClick={() => setResolution(res.value as any)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                    resolution === res.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary hover:bg-secondary/80 border-border'
                  )}
                >
                  <div className="font-semibold">{res.label}</div>
                  <div className="text-[10px] opacity-70">{res.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground mb-3 block">
              🤖 Модель генерации
            </label>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setSelectedModel('seedream')}
                className={cn(
                  'px-3 py-2.5 rounded-lg text-xs font-medium transition-all border text-left',
                  selectedModel === 'seedream'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary hover:bg-secondary/80 border-border'
                )}
              >
                <div className="font-semibold">Seedream 4.5 Edit</div>
                <div className="text-[10px] opacity-70 mt-0.5">Высокое качество, точное редактирование</div>
              </button>
              <button
                onClick={() => setSelectedModel('nanoBanana')}
                className={cn(
                  'px-3 py-2.5 rounded-lg text-xs font-medium transition-all border text-left',
                  selectedModel === 'nanoBanana'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary hover:bg-secondary/80 border-border'
                )}
              >
                <div className="font-semibold">Nano Banana 2 Edit</div>
                <div className="text-[10px] opacity-70 mt-0.5">Быстрая, мульти-референсная</div>
              </button>
              <button
                onClick={() => setSelectedModel('gptImage2')}
                className={cn(
                  'px-3 py-2.5 rounded-lg text-xs font-medium transition-all border text-left',
                  selectedModel === 'gptImage2'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary hover:bg-secondary/80 border-border'
                )}
              >
                <div className="font-semibold">GPT Image 2 Edit</div>
                <div className="text-[10px] opacity-70 mt-0.5">OpenAI, фотореалистичность</div>
              </button>
            </div>
          </div>

          {/* Generated Prompt (collapsed view) */}
          {generatedPrompt && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <details>
                <summary className="text-xs font-medium text-primary cursor-pointer select-none">
                  📝 Промпт от Grok (нажмите чтобы показать)
                </summary>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-primary/10">
                  {generatedPrompt}
                </p>
              </details>
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !keysConfigured || !poseRefImage}
            className="w-full h-12 text-base font-semibold gap-2"
            size="lg"
          >
            {isGenerating ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Генерирую...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Сгенерировать ({frameCount} кадров)
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Room Images Modal */}
      {showRoomModal && (
        <RoomImagesModal
          onClose={() => setShowRoomModal(false)}
          images={roomType === 'bedroom' ? roomImages : livingroomImages}
          selectedRefIndex={selectedRoomRefIndex}
          onSelectRef={setSelectedRoomRefIndex}
          roomType={roomType}
        />
      )}
    </div>
  )
}
