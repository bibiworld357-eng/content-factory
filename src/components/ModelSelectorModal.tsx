import { X, Check, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useContentStore } from '@/store/useContentStore'
import { cn } from '@/lib/utils'

const AVAILABLE_MODELS = [
  { id: 'nano-banana-2', name: 'Nano Banana 2', provider: 'Google', color: 'from-blue-500 to-cyan-500' },
  { id: 'gpt-image-2', name: 'GPT Image 2', provider: 'OpenAI', color: 'from-emerald-500 to-teal-500' },
  { id: 'z-image-turbo-lora', name: 'Z-Image Turbo LoRA', provider: 'с LoRA', color: 'from-purple-500 to-pink-500' },
  { id: 'grok-imagine', name: 'Grok Imagine', provider: 'xAI', color: 'from-orange-500 to-red-500' },
  { id: 'seedream-v4.5', name: 'Seedream v4.5', provider: 'ByteDance', color: 'from-violet-500 to-fuchsia-500' },
]

export function ModelSelectorModal() {
  const {
    showModelSelector,
    setShowModelSelector,
    selectedModelsForBatch,
    setSelectedModelsForBatch,
    batchFrameCount,
    setBatchFrameCount,
  } = useContentStore()

  if (!showModelSelector) return null

  const toggleModel = (modelId: string) => {
    if (selectedModelsForBatch.includes(modelId)) {
      setSelectedModelsForBatch(selectedModelsForBatch.filter((id) => id !== modelId))
    } else {
      setSelectedModelsForBatch([...selectedModelsForBatch, modelId])
    }
  }

  const selectAll = () => {
    setSelectedModelsForBatch(AVAILABLE_MODELS.map((m) => m.id))
  }

  const deselectAll = () => {
    setSelectedModelsForBatch([])
  }

  const handleGenerate = () => {
    if (selectedModelsForBatch.length === 0) return
    setShowModelSelector(false)
    // Trigger generation will be handled by parent component
    const event = new CustomEvent('batch-generate-start')
    window.dispatchEvent(event)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => setShowModelSelector(false)}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border p-6 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Выбор моделей для генерации</h2>
                <p className="text-sm text-muted-foreground">Выберите модели и количество кадров</p>
              </div>
            </div>
            <button
              onClick={() => setShowModelSelector(false)}
              className="h-8 w-8 rounded-lg hover:bg-secondary/80 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Quick Actions */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Выбрано: <span className="font-semibold text-foreground">{selectedModelsForBatch.length}</span> / {AVAILABLE_MODELS.length}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={selectAll}
                className="text-xs h-7"
              >
                Выбрать все
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deselectAll}
                className="text-xs h-7"
              >
                Снять всё
              </Button>
            </div>
          </div>

          {/* Models Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = selectedModelsForBatch.includes(model.id)
              return (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={cn(
                    'relative rounded-xl border-2 p-4 text-left transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-lg shadow-primary/20'
                      : 'border-border bg-card hover:border-border/80 hover:bg-secondary/30'
                  )}
                >
                  {/* Checkmark */}
                  <div
                    className={cn(
                      'absolute top-3 right-3 h-6 w-6 rounded-full flex items-center justify-center transition-all',
                      isSelected
                        ? 'bg-primary scale-100'
                        : 'bg-secondary/50 scale-90'
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>

                  {/* Model Info */}
                  <div className="pr-8">
                    <div className="text-sm font-bold text-foreground mb-0.5">{model.name}</div>
                    <div className="text-xs text-muted-foreground">{model.provider}</div>
                  </div>

                  {/* Color Bar */}
                  <div className={cn('h-1 rounded-full mt-3 bg-gradient-to-r', model.color, 'opacity-60')} />
                </button>
              )
            })}
          </div>

          {/* Frame Count Slider */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Количество кадров на модель</label>
              <input
                type="number"
                min={1}
                max={12}
                value={batchFrameCount}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(12, parseInt(e.target.value) || 1))
                  setBatchFrameCount(v)
                }}
                className="w-14 h-8 rounded-md border border-input bg-input text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Slider
              min={1}
              max={12}
              step={1}
              value={[batchFrameCount]}
              onValueChange={([v]) => setBatchFrameCount(v)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 кадр</span>
              <span>12 кадров</span>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Для каждой выбранной модели будет создано <span className="font-semibold text-foreground">{batchFrameCount}</span> {batchFrameCount === 1 ? 'изображение' : batchFrameCount < 5 ? 'изображения' : 'изображений'}.
              Всего: <span className="font-semibold text-primary">{selectedModelsForBatch.length * batchFrameCount}</span> {(selectedModelsForBatch.length * batchFrameCount) === 1 ? 'изображение' : (selectedModelsForBatch.length * batchFrameCount) < 5 ? 'изображения' : 'изображений'}.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border p-6">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowModelSelector(false)}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={selectedModelsForBatch.length === 0}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25"
            >
              <Layers className="h-4 w-4 mr-2" />
              Сгенерировать ({selectedModelsForBatch.length * batchFrameCount})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
