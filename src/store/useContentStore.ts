import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApiKeys, GenerationItem, UploadedImage, LogEntry, LogLevel, VideoQueueItem, VideoGenerationItem, VideoSettings, MinimaxTTSResult } from '@/types'
import type { VisionProvider } from '@/lib/vision'
import type { PipelineScene, PipelineConfig } from '@/lib/pipeline'
import { DEFAULT_PIPELINE_CONFIG } from '@/lib/pipeline'

export interface XPost {
  author: string
  handle: string
  text: string
  url: string
  engagement: string
}

export interface TrendingTopic {
  title: string
  titleRu?: string
  engagement: 'high' | 'medium' | 'low'
  polarization: string
  summary: string
  summaryRu?: string
  metrics?: {
    postCount?: string
    topEngagement?: string
    trendSince?: string
  }
}

export interface NewsResearchState {
  trending: TrendingTopic[]
  selectedTopic: TrendingTopic
  newsDetails: string
  translationRu: string
  sources: string[]
  postText: string
  postTranslationRu: string
  hashtags: string[]
  researchedAt: string
  stepLogs: Array<{ step: string; result: string; timestamp: string }>
  postDuration: number // seconds (1-60)
  xPosts: XPost[]
  currentStep: string
}

// Client-side keys are sourced from Vite env vars (VITE_*) when provided, with a
// fallback to the previously bundled defaults so existing setups keep working.
const env = import.meta.env
export const DEFAULT_API_KEYS: ApiKeys = {
  grok:
    env.VITE_GROK_API_KEY ||
    'xai-1MVZjm5QQp8mLBFN7NM0h6T8QE8lJFssWLexf8TOXgtB3eAjaQHTLAKhIH3Ek0SHsCHXsG9BvHsR9Bx1',
  gemini: env.VITE_GEMINI_API_KEY || '',
  wavespeed:
    env.VITE_WAVESPEED_API_KEY ||
    '6596ca1d99d8f874b122c7c1257f86c2ed865e49cef128dbceee99750d756160',
  minimax:
    env.VITE_MINIMAX_API_KEY ||
    'sk-cp-CxeADii40oheASIHcLZI3LhF3Tw3QuE48iNEJd_pfdAHdTlHfbKXegOgvZIxwvInk61RhFuJ4kBsEL0F5SMmeeXOqS3SnuKheF5eRO8oZFHEhP0iLkMma7s',
  captions: env.VITE_CAPTIONS_API_KEY || 'sk-h1fsmkfc6d-4Xyokckm4LuLbDCkp4N0skjJwCCS1tZ4',
}

const DEFAULT_MASTER_PROMPT = `Analyze the uploaded photo of the girl and create detailed variation prompts for Nano Banana 2 Edit model. Keep exact same appearance, clothing, hair, environment and lighting. Change ONLY: pose, camera angle, framing (close-up / medium / full), head tilt, gaze direction, subtle emotion/facial expression.`

// Check localStorage BEFORE store creation to determine whether to show the auto-keys toast
const _initialAutoKeyToast = (() => {
  try {
    const raw = localStorage.getItem('content-factory-storage')
    if (!raw) return true
    const parsed = JSON.parse(raw) as { state?: { apiKeys?: { grok?: string } } }
    return !parsed?.state?.apiKeys?.grok
  } catch {
    return true
  }
})()

function makeTimestamp(): string {
  const now = new Date()
  return now.toTimeString().slice(0, 8)
}

interface ContentStore {
  apiKeys: ApiKeys
  masterPrompt: string
  frameCount: number
  userWishes: string
  uploadedImage: UploadedImage | null
  generations: GenerationItem[]
  isGenerating: boolean
  showApiModal: boolean
  showLogs: boolean
  showAutoKeyToast: boolean
  logs: LogEntry[]
  grokPrompts: string[]
  grokTranslations: string[]
  aspectRatio: '1:1' | '3:4' | '9:16' | '16:9'
  resolution: '0.5k' | '1k' | '2k' | '4k'
  intensity: number
  imgToImgModel: 'nano-banana-2' | 'gpt-image-2' | 'z-image-turbo-lora' | 'grok-imagine' | 'seedream-v4.5'
  zImageStrength: number
  selectedModelsForBatch: string[]
  showModelSelector: boolean
  batchFrameCount: number
  activeTab: 'bogdana' | 'pipeline' | 'variations' | 'img-to-video' | 'news-to-post' | 'montage' | 'voice' | 'infinitetalk' | 'subs' | 'text-to-post' | 'inst-to-post' | 'nsfw' | 'upscale' | 'uniqueizer'
  visionProvider: VisionProvider
  pipelineScenes: PipelineScene[]
  pipelineConfig: PipelineConfig
  voiceResult: MinimaxTTSResult | null
  pendingVoiceText: string | null
  newsResearch: NewsResearchState | null
  isResearching: boolean
  videoQueue: VideoQueueItem[]
  videoGenerations: VideoGenerationItem[]
  videoSettings: VideoSettings
  videoWishes: string
  removedVideoQueueIds: Set<string> // Track manually removed items
  wavespeedBalance: number | null
  isLoadingBalance: boolean
  nsfwReferences: Record<string, Array<{ id: string; dataUrl: string; name?: string }>>

