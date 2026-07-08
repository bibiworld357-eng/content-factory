import { useState, useRef } from 'react'
import { Upload, Sparkles, ImageIcon, X, Download } from 'lucide-react'
import { useContentStore } from '@/store/useContentStore'
import { upscaleWithCrystal } from '@/lib/api'
import { fileToBase64, cn } from '@/lib/utils'
import type { LogLevel } from '@/types'

interface LogEntry {
  id: string
  message: string
  level: LogLevel
  timestamp: number
}

export function UpscalePanel() {
  const { apiKeys } = useContentStore()
  
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Parameters
  const [targetMegapixels, setTargetMegapixels] = useState(12)
  const [creativity, setCreativity] = useState(0.5)
  
  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([])
  
  // Drag & drop
  const [isDragging, setIsDragging] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  
  const addLog = (message: string, level: LogLevel = 'info') => {
    setLogs(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      message,
      level,
      timestamp: Date.now(),
    }])
  }
  
  const handleFileUpload = async (file: File) => {
    const base64 = await fileToBase64(file)
    setSourceImage(base64)
    setResultImage(null)
    addLog('Изображение загружено', 'success')
  }
  
  const handleUpscale = async () => {
    if (!sourceImage) {
      addLog('Загрузите изображение', 'error')
      return
    }
    
    if (!apiKeys.wavespeed) {
      addLog('API ключ Wavespeed не настроен', 'error')
      return
    }
    
    setIsProcessing(true)
    setResultImage(null)
    addLog(`Запуск upscale: ${targetMegapixels} MP, creativity: ${creativity}`, 'info')
    
    try {
      const result = await upscaleWithCrystal(
        apiKeys.wavespeed,
        sourceImage,
        targetMegapixels,
        creativity,
        addLog
      )
      
      setResultImage(result.imageUrl)
      addLog('✅ Upscale завершен успешно!', 'success')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Неизвестная ошибка'
      addLog(`Ошибка: ${errorMsg}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }
  
  const handleDownload = () => {
    if (!resultImage) return
    
    const link = document.createElement('a')
    link.href = resultImage
    link.download = `upscaled-${Date.now()}.png`
    link.click()
  }
  
  const keysConfigured = !!apiKeys.wavespeed
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-5 w-5 text-blue-500" />
        <h1 className="text-lg font-semibold text-foreground">Crystal Upscaler</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Увеличение разрешения изображений с сохранением деталей
      </p>
      
      {!keysConfigured && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p className="text-sm text-yellow-600 dark:text-yellow-500">
            Настройте API ключ Wavespeed в настройках
          </p>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Image */}
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="text-sm font-medium text-foreground mb-3 block">
            Исходное изображение
          </label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              const file = e.dataTransfer.files[0]
              if (file && file.type.startsWith('image/')) handleFileUpload(file)
            }}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
              isDragging
                ? 'border-primary bg-primary/10 scale-[1.01]'
                : sourceImage
                  ? 'border-border hover:border-primary/50'
                  : 'border-border hover:border-primary/50 hover:bg-secondary/20'
            )}
          >
            {sourceImage ? (
              <div className="relative">
                <img src={sourceImage} alt="Source" className="max-h-64 mx-auto rounded-lg" />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSourceImage(null)
                    setResultImage(null)
                  }}
                  className="absolute top-2 right-2 p-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <ImageIcon className={cn('h-12 w-12 mx-auto mb-2 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground')} />
                <p className="text-sm text-muted-foreground">
                  {isDragging ? 'Отпустите чтобы загрузить' : 'Перетащите или загрузите изображение'}
                </p>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
        </div>
        
        {/* Result */}
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="text-sm font-medium text-foreground mb-3 block">
            Результат
          </label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center min-h-[300px] flex items-center justify-center">
            {resultImage ? (
              <div className="relative w-full">
                <img 
                  src={resultImage} 
                  alt="Result" 
                  className="max-h-64 mx-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(resultImage, '_blank')}
                />
                <button
                  onClick={handleDownload}
                  className="absolute top-2 right-2 p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ) : isProcessing ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Обработка...</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Результат появится здесь</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Parameters */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-6">
        <h3 className="text-sm font-semibold text-foreground">Параметры</h3>
        
        {/* Target Megapixels */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Целевое разрешение
            </label>
            <span className="text-sm text-muted-foreground font-mono">{targetMegapixels} MP</span>
          </div>
          <input
            type="range"
            min="4"
            max="100"
            step="1"
            value={targetMegapixels}
            onChange={(e) => setTargetMegapixels(Number(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            disabled={isProcessing}
          />
          <p className="text-xs text-muted-foreground">
            Целевой размер выходного изображения в мегапикселях. 
            4MP ≈ 2000×2000px, 12MP ≈ 4000×3000px, 50MP ≈ 8680×5779px
          </p>
          <div className="text-xs text-muted-foreground space-y-1 mt-2">
            <div>• Web/маркетинг: 6–12 MP</div>
            <div>• Журналы/печать: 16–25 MP</div>
            <div>• Постеры: 25–50 MP</div>
            <div>• Билборды: 50–100 MP</div>
          </div>
        </div>
        
        {/* Creativity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Креативность
            </label>
            <span className="text-sm text-muted-foreground font-mono">{creativity.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={creativity}
            onChange={(e) => setCreativity(Number(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            disabled={isProcessing}
          />
          <p className="text-xs text-muted-foreground">
            Уровень креативности при восстановлении деталей. 
            0.0 = точное увеличение, 1.0 = максимальное восстановление деталей с добавлением текстур.
            Рекомендуется 0.3-0.7 для баланса между точностью и качеством.
          </p>
        </div>
        
        {/* Upscale Button */}
        <button
          onClick={handleUpscale}
          disabled={isProcessing || !keysConfigured || !sourceImage}
          className="w-full h-12 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {isProcessing ? 'Обработка...' : 'Upscale'}
        </button>
      </div>
      
      {/* Logs */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Логи</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
            {logs.map(log => (
              <div
                key={log.id}
                className={
                  log.level === 'error' ? 'text-red-500' :
                  log.level === 'success' ? 'text-green-500' :
                  'text-muted-foreground'
                }
              >
                {new Date(log.timestamp).toLocaleTimeString('ru-RU')} {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
