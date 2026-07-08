import { useEffect, useState } from 'react'
import { Settings, Zap, AlertTriangle, CheckCircle2, Factory, Layers, Terminal, X, KeyRound, ImagePlay, Wallet, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { ApiKeyModal } from '@/components/ApiKeyModal'
import { UploadZone } from '@/components/UploadZone'
import { MasterPromptPanel } from '@/components/MasterPromptPanel'
import { GrokPromptsPanel } from '@/components/GrokPromptsPanel'
import { GenerationGrid } from '@/components/GenerationGrid'
import { LogsPanel } from '@/components/LogsPanel'
import { TabNavigation } from '@/components/TabNavigation'
import { VideoQueuePanel } from '@/components/VideoQueuePanel'
import { VideoSettingsPanel } from '@/components/VideoSettingsPanel'
import { VideoGenerationGrid } from '@/components/VideoGenerationGrid'
import { NewsToPostPanel } from '@/components/NewsToPostPanel'
import { MontagePanel } from '@/components/MontagePanel'
import { VoicePanel } from '@/components/VoicePanel'
import { InfiniteTalkPanel } from '@/components/InfiniteTalkPanel'
import { SubsPanel } from '@/components/SubsPanel'
import { TextToPostPanel } from '@/components/TextToPostPanel'
import { InstToPostPanel } from '@/components/InstToPostPanel'
import { NSFWPanel } from '@/components/NSFWPanel'
import { UpscalePanel } from '@/components/UpscalePanel'
import { BogdanaPipelinePanel } from '@/components/BogdanaPipelinePanel'
import { ModelSelectorModal } from '@/components/ModelSelectorModal'
import { useContentStore } from '@/store/useContentStore'
import type { NewsResearchState } from '@/store/useContentStore'
import { generatePromptsWithGrok, editImageWithWavespeed, editImageWithGPTImage2, editImageWithZImageTurboLora, editImageWithGrokImagineWavespeed, editImageWithSeedream, generateVideoPromptsWithGrok, submitKlingVideoTask, pollKlingResult, getWavespeedBalance, researchNewsWithGrok, fetchTrendingTopics, researchTopicWithGrok, regeneratePostWithGrok, compressPostWithGrok, resizePostBySentencesWithGrok } from '@/lib/api'
import { calculateNanoBananaPrice, formatPrice } from '@/lib/pricing'
import { generateId } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { GenerationItem } from '@/types'

function App() {
  const {
    apiKeys,
    masterPrompt,
    frameCount,
    userWishes,
    videoWishes,
    uploadedImage,
    generations,
    isGenerating,
    showApiModal,
    showLogs,
    showAutoKeyToast,
    logs,
    grokPrompts,
    grokTranslations,
    aspectRatio,
    resolution,
    intensity,
    imgToImgModel,
    zImageStrength,
    activeTab,
    videoQueue,
    videoGenerations,
    videoSettings,
    wavespeedBalance,
    isLoadingBalance,
    selectedModelsForBatch,
    showModelSelector,
    batchFrameCount,
    setApiKeys,
    setMasterPrompt,
    setFrameCount,
    setUserWishes,
    setVideoWishes,
    setUploadedImage,
    setGenerations,
    updateGeneration,
    setIsGenerating,
    setShowApiModal,
    setShowLogs,
    setShowAutoKeyToast,
    addLog,
    clearLogs,
    setGrokPrompts,
    setGrokTranslations,
    setAspectRatio,
    setResolution,
    setIntensity,
    setImgToImgModel,
    setZImageStrength,
    setActiveTab,
    setSelectedModelsForBatch,
    setShowModelSelector,
    setBatchFrameCount,
    addToVideoQueue,
    removeFromVideoQueue,
    setVideoPrompt,
    setVideoPromptRu,
    setVideoNegativePrompt,
    setVideoEndImage,
    setVideoSettings,
    setVideoGenerations,
    updateVideoGeneration,
    selectAllVideoQueue,
    setWavespeedBalance,
    setIsLoadingBalance,
    newsResearch,
    isResearching,
    setNewsResearch,
    setIsResearching,
    addNewsStepLog,
    awaitingTopicSelection,
    setAwaitingTopicSelection,
  } = useContentStore()

  const [promptsReady, setPromptsReady] = useState(false)
  const [videoPromptsReady, setVideoPromptsReady] = useState(false)
  const [showIceShelfDetails, setShowIceShelfDetails] = useState(false)
  const [showDnaDescription, setShowDnaDescription] = useState(false)

  const keysConfigured = apiKeys.grok.length > 0 && apiKeys.wavespeed.length > 0

  useEffect(() => {
    if (!keysConfigured) {
      setShowApiModal(true)
    }
  }, [])

  useEffect(() => {
    if (showAutoKeyToast) {
      const t = setTimeout(() => setShowAutoKeyToast(false), 5000)
      return () => clearTimeout(t)
    }
  }, [showAutoKeyToast])

  // Reset prompts-ready state when image changes
  useEffect(() => {
    setPromptsReady(false)
  }, [uploadedImage])

  // Handle batch generation trigger from ModelSelectorModal
  useEffect(() => {
    const handleBatchGenerate = () => {
      handleGenerateAllModels()
    }
    window.addEventListener('batch-generate-start', handleBatchGenerate)
    return () => window.removeEventListener('batch-generate-start', handleBatchGenerate)
  }, [uploadedImage, keysConfigured, isGenerating, selectedModelsForBatch, batchFrameCount])

  // Auto-add uploaded image to video queue (avoid duplicates)
  useEffect(() => {
    if (uploadedImage) {
      const uploadId = `upload-${uploadedImage.file.name}-${uploadedImage.file.size}`
      const alreadyInQueue = videoQueue.some(q => q.id === uploadId)
      const removedIds = useContentStore.getState().removedVideoQueueIds
      const wasManuallyRemoved = removedIds.has(uploadId)
      
      if (!alreadyInQueue && !wasManuallyRemoved) {
        addToVideoQueue({
          id: uploadId,
          imageUrl: uploadedImage.base64, // Use base64 for Grok compatibility
          sourcePrompt: 'Uploaded source image',
          selected: false,
        })
      } else if (wasManuallyRemoved) {
        console.log('[App] Skipping auto-add for manually removed uploaded image:', uploadId)
      }
    }
  }, [uploadedImage, addToVideoQueue, videoQueue])

  // Auto-add successful images to video queue (avoid duplicates)
  useEffect(() => {
    const removedIds = useContentStore.getState().removedVideoQueueIds
    
    generations.forEach((gen) => {
      if (gen.status === 'success' && gen.imageUrl && gen.prompt) {
        // Check if already in queue OR manually removed
        const alreadyInQueue = videoQueue.some(q => q.id === gen.id)
        const wasManuallyRemoved = removedIds.has(gen.id)
        
        if (!alreadyInQueue && !wasManuallyRemoved) {
          addToVideoQueue({
            id: gen.id,
            imageUrl: gen.imageUrl,
            sourcePrompt: gen.prompt,
            selected: false,
          })
        } else if (wasManuallyRemoved) {
          console.log('[App] Skipping auto-add for manually removed item:', gen.id)
        }
      }
    })
  }, [generations, addToVideoQueue, videoQueue])

  async function handleGenerateAllModels() {
    if (!uploadedImage || !keysConfigured || isGenerating) return
    if (selectedModelsForBatch.length === 0) {
      addLog('❌ Выберите хотя бы одну модель', 'error')
      return
    }

    setIsGenerating(true)
    setPromptsReady(false)
    clearLogs()
    setGrokPrompts([])
    setGrokTranslations([])

    const allModelsMap: Record<string, string> = {
      'nano-banana-2': 'Nano Banana 2',
      'gpt-image-2': 'GPT Image 2',
      'z-image-turbo-lora': 'Z-Image Turbo LoRA',
      'grok-imagine': 'Grok Imagine',
      'seedream-v4.5': 'Seedream v4.5',
    }

    const selectedModels = selectedModelsForBatch.map(id => ({
      id,
      name: allModelsMap[id] || id
    }))

    addLog(`🚀 Запуск ${selectedModels.length} модел${selectedModels.length === 1 ? 'и' : selectedModels.length < 5 ? 'ей' : 'ей'} × ${batchFrameCount} кадр${batchFrameCount === 1 ? '' : batchFrameCount < 5 ? 'а' : 'ов'}`)
    addLog(`Изображение: ${uploadedImage.file.name}`)

    // Create placeholders for all model-frame combinations
    const placeholders: GenerationItem[] = []
    for (const model of selectedModels) {
      for (let i = 0; i < batchFrameCount; i++) {
        placeholders.push({
          id: generateId(),
          prompt: '',
          status: 'pending',
          modelName: `${model.name}${batchFrameCount > 1 ? ` #${i + 1}` : ''}`,
        })
      }
    }
    setGenerations(placeholders)

    try {
      // Generate prompts for all models in ONE request
      addLog(`📝 Генерация промптов для ${selectedModels.length} модел${selectedModels.length === 1 ? 'и' : 'ей'} × ${batchFrameCount} кадр${batchFrameCount === 1 ? '' : batchFrameCount < 5 ? 'а' : 'ов'}...`)
      
      const totalFrames = selectedModels.length * batchFrameCount
      const modelsList = selectedModels.map(m => m.name).join(', ')
      
      // Single batch request to Grok for all models
      const batchPrompts = await generatePromptsWithGrok(
        apiKeys.grok,
        uploadedImage.base64,
        `${masterPrompt}\n\nGenerate ${batchFrameCount} prompt${batchFrameCount === 1 ? '' : 's'} for EACH of these models: ${modelsList}. Label each prompt with model name.`,
        totalFrames,
        userWishes,
        addLog,
        (accumulated: string[]) => {
          // Update UI with accumulated prompts
          setGrokPrompts(accumulated)
        },
        () => {},
        intensity,
        `Batch: ${modelsList}`
      )

      // Parse and organize prompts by model
      const allPrompts: Array<{ modelId: string; modelName: string; prompt: string }> = []
      
      // Distribute prompts to models (each model gets batchFrameCount prompts)
      for (let modelIdx = 0; modelIdx < selectedModels.length; modelIdx++) {
        const model = selectedModels[modelIdx]
        for (let frameIdx = 0; frameIdx < batchFrameCount; frameIdx++) {
          const promptIdx = modelIdx * batchFrameCount + frameIdx
          allPrompts.push({
            modelId: model.id,
            modelName: model.name,
            prompt: batchPrompts[promptIdx] || batchPrompts[0]
          })
        }
      }

      addLog(`✅ ${totalFrames} промпт${totalFrames === 1 ? '' : totalFrames < 5 ? 'а' : 'ов'} готов${totalFrames === 1 ? '' : 'о'}! Запуск генерации...`, 'success')

      // Generate images for all model-frame combinations in parallel
      await Promise.all(
        placeholders.map(async (item, i) => {
          const promptData = allPrompts[i]
          if (!promptData) return

          try {
            updateGeneration(item.id, { prompt: promptData.prompt, status: 'generating' })
            addLog(`🎨 ${promptData.modelName}: генерация...`, 'info')

            let result: { imageUrl: string }

            if (promptData.modelId === 'z-image-turbo-lora') {
              result = await editImageWithZImageTurboLora(
                apiKeys.wavespeed,
                uploadedImage.dataUrl,
                promptData.prompt,
                resolution,
                aspectRatio,
                zImageStrength,
                addLog
              )
            } else if (promptData.modelId === 'seedream-v4.5') {
              const sizeMap: Record<string, { width: number; height: number }> = {
                '1:1': { width: 1024, height: 1024 },
                '3:4': { width: 768, height: 1024 },
                '9:16': { width: 576, height: 1024 },
                '16:9': { width: 1024, height: 576 },
              }
              const { width, height } = sizeMap[aspectRatio] || { width: 1024, height: 1024 }
              result = await editImageWithSeedream(
                apiKeys.wavespeed,
                [uploadedImage.dataUrl],
                promptData.prompt,
                width,
                height,
                addLog
              )
            } else if (promptData.modelId === 'grok-imagine') {
              result = await editImageWithGrokImagineWavespeed(
                apiKeys.wavespeed,
                uploadedImage.dataUrl,
                promptData.prompt,
                resolution,
                aspectRatio,
                addLog
              )
            } else if (promptData.modelId === 'gpt-image-2') {
              result = await editImageWithGPTImage2(
                apiKeys.wavespeed,
                [uploadedImage.dataUrl],
                promptData.prompt,
                resolution,
                aspectRatio,
                addLog
              )
            } else {
              result = await editImageWithWavespeed(
                apiKeys.wavespeed,
                uploadedImage.base64,
                promptData.prompt,
                i,
                addLog,
                { resolution, aspectRatio, intensity }
              )
            }

            updateGeneration(item.id, { status: 'success', imageUrl: result.imageUrl })
            addLog(`✅ ${promptData.modelName}: готово!`, 'success')
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : `Ошибка ${promptData.modelName}`
            updateGeneration(item.id, { status: 'error', error: errorMsg })
            addLog(`❌ ${promptData.modelName}: ${errorMsg}`, 'error')
          }
        })
      )

      addLog(`🎉 Генерация завершена для всех моделей!`, 'success')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка генерации'
      addLog(`Ошибка: ${errorMsg}`, 'error')
    }

    setIsGenerating(false)
  }

  async function handleGeneratePrompts() {
    if (!uploadedImage || !keysConfigured || isGenerating) return

    setIsGenerating(true)
    setPromptsReady(false)
    clearLogs()
    setGrokPrompts([])
    setGrokTranslations([])

    addLog(`Генерация промптов — ${frameCount} кадр(ов)`)
    addLog(`Изображение: ${uploadedImage.file.name}`)

    const placeholders: GenerationItem[] = Array.from({ length: frameCount }, (_) => ({
      id: generateId(),
      prompt: '',
      status: 'pending',
    }))
    setGenerations(placeholders)

    try {
      const modelDisplayName = imgToImgModel === 'z-image-turbo-lora' 
        ? 'Z-Image Turbo LoRA' 
        : imgToImgModel === 'gpt-image-2' 
        ? 'GPT Image 2'
        : imgToImgModel === 'grok-imagine'
        ? 'Grok Imagine'
        : imgToImgModel === 'seedream-v4.5'
        ? 'Seedream v4.5'
        : 'Nano Banana 2 Edit'
      
      await generatePromptsWithGrok(
        apiKeys.grok,
        uploadedImage.base64,
        masterPrompt,
        frameCount,
        userWishes,
        addLog,
        (accumulated) => setGrokPrompts(accumulated),
        (accumulated) => setGrokTranslations(accumulated),
        intensity,
        modelDisplayName
      )
      addLog(`Промпты от Grok готовы. Нажмите «Сгенерировать изображения».`, 'success')
      setPromptsReady(true)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка запроса к Grok'
      addLog(`Ошибка Grok: ${errorMsg}`, 'error')
      const failed = placeholders.map((g) => ({
        ...g,
        status: 'error' as const,
        error: `Grok: ${errorMsg}`,
      }))
      setGenerations(failed)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGenerateImages() {
    if (!uploadedImage || !keysConfigured || isGenerating || grokPrompts.length === 0) return

    setIsGenerating(true)
    setPromptsReady(false)

    addLog(`Запуск ${grokPrompts.length} задач Wavespeed параллельно...`)

    const withPrompts: GenerationItem[] = generations.map((g, i) => ({
      ...g,
      prompt: grokPrompts[i] ?? '',
      status: 'loading' as const,
    }))
    setGenerations(withPrompts)

    await Promise.all(
      withPrompts.map(async (item, i) => {
        try {
          let result: { imageUrl: string }
          if (imgToImgModel === 'z-image-turbo-lora') {
            result = await editImageWithZImageTurboLora(
              apiKeys.wavespeed,
              uploadedImage.dataUrl,
              item.prompt,
              resolution,
              aspectRatio,
              zImageStrength,
              addLog
            )
          } else if (imgToImgModel === 'seedream-v4.5') {
            // Convert aspect ratio to width/height
            const sizeMap: Record<string, { width: number; height: number }> = {
              '1:1': { width: 1024, height: 1024 },
              '3:4': { width: 768, height: 1024 },
              '9:16': { width: 576, height: 1024 },
              '16:9': { width: 1024, height: 576 },
            }
            const { width, height } = sizeMap[aspectRatio] || { width: 1024, height: 1024 }
            result = await editImageWithSeedream(
              apiKeys.wavespeed,
              [uploadedImage.dataUrl],
              item.prompt,
              width,
              height,
              addLog
            )
          } else if (imgToImgModel === 'grok-imagine') {
            result = await editImageWithGrokImagineWavespeed(
              apiKeys.wavespeed,
              uploadedImage.dataUrl,
              item.prompt,
              resolution,
              aspectRatio,
              addLog
            )
          } else if (imgToImgModel === 'gpt-image-2') {
            result = await editImageWithGPTImage2(
              apiKeys.wavespeed,
              [uploadedImage.dataUrl],
              item.prompt,
              resolution,
              aspectRatio,
              addLog
            )
          } else {
            result = await editImageWithWavespeed(
              apiKeys.wavespeed,
              uploadedImage.base64,
              item.prompt,
              i,
              addLog,
              { resolution, aspectRatio, intensity }
            )
          }
          updateGeneration(item.id, { status: 'success', imageUrl: result.imageUrl })
        } catch (err) {
          const modelName = imgToImgModel === 'z-image-turbo-lora' ? 'Z-Image Turbo LoRA' : imgToImgModel === 'gpt-image-2' ? 'GPT Image 2' : imgToImgModel === 'grok-imagine' ? 'Grok Imagine' : imgToImgModel === 'seedream-v4.5' ? 'Seedream v4.5' : 'Nano Banana 2'
          const errorMsg = err instanceof Error ? err.message : `Ошибка ${modelName}`
          updateGeneration(item.id, { status: 'error', error: `Кадр ${i + 1}: ${errorMsg}` })
        }
      })
    )

    addLog(`Генерация изображений завершена`, 'success')
    setIsGenerating(false)
  }

  const canGenerate = !!uploadedImage && keysConfigured && !isGenerating && !promptsReady

  // Manual balance refresh
  async function refreshBalance() {
    if (!apiKeys.wavespeed || isLoadingBalance) return
    setIsLoadingBalance(true)
    const result = await getWavespeedBalance(apiKeys.wavespeed, addLog)
    if (result) {
      setWavespeedBalance(result.balance)
    }
    setIsLoadingBalance(false)
  }

  // Load Wavespeed balance on mount and when keys change
  useEffect(() => {
    let ignored = false
    async function loadBalance() {
      if (!apiKeys.wavespeed) return
      setIsLoadingBalance(true)
      // Silent load without logging to avoid duplicate logs
      const result = await getWavespeedBalance(apiKeys.wavespeed)
      if (!ignored) {
        if (result) setWavespeedBalance(result.balance)
        setIsLoadingBalance(false)
      }
    }
    loadBalance()
    return () => { ignored = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeys.wavespeed])

  // Refresh balance after generations complete
  useEffect(() => {
    if (!isGenerating && apiKeys.wavespeed && generations.some(g => g.status === 'success')) {
      getWavespeedBalance(apiKeys.wavespeed).then(result => {
        if (result) setWavespeedBalance(result.balance)
      })
    }
  }, [isGenerating, generations, apiKeys.wavespeed, setWavespeedBalance])

  // Auto-start image generation after Grok prompts are ready
  useEffect(() => {
    // Only trigger if prompts just became available and we're on variations tab
    if (
      grokPrompts.length > 0 &&
      !isGenerating &&
      uploadedImage &&
      keysConfigured &&
      activeTab === 'variations' &&
      generations.length === grokPrompts.length &&
      generations.every(g => g.status === 'pending')
    ) {
      // Auto-trigger generation after short delay
      const timer = setTimeout(() => {
        handleGenerateImages()
      }, 800)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grokPrompts.length, isGenerating, uploadedImage, keysConfigured, activeTab, generations.length])

  async function handleGenerateVideoPrompts() {
    if (!keysConfigured || isGenerating) return

    const selected = videoQueue.filter((q) => q.selected)
    if (selected.length === 0) {
      addLog('Выберите изображения для генерации видео', 'error')
      return
    }

    setIsGenerating(true)
    setVideoPromptsReady(false)

    addLog(`Генерация видео промптов для ${selected.length} изображени${selected.length === 1 ? 'я' : 'й'}...`)

    try {
      await generateVideoPromptsWithGrok(
        apiKeys.grok,
        selected.map((q) => ({
          id: q.id,
          imageUrl: q.imageUrl,
          sourcePrompt: q.sourcePrompt,
        })),
        videoWishes,
        addLog,
        (id, prompt, promptRu, negativePrompt) => {
          setVideoPrompt(id, prompt)
          setVideoPromptRu(id, promptRu)
          setVideoNegativePrompt(id, negativePrompt)
        }
      )
      addLog('Все видео промпты готовы! Запуск генерации видео...', 'success')
      setVideoPromptsReady(true)
      
      // Automatically start video generation (keep isGenerating=true)
      // Get fresh state from store after prompts were set
      const currentQueue = useContentStore.getState().videoQueue
      const selectedWithPrompts = currentQueue.filter((q) => q.selected && q.videoPrompt)
      
      console.log('[Video Generation] Selected items:', selectedWithPrompts.length, '/', currentQueue.filter(q => q.selected).length)
      selectedWithPrompts.forEach((item, idx) => {
        console.log(`  [${idx + 1}] id:${item.id}, prompt:${item.videoPrompt?.substring(0, 50)}...`)
      })
      
      if (selectedWithPrompts.length === 0) {
        addLog('Нет изображений с готовыми промптами', 'error')
        setIsGenerating(false)
        return
      }

      const { duration, aspectRatio, withSound, videosPerPrompt } = videoSettings
      const totalVideos = selectedWithPrompts.length * videosPerPrompt
      const pricePerVideo = (duration * 0.112 * (withSound ? 1.5 : 1))

      addLog(`Запуск ${totalVideos} видео зада${totalVideos === 1 ? 'чи' : 'ч'}...`)

      // Create placeholders
      const allTasks: Array<{ id: string; queueItemId: string; imageUrl: string; videoPrompt: string; negativePrompt?: string; endImage?: string }> = []
      selectedWithPrompts.forEach((item) => {
        for (let i = 0; i < videosPerPrompt; i++) {
          allTasks.push({
            id: generateId(),
            queueItemId: item.id,
            imageUrl: item.imageUrl,
            videoPrompt: item.videoPrompt!,
            negativePrompt: item.negativePrompt,
            endImage: item.endImage,
          })
        }
      })

      const placeholders = allTasks.map((task) => ({
        id: task.id,
        queueItemId: task.queueItemId,
        imageUrl: task.imageUrl,
        videoPrompt: task.videoPrompt,
        negativePrompt: task.negativePrompt,
        status: 'pending' as const,
        duration,
        withSound,
        cost: pricePerVideo,
      }))
      setVideoGenerations(placeholders)

      // Submit all tasks in parallel
      await Promise.all(
        allTasks.map(async (task) => {
          try {
            updateVideoGeneration(task.id, { status: 'processing' })

            const { requestId } = await submitKlingVideoTask(
              apiKeys.wavespeed,
              task.imageUrl,
              task.videoPrompt,
              { duration, aspectRatio, withSound, negativePrompt: task.negativePrompt, endImage: task.endImage },
              addLog
            )

            updateVideoGeneration(task.id, { requestId })

            // Poll for result
            const result = await pollKlingResult(apiKeys.wavespeed, requestId, addLog)

            if (result.status === 'completed' && result.videoUrl) {
              updateVideoGeneration(task.id, {
                status: 'completed',
                videoUrl: result.videoUrl,
                posterUrl: result.posterUrl,
              })
              addLog(`Видео готово!`, 'success')
            } else {
              updateVideoGeneration(task.id, {
                status: 'failed',
                error: result.error ?? 'Неизвестная ошибка',
              })
              addLog(`Видео не создано: ${result.error}`, 'error')
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Ошибка генерации видео'
            updateVideoGeneration(task.id, { status: 'failed', error: errorMsg })
            addLog(`Ошибка: ${errorMsg}`, 'error')
          }
        })
      )

      addLog('Генерация видео завершена', 'success')
      setIsGenerating(false)
      return
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка генерации видео промптов'
      addLog(`Ошибка: ${errorMsg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleRegenerateVideoPrompt(itemId: string) {
    if (!keysConfigured || isGenerating) return

    const item = videoQueue.find((q) => q.id === itemId)
    if (!item) return

    setIsGenerating(true)
    addLog(`Перегенерация промпта...`)

    try {
      await generateVideoPromptsWithGrok(
        apiKeys.grok,
        [{ id: item.id, imageUrl: item.imageUrl, sourcePrompt: item.sourcePrompt }],
        videoWishes,
        addLog,
        (id, prompt, promptRu, negativePrompt) => {
          setVideoPrompt(id, prompt)
          setVideoPromptRu(id, promptRu)
          setVideoNegativePrompt(id, negativePrompt)
        }
      )
      addLog('Промпт обновлён!', 'success')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка перегенерации'
      addLog(`Ошибка: ${errorMsg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGenerateVideos() {
    if (!keysConfigured || isGenerating) return

    const selected = videoQueue.filter((q) => q.selected && q.videoPrompt)
    if (selected.length === 0) {
      addLog('Нет изображений с готовыми промптами', 'error')
      return
    }

    setIsGenerating(true)
    setVideoPromptsReady(false)

    const { duration, aspectRatio, withSound, videosPerPrompt } = videoSettings
    const totalVideos = selected.length * videosPerPrompt
    const pricePerVideo = (duration * 0.112 * (withSound ? 1.5 : 1))

    addLog(`Запуск ${totalVideos} видео зада${totalVideos === 1 ? 'чи' : 'ч'}...`)

    // Create placeholders
    const allTasks: Array<{ id: string; queueItemId: string; imageUrl: string; videoPrompt: string; negativePrompt?: string; endImage?: string }> = []
    selected.forEach((item) => {
      for (let i = 0; i < videosPerPrompt; i++) {
        allTasks.push({
          id: generateId(),
          queueItemId: item.id,
          imageUrl: item.imageUrl,
          videoPrompt: item.videoPrompt!,
          negativePrompt: item.negativePrompt,
          endImage: item.endImage,
        })
      }
    })

    const placeholders = allTasks.map((task) => ({
      id: task.id,
      queueItemId: task.queueItemId,
      imageUrl: task.imageUrl,
      videoPrompt: task.videoPrompt,
      negativePrompt: task.negativePrompt,
      status: 'pending' as const,
      duration,
      withSound,
      cost: pricePerVideo,
    }))
    setVideoGenerations(placeholders)

    // Submit all tasks in parallel
    await Promise.all(
      allTasks.map(async (task, index) => {
        try {
          updateVideoGeneration(task.id, { status: 'processing' })

          const { requestId } = await submitKlingVideoTask(
            apiKeys.wavespeed,
            task.imageUrl,
            task.videoPrompt,
            { duration, aspectRatio, withSound, negativePrompt: task.negativePrompt, endImage: task.endImage },
            addLog
          )

          updateVideoGeneration(task.id, { requestId })

          // Poll for result
          const result = await pollKlingResult(apiKeys.wavespeed, requestId, addLog)

          if (result.status === 'completed' && result.videoUrl) {
            updateVideoGeneration(task.id, {
              status: 'completed',
              videoUrl: result.videoUrl,
              posterUrl: result.posterUrl,
            })
          } else {
            updateVideoGeneration(task.id, {
              status: 'failed',
              error: result.error ?? 'Неизвестная ошибка',
            })
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Ошибка Kling'
          updateVideoGeneration(task.id, { status: 'failed', error: `Видео ${index + 1}: ${errorMsg}` })
        }
      })
    )

    addLog('Генерация видео завершена', 'success')
    setIsGenerating(false)
  }

  const EMPTY_RESEARCH_STATE = (postDuration: number) => ({
    trending: [] as NewsResearchState['trending'],
    selectedTopic: { title: '', engagement: 'medium' as const, polarization: '', summary: '' },
    newsDetails: '',
    translationRu: '',
    sources: [] as string[],
    postText: '',
    postTranslationRu: '',
    hashtags: [] as string[],
    researchedAt: '',
    stepLogs: [] as NewsResearchState['stepLogs'],
    postDuration,
    xPosts: [] as NewsResearchState['xPosts'],
    currentStep: '',
  })

  async function handleFetchTrends() {
    if (!apiKeys.grok || isResearching || awaitingTopicSelection) return
    setIsResearching(true)
    setAwaitingTopicSelection(false)
    addLog('🔍 Ищу горячие тренды в X...', 'info')
    const postDuration = newsResearch?.postDuration ?? 30
    setNewsResearch(EMPTY_RESEARCH_STATE(postDuration))
    try {
      const trending = await fetchTrendingTopics(apiKeys.grok, addLog)
      useContentStore.getState().setNewsResearch({
        ...useContentStore.getState().newsResearch!,
        trending,
      })
      setAwaitingTopicSelection(true)
      addLog(`✅ Найдено ${trending.length} тем. Выберите одну!`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка поиска трендов'
      addLog(`❌ ${msg}`, 'error')
    } finally {
      setIsResearching(false)
    }
  }

  async function handleSelectTopic(topic: NewsResearchState['selectedTopic']) {
    if (!apiKeys.grok || isResearching) return
    setAwaitingTopicSelection(false)
    setIsResearching(true)
    addLog(`🎯 Тема выбрана: "${topic.title}"`, 'info')
    const postDuration = newsResearch?.postDuration ?? 30
    const trending = newsResearch?.trending ?? []
    const mergeProgress = (update: Partial<NewsResearchState>) => {
      useContentStore.getState().setNewsResearch({
        ...useContentStore.getState().newsResearch!,
        ...update,
      })
    }
    try {
      const result = await researchTopicWithGrok(
        apiKeys.grok,
        trending,
        topic,
        postDuration,
        addLog,
        addNewsStepLog,
        mergeProgress
      )
      setNewsResearch(result)
      addLog('✅ Ресерч завершён!', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка ресерча'
      addLog(`❌ ${msg}`, 'error')
    } finally {
      setIsResearching(false)
    }
  }

  async function handleRegeneratePost(emotion?: string) {
    if (!apiKeys.grok || isResearching || !newsResearch) return
    setIsResearching(true)
    try {
      const result = await regeneratePostWithGrok(
        apiKeys.grok,
        newsResearch.selectedTopic,
        newsResearch.newsDetails,
        addLog,
        emotion
      )
      setNewsResearch({
        ...newsResearch,
        postText: result.postText,
        hashtags: result.hashtags,
        postTranslationRu: result.postTranslationRu,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка перегенерации'
      addLog(`❌ ${msg}`, 'error')
    } finally {
      setIsResearching(false)
    }
  }

  async function handleResizeBySentences(targetSentences: number) {
    if (!apiKeys.grok || isResearching || !newsResearch?.postText) return
    setIsResearching(true)
    try {
      const result = await resizePostBySentencesWithGrok(
        apiKeys.grok,
        newsResearch.postText,
        targetSentences,
        addLog
      )
      setNewsResearch({
        ...newsResearch,
        postText: result.postText,
        postTranslationRu: result.postTranslationRu,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка изменения'
      addLog(`❌ ${msg}`, 'error')
    } finally {
      setIsResearching(false)
    }
  }

  async function handleCompressPost(targetPercent: number) {
    if (!apiKeys.grok || isResearching || !newsResearch?.postText) return
    setIsResearching(true)
    try {
      const result = await compressPostWithGrok(
        apiKeys.grok,
        newsResearch.postText,
        targetPercent,
        addLog
      )
      setNewsResearch({
        ...newsResearch,
        postText: result.postText,
        postTranslationRu: result.postTranslationRu,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка сокращения'
      addLog(`❌ ${msg}`, 'error')
    } finally {
      setIsResearching(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Factory className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">Content Factory</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {keysConfigured ? (
              <Badge variant="success" className="hidden sm:flex gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Ключи настроены ✓
              </Badge>
            ) : (
              <Badge
                variant="warning"
                className="hidden sm:flex gap-1 cursor-pointer"
                onClick={() => setShowApiModal(true)}
              >
                <AlertTriangle className="h-3 w-3" />
                Настроить ключи
              </Badge>
            )}
            {keysConfigured && (
              <button
                onClick={refreshBalance}
                disabled={isLoadingBalance}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 border border-border hover:bg-secondary transition-colors"
                title="Обновить баланс"
              >
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">
                  {isLoadingBalance ? (
                    <span className="text-muted-foreground">...</span>
                  ) : wavespeedBalance !== null ? (
                    <span>${wavespeedBalance.toFixed(2)}</span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </span>
                <RefreshCw className={cn(
                  "h-3 w-3 text-muted-foreground/60 transition-transform",
                  isLoadingBalance && "animate-spin"
                )} />
              </button>
            )}
            <div className="flex items-center gap-2 px-3 h-8 rounded-lg border border-primary/20 bg-primary/5 text-xs font-medium">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">Grok:</span>
              <span className="font-bold text-primary">4.20-reasoning</span>
            </div>
            <Button
              variant={showLogs ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              className={cn(
                'h-8 gap-1.5 text-xs border-border',
                showLogs && 'border-primary/40'
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Логи</span>
              {logs.length > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  isGenerating ? 'bg-primary text-primary-foreground animate-pulse' : 'bg-secondary text-muted-foreground'
                )}>
                  {logs.length}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowApiModal(true)}
              className="h-8 w-8 border-border"
              title="Настройки API-ключей"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <TabNavigation />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
            {activeTab === 'bogdana' && <BogdanaPipelinePanel />}
            {activeTab === 'variations' && (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-primary" />
                    <h1 className="text-lg font-semibold text-foreground">Image-to-Image</h1>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Генерация вариаций изображений с помощью Grok Vision + {imgToImgModel === 'nano-banana-2' ? 'Nano Banana 2' : imgToImgModel === 'gpt-image-2' ? 'GPT Image 2' : imgToImgModel === 'z-image-turbo-lora' ? 'Z-Image Turbo LoRA' : imgToImgModel === 'grok-imagine' ? 'Grok Imagine' : 'Seedream v4.5'}
                  </p>
                </div>

            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
              <div className="space-y-4">
                <UploadZone />

                {/* User Wishes */}
                {uploadedImage && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Пожелания к промптам
                    </label>
                    <textarea
                      value={userWishes}
                      onChange={(e) => setUserWishes(e.target.value)}
                      placeholder="Например: снимает селфи в зеркало, держит кофе, танцует..."
                      className="w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      Grok учтёт ваши пожелания при генерации промптов
                    </p>
                  </div>
                )}

                {/* Model Selector */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <label className="text-sm font-medium text-foreground">Модель генерации</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setImgToImgModel('nano-banana-2')}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        imgToImgModel === 'nano-banana-2'
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      )}
                    >
                      <div className="text-[11px] font-semibold text-foreground leading-tight">Nano Banana 2</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">Google</div>
                    </button>
                    <button
                      onClick={() => setImgToImgModel('gpt-image-2')}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        imgToImgModel === 'gpt-image-2'
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      )}
                    >
                      <div className="text-[11px] font-semibold text-foreground leading-tight">GPT Image 2</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">OpenAI</div>
                    </button>
                    <button
                      onClick={() => setImgToImgModel('z-image-turbo-lora')}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        imgToImgModel === 'z-image-turbo-lora'
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      )}
                    >
                      <div className="text-[11px] font-semibold text-foreground leading-tight">Z-Image Turbo</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">с LoRA</div>
                    </button>
                    <button
                      onClick={() => setImgToImgModel('grok-imagine')}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        imgToImgModel === 'grok-imagine'
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      )}
                    >
                      <div className="text-[11px] font-semibold text-foreground leading-tight">Grok Imagine</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">xAI</div>
                    </button>
                    <button
                      onClick={() => setImgToImgModel('seedream-v4.5')}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        imgToImgModel === 'seedream-v4.5'
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/30 hover:border-border/80'
                      )}
                    >
                      <div className="text-[11px] font-semibold text-foreground leading-tight">Seedream v4.5</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">ByteDance</div>
                    </button>
                  </div>
                </div>

                {/* DNA Reference Preview */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-primary">DNA Reference</span>
                    <div className="h-1 w-1 rounded-full bg-primary/40"></div>
                    <span className="text-[10px] text-primary/60">автоматически</span>
                  </div>
                  <div className="relative w-full rounded-lg overflow-hidden border border-primary/30">
                    <img
                      src="/dna-reference.jpg"
                      alt="DNA Reference"
                      className="w-full h-auto object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.parentElement!.innerHTML = '<div class="w-full h-24 bg-secondary flex items-center justify-center"><svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></div>'
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Это изображение будет отправляться вместе с вашим фото для сохранения черт лица модели
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Количество кадров</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={frameCount}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(12, parseInt(e.target.value) || 1))
                        setFrameCount(v)
                      }}
                      className="w-14 h-8 rounded-md border border-input bg-input text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <Slider
                    min={1}
                    max={12}
                    step={1}
                    value={[frameCount]}
                    onValueChange={([v]) => setFrameCount(v)}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>12</span>
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <label className="text-sm font-medium text-foreground">Соотношение сторон</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['1:1', '3:4', '9:16', '16:9'] as const).map((ar) => (
                      <button
                        key={ar}
                        onClick={() => setAspectRatio(ar)}
                        className={cn(
                          'rounded-lg border py-1.5 text-xs font-medium transition-colors',
                          aspectRatio === ar
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground'
                        )}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <label className="text-sm font-medium text-foreground">Разрешение</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['0.5k', '1k', '2k', '4k'] as const).map((res) => (
                      <button
                        key={res}
                        onClick={() => setResolution(res)}
                        className={cn(
                          'rounded-lg border py-1.5 text-xs font-medium transition-colors',
                          resolution === res
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground'
                        )}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intensity */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Интенсивность</label>
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      intensity <= 25 ? 'bg-emerald-500/10 text-emerald-400' :
                      intensity <= 50 ? 'bg-blue-500/10 text-blue-400' :
                      intensity <= 75 ? 'bg-orange-500/10 text-orange-400' :
                      'bg-red-500/10 text-red-400'
                    )}>
                      {intensity <= 25 ? 'Минимум' : intensity <= 50 ? 'Умеренно' : intensity <= 75 ? 'Сильно' : 'Максимум'} · {intensity}
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={100}
                    step={1}
                    value={[intensity]}
                    onValueChange={([v]) => setIntensity(v)}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>Минимум</span>
                    <span>Максимум</span>
                  </div>
                </div>

                {/* Z-Image Turbo LoRA Strength */}
                {imgToImgModel === 'z-image-turbo-lora' && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label 
                        className="text-sm font-medium text-foreground flex items-center gap-1.5 cursor-help"
                        title="Степень трансформации изображения: 0.0-0.3 — минимальные изменения, улучшение качества; 0.4-0.6 — умеренная трансформация (рекомендуется); 0.7-0.9 — сильная трансформация; 1.0 — максимальная трансформация, LoRA доминирует"
                      >
                        Strength (LoRA)
                        <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </label>
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        zImageStrength <= 0.3 ? 'bg-emerald-500/10 text-emerald-400' :
                        zImageStrength <= 0.6 ? 'bg-blue-500/10 text-blue-400' :
                        zImageStrength <= 0.9 ? 'bg-orange-500/10 text-orange-400' :
                        'bg-red-500/10 text-red-400'
                      )}>
                        {zImageStrength <= 0.3 ? 'Минимум' : zImageStrength <= 0.6 ? 'Умеренно' : zImageStrength <= 0.9 ? 'Сильно' : 'Максимум'} · {zImageStrength.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[zImageStrength]}
                      onValueChange={([v]) => setZImageStrength(v)}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/60">
                      <span>Улучшение</span>
                      <span>Трансформация</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      Контролирует степень изменения изображения. Низкие значения (0.0-0.3) сохраняют оригинал с улучшением качества. Средние (0.4-0.6) дают умеренную трансформацию. Высокие (0.7-1.0) — сильные изменения с доминированием LoRA стиля.
                    </p>
                  </div>
                )}

                {/* Pricing Display */}
                {uploadedImage && (
                  <div className="rounded-xl border border-border/50 bg-card/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Стоимость:</span>
                      <span className="text-sm font-semibold text-primary">
                        {formatPrice(calculateNanoBananaPrice(resolution, aspectRatio) * frameCount)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {frameCount} кадр{frameCount === 1 ? '' : frameCount < 5 ? 'а' : 'ов'} × {formatPrice(calculateNanoBananaPrice(resolution, aspectRatio))}
                    </p>
                  </div>
                )}

                {/* Select Models for Batch Generation Button */}
                {uploadedImage && (
                  <Button
                    onClick={() => setShowModelSelector(true)}
                    disabled={!canGenerate || isGenerating}
                    className="w-full h-11 text-sm font-semibold gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25"
                    size="lg"
                  >
                    <Layers className="h-4 w-4" />
                    Выбрать модели для параллельной генерации
                  </Button>
                )}

                {promptsReady ? (
                  <Button
                    onClick={handleGenerateImages}
                    disabled={isGenerating}
                    className="w-full h-12 text-base font-semibold gap-2 bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Генерирую изображения...
                      </>
                    ) : (
                      <>
                        <ImagePlay className="h-5 w-5" />
                        Сгенерировать изображения
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleGeneratePrompts}
                    disabled={!canGenerate}
                    className="w-full h-11 text-base font-semibold gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                        Генерирую промпты...
                      </>
                    ) : (
                      <>
                        <Zap className="h-5 w-5" />
                        Генерировать
                      </>
                    )}
                  </Button>
                )}

                {!keysConfigured && (
                  <button
                    onClick={() => setShowApiModal(true)}
                    className="w-full text-xs text-amber-400/80 hover:text-amber-400 transition-colors flex items-center justify-center gap-1.5 py-1"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Необходимо настроить API-ключи
                  </button>
                )}

                {!uploadedImage && keysConfigured && (
                  <p className="text-xs text-muted-foreground text-center">
                    Загрузите фото для начала
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <MasterPromptPanel />
                <GrokPromptsPanel />
                <GenerationGrid />

                {generations.length === 0 && uploadedImage && (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                      <Zap className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Нажмите «Генерировать» для создания вариаций
                    </p>
                  </div>
                )}

                {generations.length === 0 && !uploadedImage && (
                  <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                      <Factory className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Здесь появятся сгенерированные кадры</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Загрузите фото и нажмите «Генерировать»</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
              </>
            )}

            {activeTab === 'img-to-video' && (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-primary" />
                    <h1 className="text-lg font-semibold text-foreground">Image to Video</h1>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Генерация видео с помощью Kling 3.0 Pro
                  </p>
                </div>

                {/* DNA Model Card */}
                <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <KeyRound className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">DNA модели</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Активирована</span>
                        <button
                          onClick={() => setShowDnaDescription(!showDnaDescription)}
                          className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {showDnaDescription ? (
                            <>
                              <EyeOff className="h-3 w-3" />
                              Скрыть
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3" />
                              Показать
                            </>
                          )}
                        </button>
                      </div>
                      <div
                        className={cn(
                          "text-xs text-muted-foreground leading-relaxed transition-all duration-200 cursor-pointer select-none",
                          !showDnaDescription && "blur-md"
                        )}
                        onClick={() => !showDnaDescription && setShowDnaDescription(true)}
                      >
                        A young woman with subtle, natural heterochromia — her left eye is a soft, realistic blue and her right eye is a natural warm brown, both matching the brightness and lighting of the environment without appearing overly vivid. She has long black hair with a full straight fringe and soft natural waves reaching to the chest.
                      </div>
                      <p className="text-xs text-primary/80 mt-2 italic">
                        Этот DNA автоматически добавляется к каждому видео промпту для сохранения внешности персонажа
                      </p>
                    </div>
                  </div>
                </div>

                {/* IceShelf Kling Element Card */}
                <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Zap className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">
                          Kling Element: {showIceShelfDetails ? 'IceShelf' : '********'}
                        </span>
                        <button
                          onClick={() => setShowIceShelfDetails(!showIceShelfDetails)}
                          className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium hover:bg-emerald-500/20 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          {showIceShelfDetails ? (
                            <>
                              <EyeOff className="h-3 w-3" />
                              ID: 310069756440507
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3" />
                              ID: ***************
                            </>
                          )}
                        </button>
                      </div>
                      <div
                        className={cn(
                          "text-xs text-muted-foreground leading-relaxed transition-all duration-200 cursor-pointer select-none",
                          !showIceShelfDetails && "blur-md"
                        )}
                        onClick={() => !showIceShelfDetails && setShowIceShelfDetails(true)}
                      >
                        Woman with heterochromia (blue/brown eyes), long black hair with full fringe, natural waves
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <p className="text-xs text-emerald-600 font-medium">
                          Элемент автоматически применяется ко всем видео для консистентности персонажа
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
                  <div className="space-y-6">
                    <VideoQueuePanel onRegeneratePrompt={handleRegenerateVideoPrompt} />
                  </div>

                  <div className="space-y-4">
                    {/* Video Wishes */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Пожелания к видео промптам
                      </label>
                      <textarea
                        value={videoWishes}
                        onChange={(e) => setVideoWishes(e.target.value)}
                        placeholder="Например: добавить больше движения камеры, показать эмоции персонажа, добавить динамичные жесты..."
                        className="w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <p className="text-xs text-muted-foreground">
                        Grok учтёт ваши пожелания при создании описаний движения для видео
                      </p>
                    </div>

                    <VideoSettingsPanel />

                    {videoQueue.filter((q) => q.selected).length > 0 && (
                      <Button
                        onClick={handleGenerateVideoPrompts}
                        disabled={isGenerating}
                        className="w-full h-11 text-base font-semibold gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                        size="lg"
                      >
                        {isGenerating ? (
                          <>
                            <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                            Генерирую видео...
                          </>
                        ) : (
                          <>
                            <Zap className="h-5 w-5" />
                            Сгенерировать видео
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <VideoGenerationGrid />
              </>
            )}

            <div className={activeTab !== 'montage' ? 'hidden' : ''}><MontagePanel /></div>
            <div className={activeTab !== 'voice' ? 'hidden' : ''}><VoicePanel /></div>
            <div className={activeTab !== 'infinitetalk' ? 'hidden' : ''}><InfiniteTalkPanel /></div>
            <div className={activeTab !== 'subs' ? 'hidden' : ''}><SubsPanel /></div>
            <div className={activeTab !== 'text-to-post' ? 'hidden' : ''}><TextToPostPanel /></div>
            <div className={activeTab !== 'inst-to-post' ? 'hidden' : ''}><InstToPostPanel /></div>
            <div className={activeTab !== 'nsfw' ? 'hidden' : ''}><NSFWPanel /></div>
            <div className={activeTab !== 'upscale' ? 'hidden' : ''}><UpscalePanel /></div>
            {activeTab === 'news-to-post' && (
              <NewsToPostPanel
                research={newsResearch}
                isResearching={isResearching}
                awaitingTopicSelection={awaitingTopicSelection}
                onResearch={handleFetchTrends}
                onSelectTopic={handleSelectTopic}
                onRegenerate={handleRegeneratePost}
                onRegenerateWithEmotion={(emotion) => handleRegeneratePost(emotion)}
                onCompress={handleCompressPost}
                onResizeBySentences={handleResizeBySentences}
                onPostTextChange={(text) =>
                  newsResearch && setNewsResearch({ ...newsResearch, postText: text })
                }
                onDurationChange={(duration) => {
                  if (newsResearch) {
                    setNewsResearch({ ...newsResearch, postDuration: duration })
                  } else {
                    // Initialize newsResearch with default values when changing duration before first research
                    setNewsResearch({
                      trending: [],
                      selectedTopic: { title: '', engagement: 'medium', polarization: '', summary: '' },
                      newsDetails: '',
                      translationRu: '',
                      sources: [],
                      postText: '',
                      postTranslationRu: '',
                      hashtags: [],
                      researchedAt: '',
                      stepLogs: [],
                      postDuration: duration,
                      xPosts: [],
                      currentStep: '',
                    })
                  }
                }}
              />
            )}
          </div>
        </main>

        {showLogs && (
          <aside className="w-80 xl:w-96 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Логи процесса</span>
              <button
                onClick={() => setShowLogs(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <LogsPanel />
            </div>
          </aside>
        )}
      </div>

      <ApiKeyModal open={showApiModal} onClose={() => setShowApiModal(false)} />
      <ModelSelectorModal />

      {showAutoKeyToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-emerald-500/30 shadow-2xl shadow-black/40 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-sm w-[calc(100vw-2rem)]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">API-ключи загружены автоматически</p>
            <p className="text-xs text-muted-foreground mt-0.5">Готово к использованию без ручного ввода</p>
          </div>
          <button
            onClick={() => setShowAutoKeyToast(false)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default App
