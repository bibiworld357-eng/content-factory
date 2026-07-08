import { useState } from 'react'
import { Download, AlertCircle, RefreshCw, ImageIcon, X, Expand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import { cn } from '@/lib/utils'

const ASPECT_CLASS: Record<string, string> = {
  '1:1':  'aspect-square',
  '3:4':  'aspect-[3/4]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-[16/9]',
}

const GRID_COLS: Record<string, string> = {
  '1:1':  'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  '3:4':  'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  '9:16': 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  '16:9': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
}

export function GenerationGrid() {
  const { generations, aspectRatio } = useContentStore()
  const [lightbox, setLightbox] = useState<{ url: string; index: number; modelName?: string } | null>(null)

  if (generations.length === 0) return null

  const aspectClass = ASPECT_CLASS[aspectRatio] ?? 'aspect-square'
  const gridCols = GRID_COLS[aspectRatio] ?? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'

  function handleDownload(url: string, index: number) {
    // For external URLs (CloudFront), open in new tab (CORS prevents download)
    if (url.startsWith('http')) {
      window.open(url, '_blank')
    } else {
      // For data URLs, download directly
      const a = document.createElement('a')
      a.href = url
      a.download = `frame-${index + 1}.png`
      a.click()
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">
            Результаты — {generations.length} кадр{generations.length === 1 ? '' : generations.length < 5 ? 'а' : 'ов'}
          </h2>
          <span className="text-xs text-muted-foreground">
            {generations.filter((g) => g.status === 'success').length} / {generations.length} готово
          </span>
        </div>

        <div className={cn('grid gap-3', gridCols)}>
          {generations.map((item, index) => (
            <div
              key={item.id}
              className={cn('group relative rounded-xl overflow-hidden border border-border bg-card', aspectClass)}
            >
              {(item.status === 'loading' || item.status === 'generating') && (
                <div className="absolute inset-0 shimmer">
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {item.modelName ? item.modelName : `Кадр ${index + 1}`}
                    </span>
                  </div>
                </div>
              )}

              {item.status === 'pending' && (
                <div className="absolute inset-0 bg-secondary/50 flex flex-col items-center justify-center gap-2">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground/60">Ожидание...</span>
                </div>
              )}

              {item.status === 'error' && (
                <div className="absolute inset-0 bg-destructive/5 border border-destructive/20 flex flex-col items-center justify-center gap-2 p-4">
                  <AlertCircle className="h-8 w-8 text-destructive/60" />
                  <span className="text-xs text-destructive/80 text-center line-clamp-3">
                    {item.error ?? 'Ошибка генерации'}
                  </span>
                </div>
              )}

              {item.status === 'success' && item.imageUrl && (
                <>
                  <img
                    src={item.imageUrl}
                    alt={`Кадр ${index + 1}`}
                    crossOrigin={item.imageUrl.startsWith('http') ? 'anonymous' : undefined}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-image-url', item.imageUrl!)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-grab active:cursor-grabbing"
                    onClick={() => setLightbox({ url: item.imageUrl!, index, modelName: item.modelName })}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                  
                  {/* Model Name Badge */}
                  {item.modelName && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm border border-white/10">
                      <span className="text-[10px] font-semibold text-white/90">{item.modelName}</span>
                    </div>
                  )}

                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => setLightbox({ url: item.imageUrl!, index, modelName: item.modelName })}
                      className="flex items-center gap-1 text-xs text-white/80 hover:text-white font-medium"
                    >
                      <Expand className="h-3 w-3" />
                      {item.modelName ? item.modelName : `Кадр ${index + 1}`}
                    </button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7 bg-white/20 hover:bg-white/30 backdrop-blur-sm border-0"
                      onClick={(e) => { e.stopPropagation(); handleDownload(item.imageUrl!, index) }}
                    >
                      <Download className="h-3.5 w-3.5 text-white" />
                    </Button>
                  </div>
                </>
              )}

              <div className={cn(
                'absolute top-2 left-2 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                item.status === 'success' ? 'bg-emerald-500 text-white' :
                item.status === 'error' ? 'bg-destructive text-white' :
                item.status === 'loading' || item.status === 'generating' ? 'bg-primary text-white' :
                'bg-secondary text-muted-foreground'
              )}>
                {item.status === 'loading' || item.status === 'generating' ? (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  index + 1
                )}
              </div>
            </div>
          ))}
        </div>

        {generations.some((g) => g.status === 'success') && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                generations
                  .filter((g) => g.status === 'success' && g.imageUrl)
                  .forEach((g, originalIndex) => {
                    const actualIndex = generations.indexOf(g)
                    setTimeout(() => {
                      handleDownload(g.imageUrl!, actualIndex)
                    }, originalIndex * 300)
                  })
              }}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Скачать все ({generations.filter((g) => g.status === 'success').length})
            </Button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5 text-white" />
          </button>

          <img
            src={lightbox.url}
            alt={`Кадр ${lightbox.index + 1}`}
            crossOrigin={lightbox.url.startsWith('http') ? 'anonymous' : undefined}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          <div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm text-white/60">{lightbox.modelName ? lightbox.modelName : `Кадр ${lightbox.index + 1}`}</span>
            <Button
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-white border-white/10 gap-1.5"
              onClick={() => handleDownload(lightbox.url, lightbox.index)}
            >
              <Download className="h-3.5 w-3.5" />
              Скачать
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
