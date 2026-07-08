import { useState, useCallback } from 'react'
import { Trash2, ChevronDown, ChevronUp, Image as ImageIcon, Upload, RefreshCw, CheckSquare, Square } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { EndFrameDropzone } from '@/components/EndFrameDropzone'
import { useContentStore } from '@/store/useContentStore'
import { generateId, cn } from '@/lib/utils'
import { DNA } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface VideoQueuePanelProps {
  onRegeneratePrompt?: (itemId: string) => void
}

export function VideoQueuePanel({ onRegeneratePrompt }: VideoQueuePanelProps) {
  const { videoQueue, removeFromVideoQueue, toggleVideoQueueSelection, selectAllVideoQueue, setVideoPrompt, setVideoNegativePrompt, setVideoEndImage, addToVideoQueue, addLog } =
    useContentStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [uploadingEndFrameId, setUploadingEndFrameId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null)

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return

      addLog?.(`Загрузка ${acceptedFiles.length} изображени${acceptedFiles.length === 1 ? 'я' : 'й'}...`)

      for (const imageFile of acceptedFiles) {
        try {
          // Convert to base64 for Grok API compatibility
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(imageFile)
          })

          addToVideoQueue({
            id: generateId(),
            imageUrl: base64,
            sourcePrompt: `Uploaded: ${imageFile.name}`,
            selected: false,
          })

          addLog?.(`✓ ${imageFile.name}`, 'success')
        } catch (err) {
          addLog?.(`✗ ${imageFile.name}: ${err instanceof Error ? err.message : 'Ошибка'}`, 'error')
        }
      }

      addLog?.(`Загружено ${acceptedFiles.length} изображени${acceptedFiles.length === 1 ? 'е' : 'й'}`, 'success')
    },
    [addToVideoQueue, addLog]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: true,
  })

  const handleEndFrameDrop = useCallback(
    async (itemId: string, acceptedFiles: File[]) => {
      const imageFile = acceptedFiles[0]
      if (!imageFile) return

      setUploadingEndFrameId(itemId)
      addLog?.(`Загрузка конечного кадра: ${imageFile.name}...`)

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(imageFile)
        })

        setVideoEndImage(itemId, base64)
        addLog?.(`Конечный кадр добавлен: ${imageFile.name}`, 'success')
      } catch (err) {
        addLog?.(`Ошибка загрузки конечного кадра: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`, 'error')
      } finally {
        setUploadingEndFrameId(null)
      }
    },
    [setVideoEndImage, addLog]
  )

  const handleImageUrlDrop = useCallback(
    (itemId: string, imageUrl: string) => {
      setVideoEndImage(itemId, imageUrl)
      addLog?.(`Конечный кадр установлен из результатов`, 'success')
    },
    [setVideoEndImage, addLog]
  )

  if (videoQueue.length === 0) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          "rounded-xl border-2 border-dashed bg-card/50 py-12 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all",
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-card'
        )}
      >
        <input {...getInputProps()} />
        <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
          {isDragActive ? (
            <Upload className="h-6 w-6 text-primary" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {isDragActive ? 'Отпустите для загрузки' : 'Очередь изображений пуста'}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {isDragActive ? 'Загрузите изображения для генерации видео' : 'Перетащите фото (можно несколько) или используйте вкладку img-to-img'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Изображения для видео — {videoQueue.length}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {videoQueue.filter((q) => q.selected).length} выбрано
          </span>
          {videoQueue.length > 0 && (
            <button
              onClick={() => {
                const allSelected = videoQueue.every((q) => q.selected)
                selectAllVideoQueue(!allSelected)
              }}
              className="h-7 px-2.5 rounded-md bg-secondary/50 hover:bg-secondary border border-border flex items-center gap-1.5 text-xs font-medium text-foreground transition-colors"
              title={videoQueue.every((q) => q.selected) ? 'Снять выделение' : 'Выделить все'}
            >
              {videoQueue.every((q) => q.selected) ? (
                <CheckSquare className="h-3 w-3" />
              ) : (
                <Square className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">
                {videoQueue.every((q) => q.selected) ? 'Снять все' : 'Выделить все'}
              </span>
            </button>
          )}
          <div
            {...getRootProps()}
            className="cursor-pointer"
          >
            <input {...getInputProps()} />
            <button className="h-7 px-2.5 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/30 flex items-center gap-1.5 text-xs font-medium text-primary transition-colors">
              <Upload className="h-3 w-3" />
              <span className="hidden sm:inline">Загрузить фото</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {videoQueue.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'rounded-xl border bg-card overflow-hidden transition-all duration-200',
              item.selected ? 'border-primary shadow-lg shadow-primary/20' : 'border-border'
            )}
          >
            {/* Start & End Frames */}
            <div className="grid grid-cols-2 gap-2 p-2">
              {/* Start Frame */}
              <div className="relative aspect-square bg-secondary/30 rounded-lg overflow-hidden">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={`Start ${index + 1}`}
                    crossOrigin={item.imageUrl.startsWith('http') ? 'anonymous' : undefined}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewImage({ url: item.imageUrl, title: `START кадр #${index + 1}` })}
                    onError={(e) => {
                      console.error('[VideoQueue] Image failed to load:', item.id, 'URL:', item.imageUrl?.substring(0, 100))
                      // Show placeholder on error
                      const parent = e.currentTarget.parentElement
                      if (parent) {
                        const placeholder = parent.querySelector('.image-placeholder')
                        if (placeholder) {
                          (placeholder as HTMLElement).style.display = 'flex'
                        }
                      }
                      e.currentTarget.style.display = 'none'
                    }}
                    onLoad={() => {
                      console.log('[VideoQueue] Image loaded successfully:', item.id)
                    }}
                  />
                ) : null}
                {/* Fallback placeholder */}
                <div className={cn(
                  "image-placeholder absolute inset-0 flex-col items-center justify-center gap-2 bg-secondary/50",
                  (item.imageUrl && (item.imageUrl.startsWith('data:') || item.imageUrl.startsWith('http'))) ? "hidden" : "flex"
                )}>
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground/60">Нет превью</span>
                  {item.imageUrl && !item.imageUrl.startsWith('data:') && !item.imageUrl.startsWith('http') && (
                    <span className="text-[9px] text-destructive/80">Неверный формат URL</span>
                  )}
                </div>
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 z-10">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleVideoQueueSelection(item.id)}
                    className="h-3.5 w-3.5 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-[10px] font-bold bg-black/70 text-white px-1.5 py-0.5 rounded">
                    #{index + 1}
                  </span>
                </div>
                <div className="absolute bottom-1.5 left-1.5 right-1.5">
                  <div className="text-[10px] font-semibold bg-primary/90 text-primary-foreground px-2 py-0.5 rounded text-center">
                    START
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    console.log('[Delete] Button clicked for item:', item.id, 'index:', index)
                    if (confirm(`Удалить кадр #${index + 1} из очереди?`)) {
                      console.log('[Delete] User confirmed, removing:', item.id)
                      removeFromVideoQueue(item.id)
                      addLog?.(`Кадр #${index + 1} удалён из очереди`)
                    } else {
                      console.log('[Delete] User cancelled')
                    }
                  }}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center transition-colors z-10 cursor-pointer"
                  title="Удалить из очереди"
                >
                  <Trash2 className="h-3 w-3 text-white" />
                </button>
              </div>

              {/* End Frame Dropzone */}
              <EndFrameDropzone
                itemId={item.id}
                endImage={item.endImage}
                isUploading={uploadingEndFrameId === item.id}
                onDrop={handleEndFrameDrop}
                onRemove={(id) => {
                  setVideoEndImage(id, undefined)
                  addLog?.('Конечный кадр удалён')
                }}
                onImageUrlDrop={handleImageUrlDrop}
                onImageClick={(url, title) => setPreviewImage({ url, title })}
                index={index}
              />
            </div>

            {/* Source Prompt (Collapsed) */}
            <div className="p-3 border-t border-border/50">
              <button
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                className="w-full flex items-center justify-between text-left group"
              >
                <span className="text-xs font-medium text-muted-foreground">Промпт источника</span>
                {expandedId === item.id ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </button>
              {expandedId === item.id && (
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed bg-secondary/40 rounded-lg p-2 border border-border/30">
                  {item.sourcePrompt}
                </p>
              )}
            </div>

            {/* Video Prompt (Editable) */}
            <div className="p-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-foreground block">
                    Промпт для видео (EN)
                  </label>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium" title="DNA модели будет добавлена автоматически">
                    +DNA
                  </span>
                </div>
                {item.videoPrompt && onRegeneratePrompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setRegeneratingId(item.id)
                      await onRegeneratePrompt(item.id)
                      setRegeneratingId(null)
                    }}
                    disabled={regeneratingId === item.id}
                    className="h-6 px-2 text-xs"
                  >
                    {regeneratingId === item.id ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <><RefreshCw className="h-3 w-3 mr-1" />Обновить</>
                    )}
                  </Button>
                )}
              </div>
              <Textarea
                value={item.videoPrompt ?? ''}
                onChange={(e) => setVideoPrompt(item.id, e.target.value)}
                placeholder="Промпт будет сгенерирован Grok..."
                className="text-xs resize-none overflow-hidden"
                disabled={!item.videoPrompt}
                rows={Math.max(3, Math.ceil((item.videoPrompt?.length ?? 0) / 50))}
              />
              {item.videoPromptRu && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground block">
                    Перевод (RU)
                  </label>
                  <div className="text-xs text-muted-foreground leading-relaxed bg-secondary/40 rounded-lg p-2 border border-border/30 max-h-32 overflow-y-auto">
                    {item.videoPromptRu}
                  </div>
                </div>
              )}
              {item.videoPrompt && (
                <div className="space-y-1 mt-3 pt-3 border-t border-border/30">
                  <label className="text-xs font-semibold text-primary block flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Полный промпт для генерации
                  </label>
                  <div className="text-xs leading-relaxed bg-primary/5 rounded-lg p-3 border border-primary/20 max-h-48 overflow-y-auto font-mono">
                    <div className="text-primary/80 mb-2 pb-2 border-b border-primary/10">
                      <span className="font-semibold">DNA:</span>
                    </div>
                    <div className="text-foreground/90 mb-3">
                      {DNA}
                    </div>
                    <div className="text-primary/80 mb-2 pb-2 border-b border-primary/10">
                      <span className="font-semibold">Промпт движения:</span>
                    </div>
                    <div className="text-foreground/90">
                      {item.videoPrompt}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Negative Prompt (Editable) */}
            <div className="p-3 border-t border-border/50 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">
                Негативный промпт (опционально)
              </label>
              <Textarea
                value={item.negativePrompt ?? ''}
                onChange={(e) => setVideoNegativePrompt(item.id, e.target.value)}
                placeholder="Что исключить из видео..."
                className="min-h-[60px] text-xs resize-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl w-[90vw] p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-lg font-semibold">
              {previewImage?.title || 'Предпросмотр'}
            </DialogTitle>
          </DialogHeader>
          <div className="relative w-full flex items-center justify-center bg-black/5 p-4">
            {previewImage && (
              <img
                src={previewImage.url}
                alt={previewImage.title}
                crossOrigin={previewImage.url.startsWith('http') ? 'anonymous' : undefined}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