  setApiKeys: (keys: ApiKeys) => void
  addNSFWReference: (category: string, dataUrl: string, name?: string) => void
  removeNSFWReference: (category: string, id: string) => void
  clearNSFWCategory: (category: string) => void
  setMasterPrompt: (prompt: string) => void
  setFrameCount: (count: number) => void
  setUserWishes: (wishes: string) => void
  setVideoWishes: (wishes: string) => void
  setUploadedImage: (image: UploadedImage | null) => void
  setGenerations: (items: GenerationItem[]) => void
  updateGeneration: (id: string, update: Partial<GenerationItem>) => void
  setIsGenerating: (v: boolean) => void
  setShowApiModal: (v: boolean) => void
  setShowLogs: (v: boolean) => void
  setShowAutoKeyToast: (v: boolean) => void
  addLog: (message: string, level?: LogLevel) => void
  clearLogs: () => void
  setGrokPrompts: (prompts: string[]) => void
  setGrokTranslations: (translations: string[]) => void
  setAspectRatio: (v: '1:1' | '3:4' | '9:16' | '16:9') => void
  setResolution: (v: '0.5k' | '1k' | '2k' | '4k') => void
  setIntensity: (v: number) => void
  setImgToImgModel: (v: 'nano-banana-2' | 'gpt-image-2' | 'z-image-turbo-lora' | 'grok-imagine' | 'seedream-v4.5') => void
  setZImageStrength: (v: number) => void
  setSelectedModelsForBatch: (models: string[]) => void
  setShowModelSelector: (show: boolean) => void
  setBatchFrameCount: (count: number) => void
  setActiveTab: (tab: 'bogdana' | 'pipeline' | 'variations' | 'img-to-video' | 'news-to-post' | 'montage' | 'voice' | 'infinitetalk' | 'subs' | 'text-to-post' | 'inst-to-post' | 'nsfw' | 'upscale' | 'uniqueizer') => void
  setVisionProvider: (provider: VisionProvider) => void
  setPipelineScenes: (scenes: PipelineScene[]) => void
  updatePipelineScene: (scene: PipelineScene) => void
  setPipelineConfig: (config: Partial<PipelineConfig>) => void
  setVoiceResult: (result: MinimaxTTSResult | null) => void
  setPendingVoiceText: (text: string | null) => void
  setNewsResearch: (result: NewsResearchState | null) => void
  setIsResearching: (v: boolean) => void
  clearNewsResearch: () => void
  addNewsStepLog: (step: string, result: string) => void
  awaitingTopicSelection: boolean
  setAwaitingTopicSelection: (v: boolean) => void
  addToVideoQueue: (item: VideoQueueItem) => void
  removeFromVideoQueue: (id: string) => void
  toggleVideoQueueSelection: (id: string) => void
  selectAllVideoQueue: (selected: boolean) => void
  setVideoPrompt: (id: string, prompt: string) => void
  setVideoPromptRu: (id: string, promptRu: string) => void
  setVideoNegativePrompt: (id: string, negativePrompt: string) => void
  setVideoEndImage: (id: string, endImage: string | undefined) => void
  setVideoSettings: (settings: Partial<VideoSettings>) => void
  setVideoGenerations: (items: VideoGenerationItem[]) => void
  updateVideoGeneration: (id: string, update: Partial<VideoGenerationItem>) => void
  clearVideoQueue: () => void
  setWavespeedBalance: (balance: number | null) => void
  setIsLoadingBalance: (loading: boolean) => void
}

