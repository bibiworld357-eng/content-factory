export interface ApiKeys {
  grok: string
  wavespeed: string
  minimax: string
  captions: string
}

export interface GenerationItem {
  id: string
  prompt: string
  status: 'pending' | 'loading' | 'generating' | 'success' | 'error'
  imageUrl?: string
  error?: string
  modelName?: string
}

export interface UploadedImage {
  file: File
  base64: string
  dataUrl: string
  previewUrl: string
}

export type LogLevel = 'info' | 'success' | 'error'

export interface LogEntry {
  id: string
  timestamp: string
  message: string
  level: LogLevel
}

export interface VideoQueueItem {
  id: string
  imageUrl: string
  endImage?: string
  sourcePrompt: string
  videoPrompt?: string
  videoPromptRu?: string
  negativePrompt?: string
  selected: boolean
}

export interface VideoGenerationItem {
  id: string
  queueItemId: string
  imageUrl: string
  videoPrompt: string
  negativePrompt?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  requestId?: string
  videoUrl?: string
  posterUrl?: string
  error?: string
  duration: number
  withSound: boolean
  cost: number
}

export interface MinimaxTTSResult {
  audioUrl: string
  durationMs: number
  sizeBytes: number
}

export interface VideoSettings {
  resolution: '720p' | '1080p'
  aspectRatio: '9:16' | '16:9' | '1:1'
  duration: 3 | 5 | 10 | 15
  withSound: boolean
  videosPerPrompt: number
}