export const useContentStore = create<ContentStore>()(
  persist(
    (set) => ({
      apiKeys: DEFAULT_API_KEYS,
      masterPrompt: DEFAULT_MASTER_PROMPT,
      frameCount: 4,
      userWishes: '',
      uploadedImage: null,
      generations: [],
      isGenerating: false,
      showApiModal: false,
      showLogs: true,
      showAutoKeyToast: _initialAutoKeyToast,
      logs: [],
      grokPrompts: [],
      grokTranslations: [],
      aspectRatio: '1:1',
      resolution: '1k',
      intensity: 50,
      imgToImgModel: 'nano-banana-2',
      zImageStrength: 0.6,
      selectedModelsForBatch: [],
      showModelSelector: false,
      batchFrameCount: 1,
      activeTab: 'bogdana',
      visionProvider: 'grok',
      pipelineScenes: [],
      pipelineConfig: DEFAULT_PIPELINE_CONFIG,
      voiceResult: null,
      pendingVoiceText: null,
      newsResearch: null,
      isResearching: false,
      awaitingTopicSelection: false,
      videoQueue: [],
      videoGenerations: [],
      videoSettings: {
        resolution: '1080p',
        aspectRatio: '9:16',
        duration: 5,
        withSound: false,
        videosPerPrompt: 1,
      },
      videoWishes: '',
      removedVideoQueueIds: new Set(),
      wavespeedBalance: null,
      isLoadingBalance: false,
      nsfwReferences: {},

      setApiKeys: (keys) => set({ apiKeys: keys }),
      addNSFWReference: (category, dataUrl, name) => {
        try {
          set((state) => {
            const categoryRefs = state.nsfwReferences[category] || []
            const newRef = {
              id: `nsfw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              dataUrl,
              name,
            }
            const newState = {
              nsfwReferences: {
                ...state.nsfwReferences,
                [category]: [...categoryRefs, newRef],
              },
            }
            
            // Log the update
            console.log(`[Store] Added NSFW ref to ${category}, total in category: ${newState.nsfwReferences[category].length}`)
            
            return newState
          })
        } catch (err) {
          console.error('[Store] Failed to add NSFW reference:', err)
          // Re-throw to let the UI handle it
          if (err instanceof Error && err.message.includes('QuotaExceededError')) {
            throw new Error('QuotaExceededError')
          }
          throw err
        }
      },
      removeNSFWReference: (category, id) =>
        set((state) => ({
          nsfwReferences: {
            ...state.nsfwReferences,
            [category]: (state.nsfwReferences[category] || []).filter((ref) => ref.id !== id),
          },
        })),
      clearNSFWCategory: (category) =>
        set((state) => {
          const updated = { ...state.nsfwReferences }
          delete updated[category]
          return { nsfwReferences: updated }
        }),
      setMasterPrompt: (prompt) => set({ masterPrompt: prompt }),
      setFrameCount: (count) => set({ frameCount: count }),
      setUserWishes: (wishes) => set({ userWishes: wishes }),
      setVideoWishes: (wishes) => set({ videoWishes: wishes }),
      setUploadedImage: (image) => set({ uploadedImage: image, generations: [], grokPrompts: [], grokTranslations: [] }),
      setGenerations: (items) => set({ generations: items }),
      updateGeneration: (id, update) =>
        set((state) => ({
          generations: state.generations.map((g) =>
            g.id === id ? { ...g, ...update } : g
          ),
        })),
      setIsGenerating: (v) => set({ isGenerating: v }),
      setShowApiModal: (v) => set({ showApiModal: v }),
      setShowLogs: (v) => set({ showLogs: v }),
      setShowAutoKeyToast: (v) => set({ showAutoKeyToast: v }),
      addLog: (message, level = 'info') => {
        const entry: LogEntry = {
          id: Math.random().toString(36).slice(2, 10),
          timestamp: makeTimestamp(),
          message,
          level,
        }
        const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️'
        console.log(`[${entry.timestamp}] ${prefix} ${message}`)
        set((state) => ({ logs: [...state.logs, entry] }))
      },
      clearLogs: () => set({ logs: [] }),
      setGrokPrompts: (prompts) => set({ grokPrompts: prompts }),
      setGrokTranslations: (translations) => set({ grokTranslations: translations }),
      setAspectRatio: (v) => set({ aspectRatio: v }),
      setResolution: (v) => set({ resolution: v }),
      setIntensity: (v) => set({ intensity: v }),
      setImgToImgModel: (v) => set({ imgToImgModel: v }),
      setZImageStrength: (v) => set({ zImageStrength: v }),
      setSelectedModelsForBatch: (models) => set({ selectedModelsForBatch: models }),
      setShowModelSelector: (show) => set({ showModelSelector: show }),
      setBatchFrameCount: (count) => set({ batchFrameCount: count }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setVisionProvider: (provider) => set({ visionProvider: provider }),
      setPipelineScenes: (scenes) => set({ pipelineScenes: scenes }),
      updatePipelineScene: (scene) =>
        set((state) => ({
          pipelineScenes: state.pipelineScenes.map((s) => (s.id === scene.id ? scene : s)),
        })),
      setPipelineConfig: (config) =>
        set((state) => ({ pipelineConfig: { ...state.pipelineConfig, ...config } })),
      setVoiceResult: (result) => set({ voiceResult: result }),
      setPendingVoiceText: (text) => set({ pendingVoiceText: text }),
      setNewsResearch: (result) => set({ newsResearch: result }),
      setIsResearching: (v) => set({ isResearching: v }),
      clearNewsResearch: () => set({ newsResearch: null }),
      setAwaitingTopicSelection: (v) => set({ awaitingTopicSelection: v }),
      addNewsStepLog: (step, result) => set((state) => {
        if (!state.newsResearch) return state
        return {
          newsResearch: {
            ...state.newsResearch,
            stepLogs: [...state.newsResearch.stepLogs, { 
              step, 
              result, 
              timestamp: new Date().toLocaleTimeString('ru-RU') 
            }]
          }
        }
      }),
      addToVideoQueue: (item) =>
        set((state) => {
          const exists = state.videoQueue.find((q) => q.imageUrl === item.imageUrl)
          if (exists) {
            console.log('[VideoQueue] Item already exists, skipping:', item.id)
            return state
          }
          const urlType = item.imageUrl?.startsWith('data:') ? 'data URL' : item.imageUrl?.startsWith('http') ? 'CloudFront URL' : 'unknown'
          console.log('[VideoQueue] Adding item:', item.id, 'type:', urlType, 'length:', item.imageUrl?.length)
          return { videoQueue: [...state.videoQueue, item] }
        }),
      removeFromVideoQueue: (id) => {
        console.log('[VideoQueue] ⚠️ Attempting to remove item:', id)
        set((state) => {
          console.log('[VideoQueue] Current queue:', state.videoQueue.map((q) => q.id))
          const newQueue = state.videoQueue.filter((q) => q.id !== id)
          const newGenerations = state.videoGenerations.filter((g) => g.queueItemId !== id)
          console.log('[VideoQueue] Before:', state.videoQueue.length, 'After:', newQueue.length)
          console.log('[VideoQueue] New queue IDs:', newQueue.map((q) => q.id))
          
          if (newQueue.length === state.videoQueue.length) {
            console.error('[VideoQueue] ❌ Item not found in queue! ID:', id)
          } else {
            console.log('[VideoQueue] ✅ Item removed successfully')
          }
          
          // Track this ID to prevent auto-re-adding
          const newRemovedIds = new Set(state.removedVideoQueueIds)
          newRemovedIds.add(id)
          console.log('[VideoQueue] Added to removed list:', id)
          
          // If removing the originally uploaded image, also clear uploadedImage
          // to prevent useEffect from re-adding it
          const isUploadedImage = id.startsWith('upload-')
          if (isUploadedImage) {
            console.log('[VideoQueue] Clearing uploadedImage to prevent re-adding')
            return {
              videoQueue: [...newQueue],
              videoGenerations: [...newGenerations],
              removedVideoQueueIds: newRemovedIds,
              uploadedImage: null, // ✅ Clear to prevent re-adding
            }
          }
          
          return {
            videoQueue: [...newQueue],
            videoGenerations: [...newGenerations],
            removedVideoQueueIds: newRemovedIds,
          }
        })
      },
      toggleVideoQueueSelection: (id) =>
        set((state) => ({
          videoQueue: state.videoQueue.map((q) =>
            q.id === id ? { ...q, selected: !q.selected } : q
          ),
        })),
      selectAllVideoQueue: (selected) =>
        set((state) => ({
          videoQueue: state.videoQueue.map((q) => ({ ...q, selected })),
        })),
      setVideoPrompt: (id, prompt) =>
        set((state) => ({
          videoQueue: state.videoQueue.map((q) =>
            q.id === id ? { ...q, videoPrompt: prompt } : q
          ),
        })),
      setVideoPromptRu: (id, promptRu) =>
        set((state) => ({
          videoQueue: state.videoQueue.map((q) =>
            q.id === id ? { ...q, videoPromptRu: promptRu } : q
          ),
        })),
      setVideoNegativePrompt: (id, negativePrompt) =>
        set((state) => ({
          videoQueue: state.videoQueue.map((q) =>
            q.id === id ? { ...q, negativePrompt } : q
          ),
        })),
      setVideoEndImage: (id, endImage) =>
        set((state) => ({
          videoQueue: state.videoQueue.map((q) =>
            q.id === id ? { ...q, endImage } : q
          ),
        })),
      setVideoSettings: (settings) =>
        set((state) => ({
          videoSettings: { ...state.videoSettings, ...settings },
        })),
      setVideoGenerations: (items) => set({ videoGenerations: items }),
      updateVideoGeneration: (id, update) =>
        set((state) => ({
          videoGenerations: state.videoGenerations.map((g) =>
            g.id === id ? { ...g, ...update } : g
          ),
        })),
      clearVideoQueue: () => set({ videoQueue: [], videoGenerations: [] }),
      setWavespeedBalance: (balance) => set({ wavespeedBalance: balance }),
      setIsLoadingBalance: (loading) => set({ isLoadingBalance: loading }),
    }),
    {
      name: 'content-factory-storage',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          try {
            return JSON.parse(str)
          } catch (err) {
            console.error('[Storage] Failed to parse stored data:', err)
            return null
          }
        },
        setItem: (name, value) => {
          try {
            const str = JSON.stringify(value)
            localStorage.setItem(name, str)
            
            // Log storage usage
            const totalSize = str.length
            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2)
            console.log(`[Storage] Saved to localStorage: ${sizeMB} MB`)
          } catch (err) {
            if (err instanceof Error && (err.name === 'QuotaExceededError' || err.message.includes('quota'))) {
              console.error('[Storage] localStorage quota exceeded! Cannot save NSFW references.')
              console.error('[Storage] Try deleting some old references to free up space.')
              alert('⚠️ Превышен лимит хранилища браузера!\n\n' +
                    '💡 Решения:\n' +
                    '1. Удалите старые референсы из категорий\n' +
                    '2. Очистите кэш браузера (Ctrl+Shift+Del)\n' +
                    '3. Загружайте меньше изображений за раз\n\n' +
                    'Изображения сжимаются автоматически, но localStorage имеет лимит ~5-10 MB.')
            } else {
              console.error('[Storage] Failed to save to localStorage:', err)
            }
            throw err
          }
        },
        removeItem: (name) => {
          localStorage.removeItem(name)
        },
      },
      partialize: (state): Partial<ContentStore> => ({
        apiKeys: state.apiKeys,
        masterPrompt: state.masterPrompt,
        frameCount: state.frameCount,
        aspectRatio: state.aspectRatio,
        resolution: state.resolution,
        intensity: state.intensity,
        visionProvider: state.visionProvider,
        pipelineConfig: state.pipelineConfig,
        // Persist scene state for resume, but strip large base64 blobs so we
        // stay within the localStorage quota (remote URLs are kept).
        pipelineScenes: state.pipelineScenes.map((s) => {
          const copy = { ...s }
          delete copy.referenceImage
          delete copy.frame
          return copy
        }),
        nsfwReferences: state.nsfwReferences,
      }),
      onRehydrateStorage: () => {
        console.log('[Storage] Starting rehydration...')
        return (_state, error) => {
          if (error) {
            console.error('[Storage] Rehydration error:', error)
          } else {
            console.log('[Storage] Rehydration complete')
          }
        }
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<ContentStore>
        const c = current as ContentStore
        const merged = { ...c, ...p } as ContentStore
        // If persisted keys are empty/missing, fall back to defaults
        if (!p.apiKeys?.grok || !p.apiKeys?.wavespeed) {
          merged.apiKeys = c.apiKeys
        }
        // Backfill the Gemini key for stores persisted before it existed
        if (merged.apiKeys && merged.apiKeys.gemini === undefined) {
          merged.apiKeys = { ...merged.apiKeys, gemini: c.apiKeys.gemini }
        }
        // Never rehydrate ephemeral UI state from localStorage
        merged.showAutoKeyToast = c.showAutoKeyToast
        merged.showLogs = true
        merged.logs = []
        merged.grokPrompts = []
        merged.grokTranslations = []
        merged.isGenerating = false
        merged.uploadedImage = null
        merged.generations = []
        merged.videoQueue = [] // Always start fresh to avoid broken URLs
        merged.videoGenerations = []
        merged.removedVideoQueueIds = new Set() // Reset removed IDs on app load
        merged.showApiModal = false
        
        // Debug NSFW references
        const nsfwCount = Object.values(merged.nsfwReferences || {}).reduce((sum, refs) => sum + refs.length, 0)
        console.log('[Store] Rehydrated from localStorage, cleared ephemeral state')
        console.log(`[Store] NSFW References loaded: ${nsfwCount} total`, merged.nsfwReferences)
        
        return merged
      },
    }
  )
)
