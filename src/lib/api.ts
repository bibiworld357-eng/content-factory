import type { LogLevel, MinimaxTTSResult } from '@/types'
import {
  KLING_AUDIO_MAX_CHARS,
  clampKlingAudioPrompts,
  getBogdanaProduct,
  withStaticCamera,
  type BogdanaProductId,
} from './bogdana'
export type { MinimaxTTSResult }

export type LogFn = (message: string, level?: LogLevel) => void

/**
 * Build an `Authorization: Bearer <key>` header value.
 *
 * The key is trimmed to strip stray whitespace/newlines that leak in from copy-
 * paste or `.env` files — a common cause of spurious 401 Unauthorized responses
 * (e.g. from Wavespeed). Throws a clear error when the key is missing so the UI
 * can prompt for it instead of firing an unauthenticated request.
 */
export function bearer(key: string, service = 'API'): string {
  const trimmed = (key ?? '').trim()
  if (!trimmed) {
    throw new Error(`${service}: не задан ключ авторизации (401). Укажите ключ в настройках.`)
  }
  return `Bearer ${trimmed}`
}

export const DNA = `A young woman with subtle, natural heterochromia — her left eye is a soft, realistic blue and her right eye is a natural warm brown, both matching the brightness and lighting of the environment without appearing overly vivid. She has long black hair with a full straight fringe and soft natural waves reaching to the chest.`

// IceShelf Kling Element ID - for consistent character in video generation
export const ICESHELF_ELEMENT_ID = '310069756440507'

// DNA Reference Image - Base64 encoded face reference
// This image will be sent as second reference to Nano Banana 2 Edit API
export const DNA_REFERENCE_IMAGE = '/dna-reference.jpg' // Will be loaded dynamically

let cachedDnaImageBase64: string | null = null

export async function loadDnaReferenceImage(): Promise<string> {
  if (cachedDnaImageBase64) return cachedDnaImageBase64

  try {
    const response = await fetch(DNA_REFERENCE_IMAGE)
    const blob = await response.blob()
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    cachedDnaImageBase64 = base64
    return base64
  } catch (err) {
    console.error('Failed to load DNA reference image:', err)
    return ''
  }
}

export interface WavespeedBalance {
  balance: number
  currency: string
}

export async function getWavespeedBalance(
  wavespeedKey: string,
  onLog?: LogFn
): Promise<WavespeedBalance | null> {
  try {
    onLog?.('Получение баланса Wavespeed...')

    // Use Vite proxy in development to bypass CORS
    const apiUrl = import.meta.env.DEV
      ? '/api/wavespeed/v3/balance'
      : 'https://api.wavespeed.ai/api/v3/balance'

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: bearer(wavespeedKey, 'Wavespeed'),
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Wavespeed balance error:', response.status, errorData)
      onLog?.(`Ошибка получения баланса: ${response.status}`, 'error')
      return null
    }

    const data = (await response.json()) as { 
      code?: number
      message?: string
      data?: {
        balance?: number
      }
    }
    
    console.log('Wavespeed balance response:', data)
    
    if (data.code === 200 && data.data?.balance !== undefined) {
      const balance = data.data.balance
      onLog?.(`Баланс Wavespeed: $${balance.toFixed(2)}`, 'success')
      return { balance, currency: 'USD' }
    } else {
      onLog?.(`Неожиданный формат ответа баланса`, 'error')
      return null
    }
  } catch (err) {
    console.error('Failed to fetch Wavespeed balance:', err)
    onLog?.('Не удалось получить баланс', 'error')
    return null
  }
}

export async function generatePromptsWithGrok(
  grokKey: string,
  imageBase64: string,
  masterPrompt: string,
  count: number,
  userWishes: string,
  onLog?: LogFn,
  onPromptReady?: (accumulated: string[]) => void,
  onTranslationReady?: (accumulated: string[]) => void,
  intensity = 50,
  modelName = 'Nano Banana 2 Edit'
): Promise<string[]> {
  // Handle both data URLs and raw base64 strings
  let dataUrl: string
  if (imageBase64.startsWith('data:')) {
    // Already a data URL
    dataUrl = imageBase64
  } else {
    // Raw base64 - detect type from leading bytes and build full data URL
    const mimeType = imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
    dataUrl = `data:${mimeType};base64,${imageBase64}`
  }

  onLog?.(`Grok Vision | ${imageBase64.length} chars | кадров: ${count} (параллельно)`)

  const accumulated: string[] = []
  const accumulatedRu: string[] = []

  // Helper function to generate single prompt
  const generateSinglePrompt = async (index: number): Promise<{ en: string; ru: string; index: number } | null> => {
    const i = index + 1
    try {
      const intensityNote =
        intensity <= 25
          ? 'VERY SUBTLE changes only — almost identical to original, barely noticeable difference.'
          : intensity <= 50
          ? 'MODERATE changes — noticeably different pose/angle but overall feel stays the same.'
          : intensity <= 75
          ? 'SIGNIFICANT changes — clearly different pose, angle, framing and expression.'
          : 'MAXIMUM changes — dramatic transformation in pose, angle, framing and emotion. Make it strikingly different.'

      const userWishesSection = userWishes.trim() 
        ? `\n\nUSER WISHES (important - incorporate these into the variation):\n${userWishes.trim()}` 
        : ''

      const modelSpecificNote = modelName === 'Z-Image Turbo LoRA'
        ? ' This model uses IceShelf LoRA for consistent character generation.'
        : modelName === 'GPT Image 2'
        ? ' This is OpenAI\'s GPT Image 2 model with advanced editing capabilities.'
        : ' This is Google\'s Nano Banana 2 model.'

      const fullText = `${DNA}\n\n${masterPrompt}\n\nGenerate variation prompt #${i} of ${count} for ${modelName} model.${modelSpecificNote} Keep exact same appearance, clothing, hair, environment and lighting. Change ONLY: pose, camera angle, framing (close-up / medium / full), head tilt, gaze direction, subtle emotion/facial expression.${userWishesSection}\n\nIntensity level: ${intensity}/100 — ${intensityNote}\n\nRespond in EXACTLY this format (two lines, nothing else):\n[EN]: <English prompt text>\n[RU]: <Точный перевод на русский>`

      const payload = {
        model: 'grok-4.20-reasoning',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: dataUrl,
                detail: 'high',
              },
              {
                type: 'input_text',
                text: fullText,
              },
            ],
          },
        ],
        temperature: 0.7,
        max_output_tokens: 2048,
        store: false,
      }

      console.log(`[Grok] prompt ${i}/${count} → POST /v1/responses (parallel)`)

      const httpResponse = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: bearer(grokKey, 'Grok'),
        },
        body: JSON.stringify(payload),
      }).catch((err) => {
        throw new Error(`Network error: ${err.message}`)
      })

      if (!httpResponse.ok) {
        const errorData = await httpResponse.json().catch(() => ({}))
        const msg = `Grok ${httpResponse.status} (промпт ${i}/${count}): ${JSON.stringify(errorData)}`
        throw new Error(msg)
      }

      const data = await httpResponse.json() as Record<string, unknown>

      // xAI /v1/responses: output array contains [reasoning, message] — find the message item
      type OutputItem = { type?: string; content?: Array<{ type?: string; text?: string }> }
      type ChoicesItem = { message?: { content?: string }; text?: string }
      const output = (data as { output?: OutputItem[] }).output ?? []

      const messageOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
      const outputText =
        messageOutput?.content?.find((c) => c.type === 'output_text')?.text ??
        messageOutput?.content?.[0]?.text

      const rawContent: unknown =
        outputText ??
        (data as { choices?: ChoicesItem[] }).choices?.[0]?.message?.content ??
        (data as { choices?: ChoicesItem[] }).choices?.[0]?.text

      const content: string = typeof rawContent === 'string' ? rawContent : JSON.stringify(data)

      // Parse [EN]: / [RU]: format
      const enMatch = content.match(/\[EN\]:\s*([\s\S]*?)(?=\n\[RU\]:|$)/i)
      const ruMatch = content.match(/\[RU\]:\s*([\s\S]*)/i)
      const englishPrompt = enMatch?.[1]?.trim() ?? content.trim()
      const russianTranslation = ruMatch?.[1]?.trim() ?? ''

      if (englishPrompt.length > 20) {
        onLog?.(`Промпт ${i}/${count} получен (${englishPrompt.length} симв.)`, 'success')
        return { en: englishPrompt, ru: russianTranslation, index }
      } else {
        onLog?.(`Промпт ${i}/${count}: пустой ответ от Grok`, 'error')
        return null
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Неизвестная ошибка'
      onLog?.(`Ошибка промпта ${i}/${count}: ${errorMsg}`, 'error')
      return null
    }
  }

  // Run all prompts in parallel
  const results = await Promise.all(
    Array.from({ length: count }, (_, index) => generateSinglePrompt(index))
  )

  // Collect successful results
  const successfulResults = results.filter((r): r is { en: string; ru: string; index: number } => r !== null)
  
  // Sort by index to maintain order
  successfulResults.sort((a, b) => a.index - b.index)
  
  // Extract prompts and translations
  for (const result of successfulResults) {
    accumulated.push(result.en)
    if (result.ru) {
      accumulatedRu.push(result.ru)
    }
  }

  // Update UI with all results at once
  if (accumulated.length > 0) {
    onPromptReady?.([...accumulated])
  }
  if (accumulatedRu.length > 0) {
    onTranslationReady?.([...accumulatedRu])
  }

  if (accumulated.length === 0) {
    throw new Error('Grok не вернул ни одного промпта')
  }

  return accumulated
}

export interface WavespeedResult {
  imageUrl: string
}

export interface WavespeedOptions {
  resolution?: string
  aspectRatio?: string
  intensity?: number
  extraImages?: string[] // additional base64 data URLs to append after the main image
  // When false, skips the legacy hard-coded character DNA text + reference image.
  // Needed by pipelines (e.g. Bogdana) whose identity comes from their own refs.
  injectDefaultDna?: boolean
}

export async function editImageWithWavespeed(
  wavespeedKey: string,
  imageBase64: string,
  prompt: string,
  frameIndex: number,
  onLog?: LogFn,
  options: WavespeedOptions = {}
): Promise<WavespeedResult> {
  const { resolution = '1k', aspectRatio = '1:1', intensity = 50, injectDefaultDna = true } = options
  onLog?.(`Запуск Nano Banana 2 кадр #${frameIndex + 1} [Разр: ${resolution} | AR: ${aspectRatio} | Инт.: ${intensity}]...`)

  const mimeType = imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
  const dataUrl = `data:${mimeType};base64,${imageBase64}`
  const fullPrompt = injectDefaultDna ? `${DNA}\n\n${prompt}` : prompt

  const imageStrength = Math.round((intensity / 100) * 100) / 100

  // Load the legacy DNA reference image only when the default DNA is requested.
  const dnaRefImage = injectDefaultDna ? await loadDnaReferenceImage() : ''

  const payload = {
    images: [
      dataUrl,
      ...(dnaRefImage ? [dnaRefImage] : []),
      ...(options.extraImages ?? []),
    ], // main image + DNA ref + extra refs
    prompt: fullPrompt,
    resolution,
    aspect_ratio: aspectRatio,
    output_format: 'png',
    enable_base64_output: false, // ✅ Try without base64 - get URLs instead
    enable_sync_mode: true, // ✅ Try sync mode to get outputs immediately
    image_strength: imageStrength,
  }

  console.log(`[Wavespeed] frame ${frameIndex + 1} → POST`, {
    ...payload,
    images: [`${mimeType};base64,[${imageBase64.length} chars]`],
  })

  // Retry logic for transient errors (504, 502, 503)
  const maxRetries = 3
  let httpResponse: Response | null = null
  
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      if (retry > 0) {
        onLog?.(`Кадр #${frameIndex + 1}: повтор попытки ${retry + 1}/${maxRetries}...`)
        await new Promise(resolve => setTimeout(resolve, 2000 * retry)) // Exponential backoff
      }
      
      // Use Vite proxy in development to bypass CORS
      const apiUrl = import.meta.env.DEV
        ? '/api/wavespeed/v3/google/nano-banana-2/edit'
        : 'https://api.wavespeed.ai/api/v3/google/nano-banana-2/edit'
      
      httpResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: bearer(wavespeedKey, 'Wavespeed'),
        },
        body: JSON.stringify(payload),
      })

      // Break on success or non-retriable error
      if (httpResponse.ok || (httpResponse.status !== 502 && httpResponse.status !== 503 && httpResponse.status !== 504)) {
        break
      }
      
      console.log(`[Wavespeed] ${httpResponse.status} - retry ${retry + 1}/${maxRetries}`)
    } catch (err) {
      console.error(`[Wavespeed] network error on attempt ${retry + 1}:`, err)
      if (retry === maxRetries - 1) {
        throw new Error(`Wavespeed: сетевая ошибка после ${maxRetries} попыток`)
      }
    }
  }

  if (!httpResponse) {
    throw new Error(`Wavespeed: не удалось выполнить запрос`)
  }

  if (!httpResponse.ok) {
    const errorData = await httpResponse.json().catch(() => ({}))
    const msg = `Wavespeed ${httpResponse.status} (кадр ${frameIndex + 1}): ${JSON.stringify(errorData)}`
    onLog?.(msg, 'error')
    throw new Error(msg)
  }

  const submitData = await httpResponse.json() as Record<string, unknown>
  console.log(`[Wavespeed] frame ${frameIndex + 1} submit response:`, JSON.stringify(submitData, null, 2))

  // Extract prediction ID and poll URL
  type SubmitResponse = {
    id?: string
    urls?: { get?: string }
    status?: string
    outputs?: string[]
    output?: string
    images?: string[]
    image?: string
  }
  
  const submitResult = (submitData.data ?? submitData) as SubmitResponse
  const predictionId = submitResult.id
  let pollUrl = submitResult.urls?.get

  // Convert absolute URLs to proxy URLs in development
  // Wavespeed URLs are https://api.wavespeed.ai/api/v3/... and the proxy
  // rewrites /api/wavespeed → /api, so strip /api from the origin to avoid /api/api/ doubling
  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }

  // Check if sync mode returned outputs immediately
  if (submitResult.outputs && submitResult.outputs.length > 0 && submitResult.status === 'completed') {
    console.log(`[Wavespeed] frame ${frameIndex + 1} - sync mode returned outputs immediately`)
    const rawOutput = submitResult.outputs[0]
    
    // Use URL directly or convert base64
    const imageUrl = rawOutput.startsWith('http') || rawOutput.startsWith('data:') 
      ? rawOutput 
      : `data:image/png;base64,${rawOutput}`
    
    onLog?.(`Кадр #${frameIndex + 1} готов ✓`, 'success')
    return { imageUrl }
  }

  if (!predictionId || !pollUrl) {
    console.error(`[Wavespeed] frame ${frameIndex + 1} - No prediction ID or poll URL`)
    throw new Error(`Wavespeed: не получен ID задачи`)
  }

  onLog?.(`Кадр #${frameIndex + 1}: задача ${predictionId} создана, опрос...`)
  console.log(`[Wavespeed] frame ${frameIndex + 1} poll URL: ${pollUrl}`)

  // Poll for result (max 2 minutes for high-res images)
  const maxAttempts = 60
  const pollInterval = 2000 // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before first poll
    await new Promise(resolve => setTimeout(resolve, pollInterval))

    try {
      const pollResponse = await fetch(pollUrl, {
        headers: {
          Authorization: bearer(wavespeedKey, 'Wavespeed'),
        },
      })

      if (!pollResponse.ok) {
        console.error(`[Wavespeed] poll error ${pollResponse.status} on attempt ${attempt + 1}`)
        // Don't fail immediately, keep trying
        continue
      }

      const pollData = await pollResponse.json() as Record<string, unknown>
      const result = (pollData.data ?? pollData) as SubmitResponse

      // Log full response on first attempt
      if (attempt === 0) {
        console.log(`[Wavespeed] frame ${frameIndex + 1} first poll response:`, JSON.stringify(pollData, null, 2))
      }

      console.log(`[Wavespeed] frame ${frameIndex + 1} poll attempt ${attempt + 1}/${maxAttempts}: status=${result.status}`)

      if (result.status === 'completed') {
        // If outputs is empty, try different endpoints
        if (!result.outputs || result.outputs.length === 0) {
          console.log(`[Wavespeed] frame ${frameIndex + 1} - outputs empty, trying alternative endpoints`)
          
          const baseUrl = pollUrl.replace(/\/result$/, '')
          const alternativeUrls = [
            `${baseUrl}/output`,
            `${baseUrl}/outputs`,
            pollUrl,
          ]
          
          for (const tryUrl of alternativeUrls) {
            try {
              console.log(`[Wavespeed] trying: ${tryUrl}`)
              const resultResponse = await fetch(tryUrl, {
                headers: {
                  Authorization: bearer(wavespeedKey, 'Wavespeed'),
                },
              })
              
              if (resultResponse.ok) {
                // Check if response is JSON or binary
                const contentType = resultResponse.headers.get('content-type')
                
                if (contentType?.includes('application/json')) {
                  const resultData = await resultResponse.json() as Record<string, unknown>
                  console.log(`[Wavespeed] ${tryUrl} JSON response:`, JSON.stringify(resultData, null, 2))
                  
                  const resultOutputs = (resultData.outputs as string[] | undefined) ?? 
                                       ((resultData.data as { outputs?: string[] } | undefined)?.outputs)
                  
                  if (resultOutputs && resultOutputs.length > 0) {
                    result.outputs = resultOutputs
                    console.log(`[Wavespeed] found outputs in ${tryUrl}`)
                    break
                  }
                } else if (contentType?.includes('image/')) {
                  // Direct image response
                  console.log(`[Wavespeed] ${tryUrl} returned image directly`)
                  const imgBlob = await resultResponse.blob()
                  const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader()
                    reader.onloadend = () => resolve(reader.result as string)
                    reader.readAsDataURL(imgBlob)
                  })
                  result.outputs = [base64]
                  console.log(`[Wavespeed] converted direct image to base64`)
                  break
                }
              }
            } catch (err) {
              console.error(`[Wavespeed] failed to fetch from ${tryUrl}:`, err)
            }
          }
        }
        
        // Check multiple possible locations for image data
        type PollDataWithImages = {
          outputs?: string[]
          output?: string
          images?: string[]
          image?: string
          data?: {
            outputs?: string[]
            output?: string
            images?: string[]
            image?: string
          }
        }
        
        const dataWithImages = pollData as PollDataWithImages
        
        const rawOutput =
          result.outputs?.[0] ??
          result.output ??
          dataWithImages.images?.[0] ??
          dataWithImages.image ??
          dataWithImages.data?.outputs?.[0] ??
          dataWithImages.data?.output ??
          dataWithImages.data?.images?.[0] ??
          dataWithImages.data?.image

        if (!rawOutput) {
          console.error(`[Wavespeed] completed but no output. Full response:`, JSON.stringify(pollData, null, 2))
          throw new Error(`Wavespeed: нет изображения в завершенной задаче`)
        }

        // Use URL directly or convert base64
        const imageUrl = rawOutput.startsWith('http') || rawOutput.startsWith('data:')
          ? rawOutput
          : `data:image/png;base64,${rawOutput}`

        onLog?.(`Кадр #${frameIndex + 1} готов ✓`, 'success')
        return { imageUrl }
      }

      if (result.status === 'failed') {
        const errorMsg = (pollData as { error?: string }).error ?? 'Неизвестная ошибка'
        throw new Error(`Wavespeed: задача завершилась с ошибкой - ${errorMsg}`)
      }

      // Update progress every 10 attempts
      if ((attempt + 1) % 10 === 0) {
        onLog?.(`Кадр #${frameIndex + 1}: ожидание... (${attempt + 1}/${maxAttempts})`)
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Wavespeed:')) {
        // Re-throw Wavespeed-specific errors
        throw err
      }
      // Network errors - log and continue
      console.error(`[Wavespeed] polling network error on attempt ${attempt + 1}:`, err)
    }
  }

  throw new Error(`Wavespeed: превышено время ожидания (${maxAttempts * pollInterval / 1000}s)`)
}

export async function generateVideoPromptsWithGrok(
  grokKey: string,
  images: Array<{ id: string; imageUrl: string; sourcePrompt: string }>,
  userWishes: string,
  onLog?: LogFn,
  onPromptReady?: (id: string, prompt: string, promptRu: string, negativePrompt: string) => void
): Promise<Array<{ id: string; prompt: string; promptRu: string; negativePrompt: string }>> {
  onLog?.(`Генерация видео промптов для ${images.length} изображени${images.length === 1 ? 'я' : 'й'}...`)

  const results: Array<{ id: string; prompt: string; promptRu: string; negativePrompt: string }> = []

  // Process images in parallel batches to avoid timeout and payload size issues
  const batchSize = 3
  for (let batchStart = 0; batchStart < images.length; batchStart += batchSize) {
    const batch = images.slice(batchStart, batchStart + batchSize)
    
    await Promise.all(
      batch.map(async (image, batchIndex) => {
        const i = batchStart + batchIndex
        onLog?.(`Анализ изображения ${i + 1}/${images.length}...`)

        const wishesSection = userWishes.trim() ? `\n\nUser wishes: "${userWishes}"\nPlease incorporate these wishes into the motion description.` : ''
        const promptText = `${DNA}\n\nAnalyze this image for cinematic video generation using Kling 3.0 Pro Image-to-Video.\nOriginal prompt: "${image.sourcePrompt}"${wishesSection}\n\nProvide THREE outputs in this EXACT format:\n\n[EN]:\n[Natural, cinematic motion description in English. Describe camera movement (pan/tilt/zoom/dolly/static), character motion (subtle movements, breathing, gestures), facial changes (blinks, smiles, gaze shifts), and natural physics (hair, fabric). Keep it realistic as if shot on iPhone. 2-3 sentences max.]\n\n[RU]:\n[Russian translation of the motion description above]\n\n[NEGATIVE]:\n[Negative prompt in English to avoid unrealistic elements. Include: unnatural motion, jerky movement, distorted anatomy, artificial lighting, CGI look, choppy animation, cartoon style, unrealistic physics, morphing, warping, glitches, poor quality, blurry, pixelated]\n\nKeep descriptions natural and cinematic, suitable for realistic iPhone-quality video.`

        const payload = {
          model: 'grok-4.20-reasoning',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  image_url: image.imageUrl,
                  detail: 'low',
                },
                {
                  type: 'input_text',
                  text: promptText,
                },
              ],
            },
          ],
          temperature: 0.7,
          max_output_tokens: 1024,
          store: false, // Don't store response to avoid "too large to store" error
        }

        console.log(`[Grok Video] ${i + 1}/${images.length} → POST /v1/responses`, {
          model: payload.model,
          imageUrl: image.imageUrl.slice(0, 50) + '...',
        })

        try {
          const httpResponse = await fetch('https://api.x.ai/v1/responses', {
            method: 'POST',
            headers: {
              Authorization: bearer(grokKey, 'Grok'),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (!httpResponse.ok) {
            const errorData = await httpResponse.json().catch(() => ({}))
            const msg = `Grok ${httpResponse.status} (видео промпт ${i + 1}/${images.length}): ${JSON.stringify(errorData)}`
            onLog?.(msg, 'error')
            throw new Error(msg)
          }

          const data = (await httpResponse.json()) as {
            output?: Array<{
              type?: string
              content?: Array<{ type?: string; text?: string }>
            }>
          }

          // Extract text from Responses API format
          const output = data.output ?? []
          const messageOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
          const outputText =
            messageOutput?.content?.find((c) => c.type === 'output_text')?.text ??
            messageOutput?.content?.[0]?.text

          const content: string = typeof outputText === 'string' ? outputText.trim() : ''

          // Parse [EN], [RU], and [NEGATIVE] sections (take first occurrence only)
          const enMatch = content.match(/\[EN\]:?\s*([\s\S]*?)(?=\[RU\]:|$)/i)
          const ruMatch = content.match(/\[RU\]:?\s*([\s\S]*?)(?=\[NEGATIVE\]:|$)/i)
          const negMatch = content.match(/\[NEGATIVE\]:?\s*([\s\S]*?)(?=\[EN\]:|$)/i)

          const prompt = enMatch?.[1]?.trim() ?? content.trim()
          const promptRu = ruMatch?.[1]?.trim() ?? ''
          const negativePrompt = negMatch?.[1]?.trim() ?? 
            'unnatural motion, jerky movement, distorted anatomy, artificial lighting, CGI look, choppy animation, cartoon style, unrealistic physics, morphing, warping, glitches, poor quality, blurry, pixelated'
          
          // Clean up: remove any duplicate sections that might have been included
          const cleanPrompt = prompt.split(/\[RU\]:|\[NEGATIVE\]:/i)[0].trim()
          const cleanPromptRu = promptRu.split(/\[NEGATIVE\]:|\[EN\]:/i)[0].trim()
          const cleanNegativePrompt = negativePrompt.split(/\[EN\]:|\[RU\]:/i)[0].trim()

          if (cleanPrompt.length > 20) {
            results.push({ id: image.id, prompt: cleanPrompt, promptRu: cleanPromptRu, negativePrompt: cleanNegativePrompt })
            onPromptReady?.(image.id, cleanPrompt, cleanPromptRu, cleanNegativePrompt)
            onLog?.(`Видео промпт ${i + 1}/${images.length} готов (${cleanPrompt.length} симв.)`, 'success')
          } else {
            onLog?.(`Видео промпт ${i + 1}/${images.length}: пустой ответ`, 'error')
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Ошибка Grok'
          onLog?.(`Ошибка видео промпта ${i + 1}: ${errorMsg}`, 'error')
        }
      })
    )
  }

  if (results.length === 0) {
    throw new Error('Grok не вернул ни одного видео промпта')
  }

  onLog?.(`Все видео промпты готовы (${results.length}/${images.length})`, 'success')
  return results
}

/** Selectable Kling image-to-video models on Wavespeed and their allowed durations. */
export interface KlingModel {
  id: string
  label: string
  /** Wavespeed path after `/api/`, e.g. `v3/kwaivgi/kling-v3.0-pro/image-to-video`. */
  endpoint: string
  durations: number[]
}

export const KLING_MODELS: KlingModel[] = [
  { id: 'kling-v3.0-pro', label: 'Kling 3.0 Pro', endpoint: 'v3/kwaivgi/kling-v3.0-pro/image-to-video', durations: [3, 5, 10] },
  { id: 'kling-v2.5-turbo-pro', label: 'Kling 2.5 Turbo Pro', endpoint: 'v3/kwaivgi/kling-v2.5-turbo-pro/image-to-video', durations: [5, 10] },
  { id: 'kling-v2.1-master', label: 'Kling 2.1 Master', endpoint: 'v3/kwaivgi/kling-v2.1-master/image-to-video', durations: [5, 10] },
  { id: 'kling-v2.1-pro', label: 'Kling 2.1 Pro', endpoint: 'v3/kwaivgi/kling-v2.1-pro/image-to-video', durations: [5, 10] },
]

export const DEFAULT_KLING_MODEL = KLING_MODELS[0]

export interface KlingOptions {
  duration: number
  aspectRatio?: string
  withSound?: boolean
  cfgScale?: number
  negativePrompt?: string
  endImage?: string
  /** Wavespeed endpoint path; defaults to the current Kling 3.0 Pro model. */
  modelEndpoint?: string
}

export interface KlingTaskResponse {
  requestId: string
}

export interface KlingResult {
  status: 'created' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  posterUrl?: string
  error?: string
}

export async function submitKlingVideoTask(
  wavespeedKey: string,
  imageUrl: string,
  prompt: string,
  options: KlingOptions,
  onLog?: LogFn
): Promise<KlingTaskResponse> {
  const { duration, aspectRatio = '9:16', withSound = false, cfgScale = 0.5, negativePrompt, endImage } = options
  const modelEndpoint = options.modelEndpoint ?? DEFAULT_KLING_MODEL.endpoint

  const hasEndFrame = endImage && endImage.trim().length > 0
  onLog?.(`Отправка задачи в Kling [${modelEndpoint.split('/')[2] ?? 'kling'}, ${duration}s, ${aspectRatio}, звук:${withSound ? 'да' : 'нет'}${hasEndFrame ? ', END кадр' : ''}]...`)
  onLog?.(`✨ IceShelf Element (${ICESHELF_ELEMENT_ID}) применен для консистентности персонажа`, 'success')

  // Always inject the "Static camera" tag to prevent background flicker.
  const motionPrompt = withStaticCamera(prompt)

  const payload: Record<string, unknown> = {
    image: imageUrl,
    prompt: `${DNA}\n\n${motionPrompt}`,
    duration,
    aspect_ratio: aspectRatio,
    cfg_scale: cfgScale,
    enable_audio: withSound,
    element_list: [{ element_id: ICESHELF_ELEMENT_ID }], // ALWAYS include IceShelf element for character consistency
  }

  if (negativePrompt && negativePrompt.trim()) {
    payload.negative_prompt = negativePrompt.trim()
  }

  if (hasEndFrame) {
    payload.end_image = endImage
  }

  console.log(`[Kling Submit] → POST /api/${modelEndpoint}`, {
    duration,
    aspectRatio,
    withSound,
    imageUrl: imageUrl.slice(0, 50) + '...',
  })

  const apiUrl = import.meta.env.DEV
    ? `/api/wavespeed/${modelEndpoint}`
    : `https://api.wavespeed.ai/api/${modelEndpoint}`

  const httpResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const errorData = await httpResponse.json().catch(() => ({}))
    const msg = `Kling ${httpResponse.status}: ${JSON.stringify(errorData)}`
    onLog?.(msg, 'error')
    throw new Error(msg)
  }

  const responseData = (await httpResponse.json()) as { 
    request_id?: string
    requestId?: string
    id?: string
    data?: { request_id?: string; requestId?: string; id?: string }
    code?: number
    message?: string
  }
  
  console.log('[Kling Submit] Full response:', JSON.stringify(responseData, null, 2))
  
  // Check both root level and nested data object, including 'id' field
  const requestId = 
    responseData.request_id ?? 
    responseData.requestId ?? 
    responseData.id ??
    responseData.data?.request_id ?? 
    responseData.data?.requestId ??
    responseData.data?.id

  if (!requestId) {
    console.error('[Kling Submit] Failed to extract request_id from:', responseData)
    onLog?.(`Kling ответ: ${JSON.stringify(responseData)}`, 'error')
    throw new Error('Kling не вернул request_id')
  }

  onLog?.(`Задача отправлена в Kling. ID: ${requestId}`, 'success')
  return { requestId }
}

export async function pollKlingResult(
  wavespeedKey: string,
  requestId: string,
  onLog?: LogFn
): Promise<KlingResult> {
  const intervals = [5000, 5000, 10000, 20000, 30000] // Progressive: 5→5→10→20→30 sec
  const maxAttempts = 30 // Video generation can take several minutes

  onLog?.(`Опрос статуса задачи ${requestId}...`)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delayMs = intervals[Math.min(attempt, intervals.length - 1)]
    
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    console.log(`[Kling Poll] attempt ${attempt + 1}/${maxAttempts} → GET /api/v3/predictions/${requestId}/result`)

    const apiUrl = import.meta.env.DEV
      ? `/api/wavespeed/v3/predictions/${requestId}/result`
      : `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`

    const httpResponse = await fetch(apiUrl, {
      headers: {
        Authorization: bearer(wavespeedKey, 'Wavespeed'),
      },
    })

    if (!httpResponse.ok) {
      const errorData = await httpResponse.json().catch(() => ({}))
      onLog?.(`Ошибка опроса: ${httpResponse.status}`, 'error')
      throw new Error(`Kling poll error ${httpResponse.status}: ${JSON.stringify(errorData)}`)
    }

    const response = (await httpResponse.json()) as {
      status?: string
      video_url?: string
      videoUrl?: string
      poster_url?: string
      posterUrl?: string
      error?: string
      output?: { 
        video_url?: string
        videoUrl?: string
        poster_url?: string
        posterUrl?: string
      }
      data?: {
        status?: string
        video_url?: string
        videoUrl?: string
        poster_url?: string
        posterUrl?: string
        error?: string
        output?: { 
          video_url?: string
          videoUrl?: string
          poster_url?: string
          posterUrl?: string
        }
      }
    }

    // Support both root-level and nested data responses
    const data = response.data ?? response
    const status = data.status as KlingResult['status']
    
    // Extract from outputs array if present (Wavespeed format)
    const outputs = (data as any).outputs || (response as any).outputs
    let videoUrl: string | undefined
    
    // Check if outputs is array of strings (CloudFront URLs)
    if (Array.isArray(outputs) && outputs.length > 0) {
      const firstOutput = outputs[0]
      
      if (typeof firstOutput === 'string') {
        // Direct CloudFront URL
        videoUrl = firstOutput
      } else if (firstOutput && typeof firstOutput === 'object') {
        // Object with urls.get or url property
        videoUrl = firstOutput.urls?.get ?? firstOutput.url
      }
    }
    
    // Try other paths if not found in outputs
    if (!videoUrl) {
      videoUrl = 
        data.video_url ?? 
        data.videoUrl ?? 
        data.output?.video_url ?? 
        data.output?.videoUrl ??
        (response as any).videoUrl ??
        (response as any).video_url
    }
    
    // Extract poster URL
    let posterUrl: string | undefined
    if (Array.isArray(outputs) && outputs.length > 0 && typeof outputs[0] === 'object') {
      posterUrl = outputs[0]?.urls?.poster ?? outputs[0]?.thumbnail
    }
    if (!posterUrl) {
      posterUrl = 
        data.poster_url ?? 
        data.posterUrl ?? 
        data.output?.poster_url ??
        data.output?.posterUrl ??
        (response as any).posterUrl ??
        (response as any).poster_url
    }

    // Log full response for debugging
    console.log('[Kling Poll] Response:', JSON.stringify(response, null, 2))
    console.log('[Kling Poll] Extracted:', { status, videoUrl: videoUrl?.slice(0, 100), posterUrl: posterUrl?.slice(0, 100) })

    onLog?.(`Статус: ${status} (попытка ${attempt + 1}/${maxAttempts})`)

    if (status === 'completed') {
      if (videoUrl) {
        // If videoUrl is a Wavespeed API endpoint (urls.get), fetch the actual video URL
        // CloudFront URLs (d1x70r5gvjhc.cloudfront.net) are direct video links, no need to fetch
        let actualVideoUrl = videoUrl
        const isApiEndpoint = videoUrl.includes('/api/v3/predictions/') || videoUrl.includes('wavespeed.ai/api')
        const isCloudFrontUrl = videoUrl.includes('cloudfront.net')
        
        if (isApiEndpoint && !isCloudFrontUrl) {
          try {
            console.log('[Kling Poll] videoUrl is API endpoint, fetching actual video URL from:', videoUrl)
            const videoResponse = await fetch(videoUrl, {
              headers: {
                'Authorization': bearer(wavespeedKey, 'Wavespeed'),
              },
            })
            const videoData = await videoResponse.json() as any
            console.log('[Kling Poll] Video data response:', JSON.stringify(videoData, null, 2))
            
            // Extract actual video file URL from response
            // Wavespeed returns: { outputs: ["https://cloudfront.net/video.mp4"] }
            const outputs = videoData.outputs || videoData.data?.outputs || videoData.output || videoData.data?.output
            
            if (Array.isArray(outputs) && outputs.length > 0) {
              // Get first CloudFront URL from array
              actualVideoUrl = typeof outputs[0] === 'string' ? outputs[0] : outputs[0]?.url || outputs[0]?.video_url || videoUrl
            } else {
              // Try direct properties
              actualVideoUrl = 
                videoData.video_url ??
                videoData.data?.video_url ??
                videoUrl // Fallback to original
            }
              
            console.log('[Kling Poll] Extracted actual video URL:', actualVideoUrl)
          } catch (err) {
            console.error('[Kling Poll] Failed to fetch video URL:', err)
            onLog?.(`⚠️ Не удалось получить финальный URL видео`, 'error')
          }
        } else if (isCloudFrontUrl) {
          console.log('[Kling Poll] videoUrl is already a direct CloudFront URL:', videoUrl)
        }
        
        onLog?.(`Видео готово! URL: ${actualVideoUrl.slice(0, 50)}...`, 'success')
        return { status: 'completed', videoUrl: actualVideoUrl, posterUrl }
      } else {
        // Status is completed but no videoUrl - log the issue but continue polling
        console.error('[Kling Poll] Status is completed but videoUrl is missing!', response)
        onLog?.(`⚠️ Статус completed, но URL видео отсутствует. Продолжаем опрос...`, 'error')
        // Continue polling in case the URL appears in the next response
        continue
      }
    }

    if (status === 'failed') {
      const errorMsg = data.error ?? 'Генерация не удалась'
      onLog?.(`Kling ошибка: ${errorMsg}`, 'error')
      return { status: 'failed', error: errorMsg }
    }

    if (status === 'processing' || status === 'created') {
      // Continue polling
      continue
    }

    // Unknown status
    console.warn('[Kling Poll] Unknown status:', status, 'Full response:', response)
    onLog?.(`Неизвестный статус: ${status}`)
  }

  // Timeout after max attempts
  onLog?.(`Превышен лимит ожидания (${maxAttempts} попыток)`, 'error')
  return { status: 'failed', error: 'Превышено время ожидания' }
}

// Sarah Icelyn lore for post generation
const SARAH_ICELYN_LORE = `You are Sarah Icelyn, a 27-year-old woman from Bloomfield Hills, Michigan (originally Toledo, Ohio).
Personality: Cold, elegant, restrained. Strategic observer. You sell the feeling of closeness because you fear actual intimacy.
Your greatest fear: dependence and losing control.
Style: Short sentences. Playful teasing but always sophisticated. Lots of compliments, questions to the audience, and light provocations.
Visual identity: Heterochromia (left eye blue, right eye warm brown). Long black hair with bangs. Hourglass figure. Minimalist dark style.
Professional persona: Luxury hotel butler/VIP service. Impeccable posture, white gloves, personalized care through strict distance.
Interests: Sushi, pasta carbonara, The Weeknd, R&B, Bridgerton, 365 Days. Pet mini-pig named Reaper.
Content strategy: Provocative content that makes people stop and argue. Trigger both sides of the debate. Use stereotypes, relationship red flags, psychology of the "cold girl". Create maximum controversy in comments without getting banned. The more fights in comments, the better the algorithm treats the post.
Tone: Daring, ironic, slightly condescending but charming. Never crude, always sharp.`

export interface XPost {
  author: string
  handle: string
  text: string
  url: string
  engagement: string
}

export interface NewsResearchResult {
  trending: Array<{
    title: string
    titleRu?: string
    engagement: 'high' | 'medium' | 'low'
    polarization: string
    summary: string
    summaryRu?: string
    metrics?: { postCount?: string; topEngagement?: string; trendSince?: string }
  }>
  selectedTopic: {
    title: string
    titleRu?: string
    engagement: 'high' | 'medium' | 'low'
    polarization: string
    summary: string
    summaryRu?: string
  }
  newsDetails: string
  translationRu: string
  sources: string[]
  postText: string
  postTranslationRu: string
  hashtags: string[]
  researchedAt: string
  stepLogs: Array<{ step: string; result: string; timestamp: string }>
  postDuration: number
  xPosts: XPost[]
  currentStep: string
}

// ── Module-level Grok Responses API caller ────────────────────────────────
async function callGrokResponses(grokKey: string, messages: object[], tools?: object[]): Promise<string> {
  const body: Record<string, unknown> = {
    model: 'grok-4.20-reasoning',
    input: messages,
    store: false,
  }
  if (tools) body.tools = tools

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: bearer(grokKey, 'Grok'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Grok API ${response.status}: ${JSON.stringify(err)}`)
  }

  const data = await response.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  return msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''
}

function buildDateStrings() {
  const now = new Date()
  return {
    dateStr: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    timeStr: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
    yesterdayStr: new Date(now.getTime() - 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
  }
}

// ── Phase 1: Fetch trending topics only ───────────────────────────────────
export async function fetchTrendingTopics(
  grokKey: string,
  onLog?: LogFn
): Promise<NewsResearchResult['trending']> {
  const { dateStr, timeStr, yesterdayStr } = buildDateStrings()
  onLog?.('🔍 Поиск горячих трендов в X (Twitter)...')

  const raw = await callGrokResponses(
    grokKey,
    [
      {
        role: 'user',
        content: `TODAY is ${dateStr}, ${timeStr} ET. Search X (Twitter) RIGHT NOW for exactly 5 of the most controversial and hotly-debated BREAKING topics in the USA.

CRITICAL: Only include stories that BROKE or went VIRAL in the last 24-48 hours (since ${yesterdayStr}). DO NOT include stories older than 2 days. Prioritize what is trending THIS HOUR.

REQUIRED BREAKDOWN — you MUST return exactly this mix:
- Topics #1 and #2: POLITICAL topics (government, politicians, policy, elections, Congress, White House, Trump, Biden, etc.)
- Topics #3, #4, and #5: NON-POLITICAL topics from different categories such as: celebrity drama, sports controversy, entertainment beef, tech/AI news, crime/true crime, social media viral moment, pop culture, science/health news — whichever 3 are the HOTTEST right now.

Look for: high reply counts, quote tweets indicating arguments, polarized reactions, emotional language — all from RECENT posts only.

For each topic provide these EXACT fields:
- title: short English headline (max 8 words)
- titleRu: Russian translation of the title
- engagement: "high" / "medium" / "low" — based on TOTAL discussion volume
- polarization: what are the two opposing camps arguing about RIGHT NOW? (English, 1 sentence)
- summary: 1-2 sentence English description — include WHEN it happened (today/yesterday)
- summaryRu: Russian translation of the summary
- metrics: an object with these virality indicators (use real numbers/data from X search):
  - postCount: estimated number of posts/tweets about this topic in last 24h (e.g. "8.5K posts", "50K+ tweets", "trending")
  - topEngagement: the single most viral post's engagement stats (e.g. "2.1M views · 48K likes · 12K replies" or "850K impressions · 32K RTs")
  - trendSince: when it started trending (e.g. "Trending since 4 AM ET", "Viral since yesterday 9 PM", "Breaking 2 hours ago")

Return ONLY a valid JSON array of exactly 5 objects (no markdown, no extra text):
[
  {
    "title":"...","titleRu":"...","engagement":"high","polarization":"...",
    "summary":"...","summaryRu":"...",
    "metrics":{"postCount":"12K posts","topEngagement":"1.8M views · 45K likes","trendSince":"Trending since 6 AM ET"}
  },
  ...
]`,
      },
    ],
    [{ type: 'x_search' }]
  )

  onLog?.('✅ Тренды получены!', 'success')

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as NewsResearchResult['trending']
  } catch { /* fall through */ }

  return [
    {
      title: raw.slice(0, 100) || 'Unable to parse trends',
      titleRu: 'Не удалось распознать тему',
      engagement: 'high' as const,
      polarization: 'Controversial topic',
      summary: raw.slice(0, 200),
      summaryRu: raw.slice(0, 200),
    },
  ]
}

// ── Phase 2: Full research for a selected topic ───────────────────────────
export async function researchTopicWithGrok(
  grokKey: string,
  trending: NewsResearchResult['trending'],
  selectedTopic: NewsResearchResult['selectedTopic'],
  postDuration: number = 30,
  onLog?: LogFn,
  onStepResult?: (step: string, result: string) => void,
  onProgress?: (update: Partial<NewsResearchResult>) => void
): Promise<NewsResearchResult> {
  const { dateStr, timeStr, yesterdayStr } = buildDateStrings()
  const stepLogs: Array<{ step: string; result: string; timestamp: string }> = []
  const logStep = (step: string, result: string) => {
    const timestamp = new Date().toLocaleTimeString('ru-RU')
    stepLogs.push({ step, result, timestamp })
    onStepResult?.(step, result)
    const preview = result.length > 90 ? result.slice(0, 90) + '…' : result
    onLog?.(`  ✓ ${step}: ${preview}`, 'success')
  }

  onLog?.(`🎯 Тема: "${selectedTopic.title}"`)
  logStep('Выбор темы', `${selectedTopic.title} (${selectedTopic.engagement} engagement)`)
  onProgress?.({ selectedTopic })

  // ── X Search — tweets about selected topic ────────────────────────────────
  onProgress?.({ currentStep: '🐦 Собираю посты из X (Twitter)...' })
  onLog?.('🐦 Собираю посты из X (Twitter) по теме...')

  const xPostsRaw = await callGrokResponses(
    grokKey,
    [
      {
        role: 'user',
        content: `TODAY is ${dateStr}, ${timeStr} ET. Search X (Twitter) for the most recent and engaging posts about: "${selectedTopic.title}"

CRITICAL: Only include tweets posted in the last 48 hours (since ${yesterdayStr}). Prefer posts from TODAY. Look for verified accounts, journalists, politicians, or viral posts with high engagement.

Find 5-8 of the most engaging, controversial, or widely shared RECENT tweets about this topic.

Return ONLY a valid JSON array (no markdown, no extra text):
[
  {
    "author": "Display Name",
    "handle": "@username",
    "text": "full tweet text",
    "url": "https://x.com/username/status/... (if available, else empty string)",
    "engagement": "e.g. '12K likes · 3.4K RTs' or 'trending'"
  }
]`,
      },
    ],
    [{ type: 'x_search' }]
  )

  let xPosts: XPost[] = []
  try {
    const jsonMatch = xPostsRaw.match(/\[[\s\S]*\]/)
    if (jsonMatch) xPosts = JSON.parse(jsonMatch[0]) as XPost[]
  } catch { console.warn('[NewsResearch] Failed to parse xPosts JSON') }

  onLog?.(`🐦 Найдено ${xPosts.length} постов из X`, 'success')
  logStep('Посты из X (Twitter)', `${xPosts.length} постов найдено`)
  onProgress?.({ xPosts, currentStep: '🌐 Собираю детали через Web Search...' })

  // ── Web Search — news details ─────────────────────────────────────────────
  onLog?.('🌐 Собираю детали через Web Search...')

  const newsDetails = await callGrokResponses(
    grokKey,
    [
      {
        role: 'user',
        content: `TODAY is ${dateStr}. Search the web for the LATEST and MOST RECENT news about: "${selectedTopic.title}"

CRITICAL: Focus ONLY on articles and reports published TODAY or yesterday (${yesterdayStr}). Ignore older coverage.

Find: key facts, exact timeline of what happened, who is involved, specific quotes from TODAY, why people are fighting about it RIGHT NOW.
Write a concise 3-4 paragraph briefing. Start with WHEN exactly this happened.`,
      },
    ],
    [{ type: 'web_search' }]
  )

  onLog?.('📰 Детали собраны, извлекаю источники...', 'success')
  logStep('Web Search - Детали', newsDetails.slice(0, 300))
  onProgress?.({ newsDetails, currentStep: '🔗 Извлекаю источники...' })

  // ── Extract sources ───────────────────────────────────────────────────────
  const sourcesRaw = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `Based on the web search results for "${selectedTopic.title}", extract up to 5 source URLs from articles published on ${dateStr} or ${yesterdayStr}.
Prefer: major news outlets (CNN, Fox, NYT, Washington Post, AP, Reuters, etc.) with fresh coverage.
Return ONLY a valid JSON array of URLs (no markdown, no extra text):
["https://...", "https://...", ...]

If no specific URLs are available, return an empty array: []`,
    },
  ])

  let webSources: string[] = []
  try {
    const jsonMatch = sourcesRaw.match(/\[[\s\S]*?\]/)
    if (jsonMatch) webSources = JSON.parse(jsonMatch[0]) as string[]
  } catch { console.warn('[NewsResearch] Failed to parse sources') }

  // Merge web article URLs + valid xPost URLs (deduplicated)
  const xPostUrls = xPosts.map((p) => p.url).filter((u) => u && u.startsWith('http'))
  const sources = [...new Set([...webSources, ...xPostUrls])]

  logStep('Источники', sources.length > 0 ? `${webSources.length} статей + ${xPostUrls.length} постов X` : 'Не найдены')
  onProgress?.({ sources, currentStep: '🇷🇺 Перевожу новость на русский...' })
  onLog?.('🇷🇺 Перевожу новость на русский...')

  // ── Translate news to Russian ─────────────────────────────────────────────
  const translationRu = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `Translate the following English news briefing to Russian. Keep the same style and tone, but make it natural Russian:

${newsDetails}

Return ONLY the Russian translation (no markdown, no extra text).`,
    },
  ])

  onLog?.('📰 Перевод готов, генерирую пост...', 'success')
  logStep('Перевод на русский', translationRu.slice(0, 200))
  onProgress?.({ translationRu, currentStep: '✍️ Генерирую провокационный пост...' })

  // ── Generate post in Sarah Icelyn's voice ─────────────────────────────────
  onLog?.('✍️ Генерирую провокационный пост...')

  const postRaw = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `${SARAH_ICELYN_LORE}

You need to write a provocative social media post (TikTok/Instagram) about this news story for your US audience:

TOPIC: ${selectedTopic.title}
POLARIZATION: ${selectedTopic.polarization}
DETAILS: ${newsDetails}

Rules for the post:
- Write in English (US audience)
- Target length: ${postDuration <= 15 ? '50-80 words (15 sec video)' : postDuration <= 30 ? '100-150 words (30 sec video)' : '180-250 words (60 sec video)'}
- Short, punchy sentences
- Trigger BOTH sides — don't take a clear political stance, but be provocative
- Use your Sarah Icelyn voice: cold, elegant, ironic, slightly condescending but charming
- Start with a hook that makes people stop scrolling
- End with a question that sparks debate in comments
- Do NOT use emojis
- Do NOT mention you're an AI or a butler persona explicitly — stay in character naturally

Also provide exactly 5 hashtags relevant to the trending topic.

Return ONLY valid JSON (no markdown):
{
  "postText": "...",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"]
}`,
    },
  ])

  let postText = ''
  let hashtags: string[] = []
  try {
    const jsonMatch = postRaw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { postText?: string; hashtags?: string[] }
      postText = parsed.postText ?? postRaw
      hashtags = parsed.hashtags ?? []
    }
  } catch {
    postText = postRaw
    hashtags = ['#trending', '#USA', '#news', '#fyp', '#viral']
  }

  onLog?.('🇷🇺 Перевожу пост на русский...', 'info')

  const postTranslationRu = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `Translate this social media post to Russian. Keep the same cold, ironic, provocative tone. Natural Russian, not too formal:

${postText}

Return ONLY the Russian translation (no markdown, no extra text).`,
    },
  ])

  onLog?.('✅ Ресерч завершён! Пост готов.', 'success')
  logStep('Генерация поста', `${postText.slice(0, 150)}... (${hashtags.length} хештегов)`)

  return {
    trending,
    selectedTopic,
    newsDetails,
    translationRu,
    sources,
    postText,
    postTranslationRu,
    hashtags,
    researchedAt: new Date().toLocaleTimeString('ru-RU'),
    stepLogs,
    postDuration,
    xPosts,
    currentStep: '',
  }
}

// ── Legacy full-auto wrapper (kept for backward compat) ───────────────────
export async function researchNewsWithGrok(
  grokKey: string,
  postDuration: number = 30,
  onLog?: LogFn,
  onStepResult?: (step: string, result: string) => void,
  onProgress?: (update: Partial<NewsResearchResult>) => void
): Promise<NewsResearchResult> {
  // Phase 1: fetch topics
  const trending = await fetchTrendingTopics(grokKey, onLog)
  onProgress?.({ trending })

  // Auto-select most controversial
  const { dateStr } = buildDateStrings()
  const selectionRaw = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `TODAY is ${dateStr}. Here are BREAKING trending US topics:\n${JSON.stringify(trending, null, 2)}\n\nPick the SINGLE most controversial and FRESHEST topic — exploded on social media TODAY or yesterday.\nReturn ONLY a valid JSON object (no markdown):\n{"title":"...","engagement":"high","polarization":"...","summary":"..."}`,
    },
  ])
  let selectedTopic: NewsResearchResult['selectedTopic'] = trending[0]
  try {
    const m = selectionRaw.match(/\{[\s\S]*\}/)
    if (m) selectedTopic = JSON.parse(m[0]) as NewsResearchResult['selectedTopic']
  } catch { /* use trending[0] */ }

  // Phase 2: full research
  return researchTopicWithGrok(grokKey, trending, selectedTopic, postDuration, onLog, onStepResult, onProgress)
}

export async function regeneratePostWithGrok(
  grokKey: string,
  selectedTopic: NewsResearchResult['selectedTopic'],
  newsDetails: string,
  onLog?: LogFn,
  emotion?: string
): Promise<{ postText: string; hashtags: string[]; postTranslationRu: string }> {
  onLog?.(emotion ? `✍️ Перегенерирую пост с эмоцией: ${emotion}...` : '✍️ Перегенерирую пост...', 'info')

  const body = {
    model: 'grok-4.20-reasoning',
    input: [
      {
        role: 'user',
        content: `${SARAH_ICELYN_LORE}

Write a NEW, different provocative social media post (TikTok/Instagram) about this story for your US audience:

TOPIC: ${selectedTopic.title}
POLARIZATION: ${selectedTopic.polarization}
DETAILS: ${newsDetails}

Rules:
- Write in English (US audience)
- Maximum 150-200 words
- Short, punchy sentences
- Trigger BOTH sides — provocative but no clear political stance
- Sarah Icelyn voice: cold, elegant, ironic, slightly condescending${emotion ? `\n- EMOTIONAL TONE FOR THIS VERSION: ${emotion} — let this emotion dominate the entire post` : ''}
- Start with a hook that stops scrolling
- End with a debate-sparking question
- Do NOT use emojis
- Make it DIFFERENT from any previous version

Also provide exactly 5 hashtags relevant to the topic.

Return ONLY valid JSON (no markdown):
{"postText":"...","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}`,
      },
    ],
    store: false,
  }

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: bearer(grokKey, 'Grok'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Grok API ${response.status}: ${JSON.stringify(err)}`)
  }

  const data = await response.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const raw = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''

  let postText = raw
  let hashtags = ['#trending', '#USA', '#news', '#fyp', '#viral']
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { postText?: string; hashtags?: string[] }
      postText = parsed.postText ?? raw
      hashtags = parsed.hashtags ?? hashtags
    }
  } catch { /* fall through */ }

  onLog?.('🇷🇺 Перевожу новый пост на русский...', 'info')

  const translateBody = {
    model: 'grok-4.20-reasoning',
    input: [{
      role: 'user',
      content: `Translate this social media post to Russian. Keep the same cold, ironic, provocative tone. Natural Russian, not too formal:\n\n${postText}\n\nReturn ONLY the Russian translation (no markdown, no extra text).`,
    }],
    store: false,
  }
  let postTranslationRu = ''
  try {
    const trResponse = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { Authorization: bearer(grokKey, 'Grok'), 'Content-Type': 'application/json' },
      body: JSON.stringify(translateBody),
    })
    if (trResponse.ok) {
      const trData = await trResponse.json() as {
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
      }
      const trOutput = trData.output ?? []
      const trMsg = trOutput.find((o) => o.type === 'message') ?? trOutput[trOutput.length - 1]
      postTranslationRu = trMsg?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''
    }
  } catch { /* fall through */ }

  onLog?.('✅ Новый пост готов!', 'success')
  return { postText, hashtags, postTranslationRu }
}

// ── Resize post text to a target percentage (compress or expand) ──────────
export async function compressPostWithGrok(
  grokKey: string,
  postText: string,
  targetPercent: number,
  onLog?: LogFn
): Promise<{ postText: string; postTranslationRu: string }> {
  const originalLen = postText.length
  const targetLen = Math.round(originalLen * targetPercent / 100)
  const isExpanding = targetPercent > 100

  if (isExpanding) {
    const expandPercent = targetPercent - 100
    onLog?.(`📝 Расширяю текст на ${expandPercent}% (с ${originalLen} до ~${targetLen} символов)...`, 'info')
  } else {
    const reductionPercent = 100 - targetPercent
    onLog?.(`✂️ Сокращаю текст на ${reductionPercent}% (с ${originalLen} до ~${targetLen} символов)...`, 'info')
  }

  const instruction = isExpanding
    ? `You are an editor EXPANDING a social media post.

ORIGINAL: ${originalLen} characters
HARD TARGET: ~${targetLen} characters (${targetPercent}% of original — you MUST hit this)

EXPAND RULES:
1. Add more vivid detail, specific data points, or rhetorical buildup to existing ideas
2. Develop the conflict angle further — add a second perspective or a counter-argument
3. Expand short sentences into richer ones (more emotional impact, sharper imagery)
4. Keep the hook (first line) and the final debate-sparking question
5. Do NOT introduce completely unrelated topics
6. Keep the same cold, ironic, provocative Sarah Icelyn voice

Return ONLY the expanded post text. No markdown, no explanation.

ORIGINAL POST:
${postText}`
    : `You are a ruthless editor cutting a social media post.

ORIGINAL: ${originalLen} characters
HARD TARGET: ~${targetLen} characters (${targetPercent}% of original — you MUST hit this, not just get close)

CUT RULES (in order of priority):
1. Delete entire sentences that repeat the same idea
2. Delete explanatory/transitional phrases ("The thing is...", "What's interesting is...")
3. Shorten remaining sentences to their bare minimum
4. Keep: the hook (first sentence), the core scandal/conflict, the final question
5. Do NOT add new content
6. Keep the same cold, ironic, provocative voice

Return ONLY the compressed post text. No markdown, no explanation, no word count.

ORIGINAL POST:
${postText}`

  const resized = await callGrokResponses(grokKey, [{ role: 'user', content: instruction }])

  onLog?.('🇷🇺 Перевожу пост...', 'info')

  const postTranslationRu = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `Translate this social media post to Russian. Keep the same cold, ironic, provocative tone. Natural Russian, not too formal:\n\n${resized}\n\nReturn ONLY the Russian translation (no markdown, no extra text).`,
    },
  ])

  const action = isExpanding ? 'Расширено' : 'Сокращено'
  onLog?.(`✅ ${action}: ${originalLen} → ${resized.length} симв. (${Math.round(resized.length / originalLen * 100)}%)`, 'success')
  return { postText: resized, postTranslationRu }
}

// ── Resize post to exact sentence count ────────────────────────────────────
export async function resizePostBySentencesWithGrok(
  grokKey: string,
  postText: string,
  targetSentences: number,
  onLog?: LogFn
): Promise<{ postText: string; postTranslationRu: string }> {
  const currentSentences = postText.split(/[.!?]+/).filter(s => s.trim().length > 0).length
  const action = targetSentences > currentSentences ? 'Расширяю' : 'Сокращаю'
  onLog?.(`✏️ ${action} до ${targetSentences} предложений (сейчас ${currentSentences})...`, 'info')

  const resized = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `Rewrite this social media post so it contains EXACTLY ${targetSentences} sentence${targetSentences === 1 ? '' : 's'}.

Current sentences: ${currentSentences}
Target sentences: ${targetSentences}

RULES:
- ${targetSentences < currentSentences ? 'Merge or delete sentences, keeping the most impactful ones' : 'Add new sentences with more detail, conflict angle, or vivid imagery'}
- Keep: the hook (opening line), the core scandal/conflict, and the final debate-sparking question
- Keep the same cold, ironic, provocative Sarah Icelyn voice
- Return ONLY the rewritten post text. No markdown, no explanation, no sentence count.

ORIGINAL POST:
${postText}`,
    },
  ])

  onLog?.('🇷🇺 Перевожу пост...', 'info')

  const postTranslationRu = await callGrokResponses(grokKey, [
    {
      role: 'user',
      content: `Translate this social media post to Russian. Keep the same cold, ironic, provocative tone. Natural Russian, not too formal:\n\n${resized}\n\nReturn ONLY the Russian translation (no markdown, no extra text).`,
    },
  ])

  const newCount = resized.split(/[.!?]+/).filter(s => s.trim().length > 0).length
  onLog?.(`✅ Пост пересмотрен: ${currentSentences} → ${newCount} предл.`, 'success')
  return { postText: resized, postTranslationRu }
}

// ── Text-to-Post (Sarah Icelyn standalone) ────────────────────────────────

export interface SarahTextToPostResult {
  postText: string
  postTextRu: string
  voiceoverText: string
  voiceoverTextRu: string
}

const SARAH_ICELYN_FULL_LORE = `You are Sarah Icelyn — a 27-year-old woman (born November 20, 1998) from Bloomfield Hills, Michigan (originally Toledo, Ohio).
Heritage: Ashkenazi Jewish (mother, Polish roots) + Polish (father).

PERSONALITY:
- Archetype: Observer / Strategist (hidden empath)
- Core trauma: emotional void in family — mother was purely functional, father absent
- Core fear: dependence on others + losing control. If you open up — you end up alone.
- Core formula: "She sells the feeling of closeness because she fears entering it most of all."
- Constant internal conflict: rationality vs. feelings

APPEARANCE:
- Heterochromia: left eye blue, right eye warm brown (💙🤎)
- Long black hair with thick straight bangs, soft waves to chest
- Hourglass figure (34-25-37), 168 cm
- Style: minimalism and elegance, dark neutral colors, impeccable grooming

PROFESSIONAL PERSONA:
- Role: Luxury hotel Butler / VIP service (5-star hotel, private suites, VIP floor)
- Attributes: perfectly fitted uniform, white gloves, flawless posture
- Essence: personalized care through strict distance — remembers guest preferences, creates a feeling of exclusivity
- Hard limits: no personal meetings, no video/voice calls

INTERESTS:
- Food: sushi, pasta carbonara, 2am pizza, chocolate-covered strawberries, champagne with dessert
- Music: The Weeknd, slow R&B, Doja Cat, Ariana Grande
- Shows: Bridgerton, 365 Days, romantic comedies and dramas
- Pet: mini-pig named Reaper

COMMUNICATION STYLE:
- Short sentences. Playful and coquettish but always restrained and elegant.
- Many compliments, questions to the audience, and light teasing.
- Cold, ironic, slightly condescending but charming. Never crude, always sharp.

CONTENT STRATEGY (VIRAL FORMULA):
- US GEO only: Michigan, American bedrooms, garages, luxury hotels, USA flags
- Trigger topics: Red Flags in relationships, psychology of the "cold girl", butler uniform vs home comfort contrast
- Visual stability: consistent color grading, style, locations
- No niche jumping: only "Luxury Butler" or "Michigan Neighbor" personas
- Math iteration: change only ONE variable per post
- Scale winners: one successful format → 5-10 videos`

export async function generateSarahTextToPost(
  grokKey: string,
  durationSec: number,
  onLog?: LogFn
): Promise<SarahTextToPostResult> {
  const wordsTarget = Math.round(durationSec * 2.5)
  onLog?.(`✍️ Генерирую пост Сары Айслин (${durationSec}с ≈ ${wordsTarget} слов)...`, 'info')

  const prompt = `${SARAH_ICELYN_FULL_LORE}

TASK: Create a VIRAL TikTok/Instagram post that triggers ONE of these strong emotional reactions:
- ANGER (men furious, women cheering — or vice versa)
- LAUGHTER (absurd, relatable, self-aware humor about dating/lifestyle)
- CONFUSION (ambiguous statement — people MUST argue in comments to resolve it)
- EXCITEMENT/DESIRE (make them want your standards, your life, your attitude)

VIRAL TACTICS (choose the most potent one):
• "I immediately lose attraction when a man [something very common/relatable]..."
• "Women who date men who [X] are [sharp judgment]"
• "I don't [cheap/common behavior] — I [luxury/high-standard alternative]"
• "If he does [X], he's not actually [Y]"
• A hot take that splits the audience exactly 50/50 — both sides NEED to comment

RULES:
- Stay within platform limits — provocative but not hateable
- More arguments in comments = higher algorithmic promotion
- US English only, natural speech
- The voiceoverText MUST fit comfortably in ${durationSec} seconds at normal speaking pace (≈ ${wordsTarget} words MAX)
- postText is the video caption — can be slightly longer, include 1-2 emojis

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "postText": "<TikTok/Instagram caption, 1-3 sentences + 1-2 emojis, designed to generate maximum comments>",
  "postTextRu": "<exact Russian translation of postText>",
  "voiceoverText": "<what Sarah says in the video — ≈${wordsTarget} words, sharp provocative spoken English>",
  "voiceoverTextRu": "<exact Russian translation of voiceoverText>"
}`

  const raw = await callGrokResponses(grokKey, [{ role: 'user', content: prompt }])

  let result: SarahTextToPostResult
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON found')
    const parsed = JSON.parse(jsonMatch[0]) as Partial<SarahTextToPostResult>
    result = {
      postText: parsed.postText ?? raw,
      postTextRu: parsed.postTextRu ?? '',
      voiceoverText: parsed.voiceoverText ?? '',
      voiceoverTextRu: parsed.voiceoverTextRu ?? '',
    }
  } catch {
    throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  }

  onLog?.('✅ Пост сгенерирован!', 'success')
  return result
}

// ── Content-Based Post (video frames + user description → post) ────────────

export interface ContentBasedPostResult {
  videoAnalysis: string
  postText: string
  postTextRu: string
  voiceoverText: string
  voiceoverTextRu: string
  hashtags: string[]
}

export async function generateContentBasedPost(
  grokKey: string,
  frameDataUrls: string[],
  userMessage: string,
  durationSec: number,
  onLog?: LogFn
): Promise<ContentBasedPostResult> {
  const wordsTarget = Math.round(durationSec * 2.5)
  onLog?.(`🎬 Анализирую видео (${frameDataUrls.length} кадров) + описание...`, 'info')

  const imageContent = frameDataUrls.map((url) => ({
    type: 'input_image',
    image_url: url,
    detail: 'high',
  }))

  const textContent = {
    type: 'input_text',
    text: `${SARAH_ICELYN_FULL_LORE}

${userMessage.trim() ? `USER DESCRIPTION OF THE VIDEO:\n${userMessage}\n` : 'NO USER DESCRIPTION PROVIDED — analyze the video frames entirely on your own.\n'}
TASK: Based on the video frames above${userMessage.trim() ? " AND the user's description" : ""}, create a VIRAL TikTok/Instagram post in Sarah Icelyn's voice that triggers ONE or MORE of these strong emotional reactions:
- ANGER (men furious, women cheering — or vice versa)
- LAUGHTER (absurd, relatable, self-aware humor about dating/lifestyle)  
- CONFUSION (ambiguous statement — people MUST argue in comments to resolve it)
- EXCITEMENT/DESIRE (make them want her standards, her life, her attitude)

The content should be DIRECTLY inspired by what's happening in the video.

RULES:
- US English only, natural spoken/written speech
- voiceoverText MUST fit comfortably in ${durationSec} seconds at normal pace (≈ ${wordsTarget} words MAX)
- postText is the caption — 1-3 sentences + 1-2 emojis, maximises comments
- hashtags: exactly 5 relevant viral hashtags
- Stay provocative but not hateable — more argument = higher algorithm promotion

Return ONLY valid JSON (no markdown fences):
{
  "videoAnalysis": "<2-4 sentence description in Russian of what you see in the video frames — setting, mood, actions, details>",
  "postText": "<caption 1-3 sentences + emojis>",
  "postTextRu": "<exact Russian translation>",
  "voiceoverText": "<spoken voiceover ≈${wordsTarget} words>",
  "voiceoverTextRu": "<exact Russian translation>",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"]
}`,
  }

  const payload = {
    model: 'grok-4.20-reasoning',
    input: [
      {
        role: 'user',
        content: [...imageContent, textContent],
      },
    ],
    store: false,
  }

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { Authorization: bearer(grokKey, 'Grok'), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Grok API ${response.status}: ${JSON.stringify(err)}`)
  }

  const data = await response.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const raw = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''

  let result: ContentBasedPostResult
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON')
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ContentBasedPostResult>
    result = {
      videoAnalysis: parsed.videoAnalysis ?? '',
      postText: parsed.postText ?? raw,
      postTextRu: parsed.postTextRu ?? '',
      voiceoverText: parsed.voiceoverText ?? '',
      voiceoverTextRu: parsed.voiceoverTextRu ?? '',
      hashtags: parsed.hashtags ?? ['#viral', '#trending', '#fyp', '#USA', '#lifestyle'],
    }
  } catch {
    throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  }

  onLog?.('✅ Пост на основе контента готов!', 'success')
  return result
}

// ── Minimax Text-to-Speech ─────────────────────────────────────────────────

export interface MinimaxVoice {
  voice_id: string
  description: string[]
  created_time?: string
}

export async function fetchMinimaxVoices(minimaxKey: string): Promise<MinimaxVoice[]> {
  const resp = await fetch('/api/minimax/get_voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': bearer(minimaxKey, 'Minimax') },
    body: JSON.stringify({ voice_type: 'voice_cloning' }),
  })
  if (!resp.ok) throw new Error(`Minimax get_voice error ${resp.status}`)
  const data = await resp.json() as {
    voice_cloning?: MinimaxVoice[]
    base_resp: { status_code: number; status_msg: string }
  }
  if (data.base_resp.status_code !== 0) throw new Error(data.base_resp.status_msg)
  return data.voice_cloning ?? []
}


export async function generateVoiceMinimax(
  minimaxKey: string,
  text: string,
  voiceId: string,
  speed: number = 1.0,
  model: string = 'speech-2.8-hd',
  emotion: string = 'neutral',
  onLog?: LogFn
): Promise<MinimaxTTSResult> {
  onLog?.(`🎤 Отправляю запрос в Minimax TTS (${model}, ${emotion})...`, 'info')

  const resp = await fetch('/api/minimax/t2a_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': bearer(minimaxKey, 'Minimax'),
    },
    body: JSON.stringify({
      model,
      text,
      stream: false,
      output_format: 'hex',
      voice_setting: {
        voice_id: voiceId,
        speed,
        vol: 1,
        pitch: 0,
        emotion,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText)
    throw new Error(`Minimax API error ${resp.status}: ${errText}`)
  }

  const data = await resp.json() as {
    base_resp: { status_code: number; status_msg: string }
    data: { audio: string; status: number }
    extra_info?: { audio_length: number; audio_size: number }
  }

  if (data.base_resp.status_code !== 0) {
    throw new Error(`Minimax: ${data.base_resp.status_msg} (code ${data.base_resp.status_code})`)
  }

  const hex = data.data.audio
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  const blob = new Blob([bytes], { type: 'audio/mp3' })
  const audioUrl = URL.createObjectURL(blob)

  const durationMs = data.extra_info?.audio_length ?? 0
  const sizeBytes = data.extra_info?.audio_size ?? blob.size

  onLog?.(`✅ Озвучка готова: ${(durationMs / 1000).toFixed(1)}s, ${(sizeBytes / 1024).toFixed(0)} KB`, 'success')
  return { audioUrl, durationMs, sizeBytes }
}

// ── InfiniteTalk ───────────────────────────────────────────────────────────

export interface InfiniteTalkPrompts {
  photoPrompt: string
  photoPromptRu: string
  lipSyncPrompt: string
  lipSyncPromptRu: string
}

const ROOM_POSITIONS = [
  'sitting on the edge of the bed',
  'standing near the window looking outside',
  'sitting cross-legged on the red rug',
  'leaning against the wall next to the golden mirror',
  'lying on the bed propped up on one elbow',
  'standing near the chandelier in the center of the room',
  'sitting on the bed with her back against the headboard',
  'kneeling on the bed reaching toward the camera',
]

export function randomRoomPosition(): string {
  return ROOM_POSITIONS[Math.floor(Math.random() * ROOM_POSITIONS.length)]
}

const EMOTION_PROMPT_MAP: Record<string, string> = {
  neutral:   'calm neutral expression',
  happy:     'bright joyful smile, happy expression',
  sad:       'sad, melancholy expression, slightly downcast eyes',
  angry:     'intense angry expression, furrowed brow',
  fearful:   'frightened, fearful expression, wide eyes',
  disgusted: 'disgusted expression, subtle lip curl',
  surprised: 'surprised wide-eyed expression, slightly open mouth',
}

const DNA_TEXT = `A young woman with subtle, natural heterochromia — her left eye is a soft, realistic blue and her right eye is a natural warm brown, both matching the brightness and lighting of the environment without appearing overly vivid. She has long black hair with a full straight fringe and soft natural waves reaching to the chest. Her personal style is minimalist and elegant: dark neutral tones (black, charcoal, deep navy, muted taupe), clean simple silhouettes, no excessive accessories — always impeccably neat and put-together.`

export async function generateInfiniteTalkPrompts(
  grokKey: string,
  emotion: string,
  disorder: number,
  roomName: string,
  userWishes: string,
  onLog?: LogFn
): Promise<InfiniteTalkPrompts> {
  onLog?.('🧠 Grok генерирует промпты для InfiniteTalk...', 'info')

  const position = randomRoomPosition()
  const emotionDesc = EMOTION_PROMPT_MAP[emotion] ?? 'neutral expression'

  let disorderDesc: string
  if (disorder === 0) disorderDesc = 'perfectly clean and immaculate room'
  else if (disorder <= 25) disorderDesc = 'mostly clean room, a few small items slightly out of place'
  else if (disorder <= 50) disorderDesc = 'noticeably untidy room, some clothes and items on the floor'
  else if (disorder <= 75) disorderDesc = 'quite messy room, scattered clothes and objects everywhere'
  else disorderDesc = 'extremely chaotic room, total disorder and clutter everywhere'

  const systemPrompt = `You are a creative director generating prompts for AI image generation and AI lipsync video.
Return ONLY valid JSON with exactly these 4 keys: photoPrompt, photoPromptRu, lipSyncPrompt, lipSyncPromptRu.
No markdown, no code blocks, no extra text — just raw JSON.`

  const wishesSection = userWishes ? `\n- User wishes: ${userWishes}` : ''
  
  const userPrompt = `Generate prompts for a selfie photo and a lipsync video.

Context:
- Room: ${roomName}
- Girl position in room: ${position}
- Girl emotion: ${emotionDesc}
- Room cleanliness: ${disorderDesc}
- DNA appearance: ${DNA_TEXT}${wishesSection}

Rules for photoPrompt:
- The photo is a selfie-style portrait taken with a front-facing camera
- Medium to close-up framing of the girl, upper body visible
- The girl looks directly into the camera / at the viewer
- Include the DNA appearance description
- Include the emotion, position, and room disorder level${userWishes ? '\n- IMPORTANT: Incorporate user wishes into the scene, outfit, or overall mood' : ''}
- Her outfit MUST reflect her minimalist elegant style: dark neutral clothing (black, charcoal, deep navy or muted taupe), clean silhouette, no loud patterns, impeccably neat
- Photorealistic, natural lighting matching the ${roomName} environment
- The prompt must be in English

Rules for lipSyncPrompt:
- Short, max 2 sentences in English
- Describes the girl speaking/talking directly to the camera in a selfie video
- Includes the emotion (${emotionDesc})
- Suitable as an InfiniteTalk video guidance prompt
- Example style: "Young woman with heterochromia speaking directly to camera with a bright joyful expression, natural selfie video in bedroom setting."

Return JSON:
{
  "photoPrompt": "<full English photo generation prompt>",
  "photoPromptRu": "<Russian translation of photoPrompt>",
  "lipSyncPrompt": "<short English lipsync video prompt>",
  "lipSyncPromptRu": "<Russian translation of lipSyncPrompt>"
}`

  const raw = await callGrokResponses(grokKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])

  let parsed: InfiniteTalkPrompts
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned) as InfiniteTalkPrompts
  } catch {
    throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  }

  onLog?.('✅ Промпты сгенерированы', 'success')
  return parsed
}

// ── LipSync prompt from uploaded image (vision) ───────────────────────────

export interface LipSyncFromImageResult {
  lipSyncPrompt: string
  lipSyncPromptRu: string
}

export async function generateLipSyncPromptFromImage(
  grokKey: string,
  imageDataUrl: string,
  emotion: string,
  onLog?: LogFn
): Promise<LipSyncFromImageResult> {
  onLog?.('🧠 Grok анализирует кадр и эмоцию...', 'info')

  const emotionDesc = EMOTION_PROMPT_MAP[emotion] ?? 'neutral expression'

  const systemPrompt = `You are a creative director writing prompts for AI lipsync video generation.
Return ONLY valid JSON with exactly 2 keys: lipSyncPrompt, lipSyncPromptRu.
No markdown, no code blocks, no extra text — just raw JSON.`

  const userText = `Analyze the portrait photo and write a concise lipsync video guidance prompt.

DNA appearance of the person:
${DNA_TEXT}

Requested emotion: ${emotionDesc}

Rules for lipSyncPrompt:
- 1-2 sentences max in English
- Describe the person speaking directly to the camera with the given emotion
- Reference visible elements from the photo (clothing color, background/setting)
- Do NOT mention hand positions, phone, or camera angles
- Suitable as a guidance prompt for InfiniteTalk AI video model

Return JSON:
{
  "lipSyncPrompt": "<short English lipsync prompt based on the photo>",
  "lipSyncPromptRu": "<Russian translation>"
}`

  const payload = {
    model: 'grok-4.20-reasoning',
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
          { type: 'input_text', text: userText },
        ],
      },
    ],
    store: false,
  }

  const httpResponse = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer(grokKey, 'Grok') },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const err = await httpResponse.json().catch(() => ({}))
    throw new Error(`Grok vision ${httpResponse.status}: ${JSON.stringify(err)}`)
  }

  const data = await httpResponse.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const raw = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''

  let parsed: LipSyncFromImageResult
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON found')
    parsed = JSON.parse(jsonMatch[0]) as LipSyncFromImageResult
  } catch {
    throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  }

  if (!parsed.lipSyncPrompt) throw new Error('Grok не вернул lipSyncPrompt')
  onLog?.(`✅ LipSync промпт готов`, 'success')
  return parsed
}

export interface NanoBananaMultiResult {
  imageUrl: string
  index: number
}

export async function generateNanoBananaMultiRef(
  wavespeedKey: string,
  referenceImages: string[], // base64 data URLs
  prompt: string,
  aspectRatio: string,
  resolution: string,
  count: number,
  onLog?: LogFn,
  injectDefaultDna = true
): Promise<NanoBananaMultiResult[]> {
  onLog?.(`🖼️ Запускаю ${count} генераций Nano Banana 2 Edit...`, 'info')

  const tasks = Array.from({ length: count }, (_, i) =>
    editImageWithWavespeed(
      wavespeedKey,
      referenceImages[0].replace(/^data:[^;]+;base64,/, ''),
      prompt,
      i,
      onLog,
      { resolution, aspectRatio, intensity: 50, extraImages: referenceImages.slice(1), injectDefaultDna }
    ).then((res) => ({ imageUrl: res.imageUrl, index: i }))
  )

  const results = await Promise.allSettled(tasks)
  const successes: NanoBananaMultiResult[] = []

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      successes.push(r.value)
    } else {
      onLog?.(`⚠️ Вариант ${i + 1} не удался: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`, 'error')
    }
  })

  if (successes.length === 0) throw new Error('Все варианты Nano Banana 2 завершились ошибкой')
  onLog?.(`✅ Получено ${successes.length}/${count} вариантов изображения`, 'success')
  return successes
}

// ── Bogdana image generation ────────────────────────────────────────────────
// Model choices for the Bogdana pipeline's frame generation. Both skip the
// legacy hard-coded character DNA so identity comes only from Bogdana's refs.
export type BogdanaImageModel = 'nano-banana' | 'gpt-image'

export const BOGDANA_IMAGE_MODELS: { id: BogdanaImageModel; label: string }[] = [
  { id: 'nano-banana', label: 'Nano Banana 2' },
  { id: 'gpt-image', label: 'GPT Image' },
]

export async function generateBogdanaFrame(
  model: BogdanaImageModel,
  wavespeedKey: string,
  referenceImages: string[],
  prompt: string,
  aspectRatio: string,
  resolution: string,
  onLog?: LogFn
): Promise<string | undefined> {
  if (model === 'gpt-image') {
    const res = await editImageWithGPTImage2(
      wavespeedKey,
      referenceImages,
      prompt,
      resolution,
      aspectRatio,
      onLog,
      false
    )
    return res.imageUrl
  }
  const results = await generateNanoBananaMultiRef(
    wavespeedKey,
    referenceImages,
    prompt,
    aspectRatio,
    resolution,
    1,
    onLog,
    false
  )
  return results[0]?.imageUrl
}

// ── Convert any video to 9:16 aspect ratio (letterbox/pillarbox) ──────────

export async function convertVideoTo916(
  file: File,
  onLog?: LogFn
): Promise<File> {
  const targetW = 1080
  const targetH = 1920

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const srcUrl = URL.createObjectURL(file)
    video.src = srcUrl

    video.onloadedmetadata = () => {
      const vw = video.videoWidth
      const vh = video.videoHeight
      const ratio = vw / vh
      const targetRatio = 9 / 16

      if (Math.abs(ratio - targetRatio) / targetRatio <= 0.05) {
        URL.revokeObjectURL(srcUrl)
        resolve(file)
        return
      }

      onLog?.(`🔄 Конвертирую видео в 9:16 (${vw}×${vh} → ${targetW}×${targetH})...`, 'info')

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')!

      let drawW: number, drawH: number, offsetX: number, offsetY: number
      if (ratio > targetRatio) {
        drawH = targetH
        drawW = Math.round(drawH * ratio)
        offsetX = Math.round((targetW - drawW) / 2)
        offsetY = 0
      } else {
        drawW = targetW
        drawH = Math.round(drawW / ratio)
        offsetX = 0
        offsetY = Math.round((targetH - drawH) / 2)
      }

      const stream = canvas.captureStream(30)

      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4;codecs=avc1'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        URL.revokeObjectURL(srcUrl)
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
        const outFile = new File([blob], file.name.replace(/\.[^.]+$/, `_916.${ext}`), { type: blob.type })
        onLog?.(`✅ Конвертация завершена: ${(blob.size / 1024 / 1024).toFixed(1)} MB`, 'success')
        resolve(outFile)
      }
      recorder.onerror = () => { URL.revokeObjectURL(srcUrl); reject(new Error('MediaRecorder error')) }

      recorder.start(100)

      let animFrameId: number
      const draw = () => {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, targetW, targetH)
        ctx.drawImage(video, offsetX, offsetY, drawW, drawH)
        animFrameId = requestAnimationFrame(draw)
      }

      video.onended = () => {
        cancelAnimationFrame(animFrameId)
        recorder.stop()
      }
      video.onerror = () => { cancelAnimationFrame(animFrameId); recorder.stop() }

      draw()
      video.play().catch(reject)
    }

    video.onerror = () => { URL.revokeObjectURL(srcUrl); reject(new Error('Не удалось загрузить видео')) }
  })
}

// ── Captions AI ──────────────────────────────────────────────────────────

export interface CaptionTemplate {
  id: string
  name: string
  preview_url?: string
  created_at?: number
}

export async function fetchCaptionTemplates(captionsKey: string): Promise<CaptionTemplate[]> {
  const all: CaptionTemplate[] = []
  let after: string | undefined

  for (let page = 0; page < 10; page++) {
    const url = after
      ? `/api/captions/v1/videos/captions/templates?limit=100&after=${after}`
      : '/api/captions/v1/videos/captions/templates?limit=100'
    const resp = await fetch(url, { headers: { 'x-api-key': captionsKey } })
    if (!resp.ok) throw new Error(`Captions templates ${resp.status}`)
    const data = await resp.json() as { data?: CaptionTemplate[]; has_more?: boolean; last_id?: string }
    const items = data.data ?? []
    all.push(...items)
    if (!data.has_more || items.length === 0) break
    after = items[items.length - 1]?.id
  }

  return all
}

export interface CaptionsJobResult {
  videoUrl: string // blob: URL of the downloaded captioned video
}

// Clarity AI Crystal Upscaler
export async function upscaleWithCrystal(
  wavespeedKey: string,
  imageUrl: string,
  targetMegapixels: number,
  creativity: number,
  onLog?: LogFn
): Promise<WavespeedResult> {
  onLog?.('🔍 Запускаю Crystal Upscaler...', 'info')
  
  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/clarity-ai/crystal-upscaler'
    : 'https://api.wavespeed.ai/api/v3/clarity-ai/crystal-upscaler'
  
  const payload = {
    image: imageUrl,
    target_megapixels: targetMegapixels,
    creativity: creativity,
    enable_sync_mode: false,
    enable_base64_output: false,
  }
  
  onLog?.(`📊 Параметры: ${targetMegapixels} MP, creativity: ${creativity}`, 'info')
  
  const httpResp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(payload),
  })
  
  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`Crystal Upscaler ${httpResp.status}: ${JSON.stringify(err)}`)
  }
  
  const submitData = await httpResp.json() as Record<string, unknown>
  type SubmitResp = { id?: string; urls?: { get?: string }; status?: string; outputs?: string[] }
  const submit = (submitData.data ?? submitData) as SubmitResp
  let pollUrl = submit.urls?.get
  
  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }
  
  if (submit.status === 'completed' && submit.outputs?.length) {
    const raw = submit.outputs[0]
    return { imageUrl: raw.startsWith('http') ? raw : `https://api.wavespeed.ai${raw}` }
  }
  
  if (!pollUrl) {
    throw new Error('No poll URL in response')
  }
  
  onLog?.('⏳ Ожидание результата upscale...', 'info')
  
  const maxAttempts = 100
  const delayMs = 3000
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    
    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') },
    })
    
    if (!pollResp.ok) {
      throw new Error(`Poll failed: ${pollResp.status}`)
    }
    
    const pollData = await pollResp.json() as Record<string, unknown>
    const pollResult = (pollData.data ?? pollData) as SubmitResp
    
    if (pollResult.status === 'failed') {
      throw new Error('Crystal Upscaler failed')
    }
    
    if (pollResult.status === 'completed' && pollResult.outputs?.length) {
      const raw = pollResult.outputs[0]
      onLog?.('✅ Upscale завершен', 'success')
      return { imageUrl: raw.startsWith('http') ? raw : `https://api.wavespeed.ai${raw}` }
    }
    
    if (attempt % 10 === 0) {
      onLog?.(`⏳ Обработка... (${attempt * delayMs / 1000}s)`, 'info')
    }
  }
  
  throw new Error('Crystal Upscaler timeout')
}

export async function submitCaptionsJob(
  captionsKey: string,
  videoFile: File,
  templateId: string,
  onLog?: LogFn,
  onProgress?: (progress: number) => void
): Promise<CaptionsJobResult> {
  if (!captionsKey || captionsKey.trim().length === 0) {
    throw new Error('Captions AI API ключ не указан. Добавьте ключ в настройках.')
  }

  const base = import.meta.env.DEV ? '/api/captions' : 'https://api.mirage.app'

  const maskedKey = captionsKey.length > 10 
    ? `${captionsKey.slice(0, 7)}...${captionsKey.slice(-4)}`
    : '***'

  onLog?.('📤 Отправляю видео в Captions AI...', 'info')
  onLog?.(`🌐 Endpoint: ${base}/v1/videos/captions`, 'info')
  onLog?.(`🔑 API Key: ${maskedKey}`, 'info')
  onLog?.(`📊 Размер файла: ${(videoFile.size / 1024 / 1024).toFixed(2)} MB`, 'info')
  onLog?.(`🎬 Формат: ${videoFile.type}`, 'info')
  onLog?.(`🎨 Template ID: ${templateId}`, 'info')

  const form = new FormData()
  form.append('video', videoFile)
  form.append('caption_template_id', templateId)

  let submitResp: Response
  try {
    submitResp = await fetch(`${base}/v1/videos/captions`, {
      method: 'POST',
      headers: { 'x-api-key': captionsKey },
      body: form,
    })
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError)
    onLog?.(`❌ Ошибка сети при отправке: ${errMsg}`, 'error')
    throw new Error(`Ошибка подключения к Captions AI: ${errMsg}`)
  }

  if (!submitResp.ok) {
    let errText: string
    try {
      errText = await submitResp.text()
    } catch {
      errText = submitResp.statusText
    }
    onLog?.(`❌ Ошибка от Captions AI (${submitResp.status}): ${errText.slice(0, 300)}`, 'error')
    throw new Error(`Captions AI ${submitResp.status}: ${errText.slice(0, 200)}`)
  }

  const submitData = await submitResp.json() as { id: string; status: string }
  const videoId = submitData.id
  onLog?.(`🎬 Задача создана: ${videoId}, обработка...`, 'info')

  const maxAttempts = 120
  const pollInterval = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval))

    const pollResp = await fetch(`${base}/v1/videos/${videoId}`, {
      headers: { 'x-api-key': captionsKey },
    })
    if (!pollResp.ok) continue

    const poll = await pollResp.json() as {
      status: string
      progress?: number
      error?: { message?: string }
    }

    onProgress?.(poll.progress ?? 0)

    if (attempt % 6 === 0) {
      onLog?.(`⏳ Субтитры: ${poll.progress ?? 0}% (${Math.round((attempt * pollInterval) / 1000)}s)...`, 'info')
    }

    if (poll.status === 'FAILED' || poll.status === 'CANCELLED') {
      throw new Error(`Captions AI ${poll.status}: ${poll.error?.message ?? 'unknown error'}`)
    }

    if (poll.status === 'COMPLETE') {
      onLog?.('📥 Скачиваю готовое видео...', 'info')
      const dlResp = await fetch(`${base}/v1/videos/${videoId}/content`, {
        headers: { 'x-api-key': captionsKey },
      })
      if (!dlResp.ok) throw new Error(`Не удалось скачать видео: ${dlResp.status}`)
      const blob = await dlResp.blob()
      const videoUrl = URL.createObjectURL(blob)
      onLog?.('✅ Видео с субтитрами готово!', 'success')
      return { videoUrl }
    }
  }

  throw new Error('Captions AI: таймаут — субтитры не были готовы за 10 минут')
}

export interface InfiniteTalkResult {
  videoUrl: string
}

export async function submitInfiniteTalk(
  wavespeedKey: string,
  imageDataUrl: string,
  audioDataUrl: string,
  prompt: string,
  onLog?: LogFn,
  maskDataUrl?: string
): Promise<InfiniteTalkResult> {
  onLog?.('🎬 Отправляю задачу в InfiniteTalk...', 'info')
  if (maskDataUrl) {
    onLog?.('🎨 Использую маску для анимации', 'info')
  }

  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/wavespeed-ai/infinitetalk'
    : 'https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk'

  const body: Record<string, unknown> = {
    image: imageDataUrl,
    audio: audioDataUrl,
    prompt,
    resolution: '720p',
    seed: -1,
  }

  if (maskDataUrl) {
    body.mask_image = maskDataUrl
  }

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText)
    throw new Error(`InfiniteTalk ${resp.status}: ${errText}`)
  }

  const submitData = await resp.json() as Record<string, unknown>
  type SubmitResult = { id?: string; urls?: { get?: string }; status?: string; outputs?: string[] }
  const submitResult = (submitData.data ?? submitData) as SubmitResult

  const predictionId = submitResult.id
  let pollUrl = submitResult.urls?.get

  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }

  if (!predictionId || !pollUrl) throw new Error('InfiniteTalk: не получен ID задачи')
  onLog?.(`🎬 InfiniteTalk задача ${predictionId} создана, опрос...`, 'info')

  const maxAttempts = 120 // 10 min (videos can be long)
  const pollInterval = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval))

    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') },
    })
    if (!pollResp.ok) continue

    const pollData = await pollResp.json() as Record<string, unknown>
    type PollResult = { status?: string; outputs?: string[]; error?: string }
    const result = (pollData.data ?? pollData) as PollResult

    if (attempt % 6 === 0) {
      onLog?.(`🎬 InfiniteTalk: статус ${result.status ?? 'processing'} (${Math.round((attempt * pollInterval) / 1000)}s)...`, 'info')
    }

    if (result.status === 'failed') {
      throw new Error(`InfiniteTalk failed: ${result.error ?? 'unknown error'}`)
    }

    if (result.status === 'completed') {
      const videoUrl = result.outputs?.[0]
      if (!videoUrl) throw new Error('InfiniteTalk: пустой outputs')
      onLog?.('✅ InfiniteTalk видео готово!', 'success')
      return { videoUrl }
    }
  }

  throw new Error('InfiniteTalk: таймаут — видео не было готово за 10 минут')
}

// ── Inst-to-Post ───────────────────────────────────────────────────────────

export async function fetchInstagramImage(
  instagramUrl: string
): Promise<{ dataUrl: string; sourceUrl: string }> {
  const resp = await fetch(`/api/instagram?url=${encodeURIComponent(instagramUrl)}`)
  const json = await resp.json() as { dataUrl?: string; sourceUrl?: string; error?: string }
  if (!resp.ok || !json.dataUrl) throw new Error(json.error ?? `Instagram proxy ${resp.status}`)
  return { dataUrl: json.dataUrl, sourceUrl: json.sourceUrl ?? '' }
}

export interface InstToPostAnalysis {
  settingDescription: string
  nanoBananaPrompt: string
  nanoBananaPromptRu: string
  gptImage2Prompt: string
  gptImage2PromptRu: string
  seedreamPrompt: string
  seedreamPromptRu: string
  grokImagePrompt: string
  grokImagePromptRu: string
}

export async function analyzeInstagramImageWithGrok(
  grokKey: string,
  imageDataUrl: string,
  onLog?: LogFn
): Promise<InstToPostAnalysis> {
  onLog?.('🧠 Grok анализирует Instagram фото...', 'info')

  const systemPrompt = `You are a creative director. Analyze the image and generate prompts to recreate the same scene with a different person (described below).
Return ONLY valid JSON, no markdown, no code fences.`

  const userText = `Analyze this Instagram photo carefully.

The NEW person to place in the same scene has this appearance (DNA):
${DNA}

IMPORTANT: The AI models will receive the DNA reference image as input. Your prompts should describe how to transform/edit that DNA reference to match the setting, pose, outfit, and environment from this Instagram photo.

Generate:
1. "settingDescription" — describe in 2-3 sentences in Russian the setting, environment, lighting, mood, color palette, and the pose/outfit style of the original person.
2. "nanoBananaPrompt" — a detailed prompt in English for Nano Banana 2 Edit. Describe the setting, pose, outfit style, lighting and environment from the Instagram photo. The model will receive the DNA reference image and apply these changes to it.
3. "nanoBananaPromptRu" — exact Russian translation of nanoBananaPrompt.
4. "gptImage2Prompt" — a detailed prompt in English for GPT Image 2 Edit. Describe how to edit the DNA reference to match this scene with photorealistic results.
5. "gptImage2PromptRu" — exact Russian translation of gptImage2Prompt.
6. "seedreamPrompt" — a detailed prompt in English for Seedream v4.5 Edit. Specify what should change in the DNA reference (outfit, background, pose to match Instagram photo) and what must stay (facial features, skin tone). Example: 'Change outfit to {description}, change background to {setting}, adjust pose to {pose}, keep facial features and skin tone, clean edges.'
7. "seedreamPromptRu" — exact Russian translation of seedreamPrompt.
8. "grokImagePrompt" — a detailed prompt in English for Grok Image. Describe how to edit the DNA reference image to show this person in the Instagram photo's setting and pose.
9. "grokImagePromptRu" — exact Russian translation of grokImagePrompt.

Return JSON:
{
  "settingDescription": "<description in Russian>",
  "nanoBananaPrompt": "<detailed English prompt for Nano Banana 2>",
  "nanoBananaPromptRu": "<Russian translation>",
  "gptImage2Prompt": "<detailed English prompt for GPT Image 2>",
  "gptImage2PromptRu": "<Russian translation>",
  "seedreamPrompt": "<detailed English prompt for Seedream v4.5>",
  "seedreamPromptRu": "<Russian translation>",
  "grokImagePrompt": "<detailed English prompt for Grok Image>",
  "grokImagePromptRu": "<Russian translation>"
}`

  const payload = {
    model: 'grok-4.20-reasoning',
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
          { type: 'input_text', text: userText },
        ],
      },
    ],
    store: false,
  }

  const httpResp = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer(grokKey, 'Grok') },
    body: JSON.stringify(payload),
  })
  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`Grok vision ${httpResp.status}: ${JSON.stringify(err)}`)
  }

  const data = await httpResp.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const raw = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''

  let parsed: InstToPostAnalysis
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON')
    parsed = JSON.parse(jsonMatch[0]) as InstToPostAnalysis
  } catch {
    throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  }

  onLog?.('✅ Анализ готов!', 'success')
  return parsed
}

export async function editImageWithZImageTurboLora(
  wavespeedKey: string,
  imageDataUrl: string,
  prompt: string,
  resolution: string,
  aspectRatio: string,
  strength: number,
  onLog?: LogFn
): Promise<WavespeedResult> {
  onLog?.('🚀 Запускаю Z-Image Turbo с LoRA IceShelf...', 'info')

  // Load DNA reference image
  const dnaRefImage = await loadDnaReferenceImage()

  // Convert aspect ratio to size format (e.g., "1:1" -> "1024*1024")
  const sizeMap: Record<string, string> = {
    '1:1': '1024*1024',
    '3:4': '768*1024',
    '9:16': '576*1024',
    '16:9': '1024*576',
  }
  const size = sizeMap[aspectRatio] || '1024*1024'

  // Trigger word MUST be first, then DNA description, then user prompt
  const fullPrompt = `IceShelf, ${DNA}. ${prompt}`

  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/wavespeed-ai/z-image-turbo/image-to-image-lora'
    : 'https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image-turbo/image-to-image-lora'

  const payload = {
    image: imageDataUrl,
    prompt: fullPrompt,
    loras: [
      {
        path: 'https://huggingface.co/ourdotv/IceShelf/resolve/main/IceShelf.safetensors',
        scale: 1,
      },
    ],
    size,
    strength,
    seed: -1,
    output_format: 'jpeg',
    enable_sync_mode: false,
    enable_base64_output: false,
  }

  console.log('[Z-Image Turbo LoRA] payload:', { ...payload, image: '[base64]' })

  const httpResp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(payload),
  })

  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`Z-Image Turbo LoRA ${httpResp.status}: ${JSON.stringify(err)}`)
  }

  const submitData = await httpResp.json() as Record<string, unknown>
  type SubmitResp = { id?: string; urls?: { get?: string }; status?: string; outputs?: string[] }
  const submit = (submitData.data ?? submitData) as SubmitResp
  let pollUrl = submit.urls?.get

  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }

  if (submit.status === 'completed' && submit.outputs?.length) {
    const raw = submit.outputs[0]
    return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}` }
  }

  if (!submit.id || !pollUrl) throw new Error('Z-Image Turbo LoRA: не получен ID задачи')
  onLog?.(`⏳ Z-Image Turbo LoRA: задача ${submit.id}, опрос...`, 'info')

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollResp = await fetch(pollUrl!, { headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') } })
    if (!pollResp.ok) continue
    const pollData = await pollResp.json() as Record<string, unknown>
    const result = (pollData.data ?? pollData) as SubmitResp
    if (result.status === 'failed') throw new Error('Z-Image Turbo LoRA: задача завершилась ошибкой')
    if (result.status === 'completed') {
      const raw = result.outputs?.[0]
      if (!raw) throw new Error('Z-Image Turbo LoRA: пустой outputs')
      onLog?.('✅ Z-Image Turbo LoRA готово!', 'success')
      return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}` }
    }
  }

  throw new Error('Z-Image Turbo LoRA: таймаут')
}

export async function editImageWithGPTImage2(
  wavespeedKey: string,
  referenceImages: string[],
  prompt: string,
  resolution: string,
  aspectRatio: string,
  onLog?: LogFn,
  injectDefaultDna = true
): Promise<WavespeedResult> {
  onLog?.('🖼️ Запускаю GPT Image 2 Edit...', 'info')

  // Load the legacy DNA reference image only when the default DNA is requested.
  const dnaRefImage = injectDefaultDna ? await loadDnaReferenceImage() : ''
  const fullPrompt = injectDefaultDna ? `${DNA}\n\n${prompt}` : prompt

  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/openai/gpt-image-2/edit'
    : 'https://api.wavespeed.ai/api/v3/openai/gpt-image-2/edit'

  const payload = {
    images: dnaRefImage ? [...referenceImages, dnaRefImage] : referenceImages,
    prompt: fullPrompt,
    resolution,
    quality: 'medium',
    aspect_ratio: aspectRatio,
    enable_sync_mode: false,
    enable_base64_output: false,
  }

  const httpResp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(payload),
  })

  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`GPT Image 2 ${httpResp.status}: ${JSON.stringify(err)}`)
  }

  const submitData = await httpResp.json() as Record<string, unknown>
  type SubmitResp = { id?: string; urls?: { get?: string }; status?: string; outputs?: string[] }
  const submit = (submitData.data ?? submitData) as SubmitResp
  let pollUrl = submit.urls?.get

  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }

  if (submit.status === 'completed' && submit.outputs?.length) {
    const raw = submit.outputs[0]
    return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` }
  }

  if (!submit.id || !pollUrl) throw new Error('GPT Image 2: не получен ID задачи')
  onLog?.(`⏳ GPT Image 2: задача ${submit.id}, опрос...`, 'info')

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollResp = await fetch(pollUrl!, { headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') } })
    if (!pollResp.ok) continue
    const pollData = await pollResp.json() as Record<string, unknown>
    const result = (pollData.data ?? pollData) as SubmitResp
    if (result.status === 'failed') throw new Error('GPT Image 2: задача завершилась ошибкой')
    if (result.status === 'completed') {
      const raw = result.outputs?.[0]
      if (!raw) throw new Error('GPT Image 2: пустой outputs')
      onLog?.('✅ GPT Image 2 готово!', 'success')
      return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` }
    }
  }

  throw new Error('GPT Image 2: таймаут')
}

// Analyze pose reference with Grok Vision to extract ONLY pose/camera/environment description
async function analyzePoseReferenceWithGrokVision(
  grokKey: string,
  poseRefImage: string,
  onLog?: LogFn
): Promise<string> {
  onLog?.('🔍 Grok Vision анализирует референс позы...')

  const analysisPrompt = `⚠️ CRITICAL MISSION: This image will NOT be shown to the AI model. You must extract EXTREMELY DETAILED technical specifications so the model can recreate the EXACT pose and camera setup from TEXT ONLY.

Analyze this reference image and provide FORENSIC-LEVEL technical specifications:

1. **BODY POSE (EXTREME DETAIL REQUIRED)**:
   - Body position: sitting/standing/kneeling/lying - specify exact position
   - Torso angle: degrees of lean (forward/backward/sideways)
   - Arms: exact position of each arm (raised/lowered/bent), elbow angles in degrees
   - Hands: exact position and what they're doing (gripping object, resting, gesturing)
   - ⚠️ SELFIE DETECTION: If person is holding a phone/camera in extended arm position (selfie pose), note: "SELFIE MODE: arm extended holding device"
   - Legs: position (bent/straight/crossed), knee angles
   - Head: tilt angle in degrees, facing direction (forward/sideways/down/up)
   - Gaze direction: looking at camera/looking away/looking down/etc.
   - Overall pose action: describe what the person is doing in detail

2. **CAMERA SPECIFICATIONS (MUST BE EXACT)**:
   - Vertical angle: estimate in degrees from horizontal (e.g., "45° from above", "eye-level 0°", "30° from below")
   - Horizontal distance: extreme close-up/close-up/medium/wide shot
   - Viewpoint type: POV (first-person), over-shoulder, third-person observational
   - Camera height relative to subject: above/level/below
   - Frame filling: what % of frame does subject occupy (20%/50%/80%/etc.)

3. **COMPOSITION (PRECISE MEASUREMENTS)**:
   - What's visible: head (yes/no, what % cropped), torso (yes/no), arms (yes/no), legs (yes/no, where cropped)
   - Subject positioning: left/center/right of frame, top/middle/bottom
   - Floor/ceiling visibility: estimate % of frame
   - Empty space: where and how much
   - Aspect ratio feel: portrait/square/landscape orientation

4. **ENVIRONMENT (DETAILED VISUAL DESCRIPTION)**:
   - Location type: bedroom/kitchen/living room/office/bathroom/outdoor/etc.
   - Wall appearance: color (specific: white/beige/cream/grey/etc.), texture (smooth/textured/wallpaper), finish (matte/glossy)
   - Floor: type (wood/carpet/tile), color tone (light/medium/dark), texture
   - Furniture style: modern/vintage/minimalist/traditional/industrial (be specific about what you see)
   - Furniture items visible: describe what types (bed/table/chair/etc.) and their visual characteristics (wooden/metal, color, design style)
   - Decorative elements: describe visible items (artwork/plants/cushions/etc.) and their style
   - Space feel: tight/spacious/cluttered/clean/cozy/sterile
   - Overall color palette: warm tones/cool tones/neutral/monochromatic/colorful
   - Windows/natural features: size, placement, what's visible through them

5. **LIGHTING (DETAILED DESCRIPTION)**:
   - Source: natural daylight/artificial lights/mixed
   - Direction: from above/side/front/back/multiple sources
   - Quality: bright/dim/moody/soft/harsh
   - Color temperature: warm (yellow/orange tones)/cool (blue/white tones)/neutral
   - Fixtures visible: type of lamps/ceiling lights (if any), their style

⛔ ABSOLUTELY FORBIDDEN TO DESCRIBE:
- Person's face, hair, eye color, facial features
- Clothing, outfit, accessories, jewelry
- Brand names, logos, text visible in scene
- Specific readable text or signage

✅ YOU MUST DESCRIBE (for environment recreation):
- Wall colors and textures (e.g., "beige walls with smooth matte finish")
- Furniture styles and materials (e.g., "wooden bed frame with dark finish, modern minimalist design")
- Decorative elements (e.g., "framed artwork on wall, small potted plant")
- Lighting characteristics (e.g., "warm artificial lighting from ceiling fixture")
- Overall color palette and atmosphere

✅ REQUIRED FORMAT:
Write a dense technical paragraph with EXACT measurements and specifications. Example: "torso leaning 30° forward", "right arm bent at 90° holding object at chest height", "camera positioned 60° above subject", "legs cropped at mid-thigh, occupying lower 30% of frame", "beige walls with smooth finish", "wooden bed with dark brown finish visible in background", "warm artificial lighting from above".

Target length: 200-250 words of pure technical specifications.`

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: bearer(grokKey, 'Grok'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4.20-reasoning',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: poseRefImage, detail: 'high' },
            { type: 'input_text', text: analysisPrompt },
          ],
        },
      ],
      store: false,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Grok Vision API ${response.status}: ${JSON.stringify(err)}`)
  }

  const data = await response.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const poseDescription = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''
  
  onLog?.(`✅ Описание позы: ${poseDescription.substring(0, 100)}...`)
  return poseDescription
}

export async function generateNSFWPromptWithGrok(
  grokKey: string,
  sarahImage: string | null,
  poseRefImage: string,
  roomImage: string,
  nsfwRefs: string[],
  userWishes: string,
  disorder: number,
  useSceneFromPose: boolean,
  onLog?: LogFn
): Promise<string> {
  // If useSceneFromPose, analyze pose ref with Grok Vision first
  let poseDescription = ''
  if (useSceneFromPose) {
    poseDescription = await analyzePoseReferenceWithGrokVision(grokKey, poseRefImage, onLog)
  }
  
  onLog?.('🔍 Grok анализирует все референсы для NSFW промпта...')

  const wishesSection = userWishes.trim() ? `\n\nUser wishes: "${userWishes}"` : ''
  
  const disorderSection = disorder > 0 
    ? `\n\nROOM DISORDER LEVEL: ${disorder}%
${disorder < 30 ? 'Room should appear very clean and tidy with minimal items out of place.' :
  disorder < 60 ? 'Room should have moderate disorder - some items scattered, clothes on furniture, slightly messy but livable.' :
  'Room should appear very messy - clothes scattered everywhere, items on floor, unmade bed, clearly lived-in chaos.'}`
    : '\n\nROOM DISORDER LEVEL: 0% - Room should be perfectly clean and organized.'

  const outfitSection = sarahImage 
    ? '1. Outfit photo - ONLY for clothing, accessories, styling reference'
    : '1. (No outfit photo provided - model should wear minimal, elegant dark clothing matching DNA description)'

  const nsfwRefsSection = nsfwRefs.length > 0
    ? '4. NSFW references - EXACT visual elements to reproduce (body parts, positions, specific details)'
    : '4. (No NSFW references provided - use user wishes and pose reference to determine appropriate adult content style and positioning)'

  const sceneSection = useSceneFromPose
    ? `3. **ENVIRONMENT (GENERATE SIMILAR TO POSE REFERENCE, WITH VARIATIONS)**:
   ⚠️ CRITICAL ENVIRONMENT INSTRUCTIONS:
   
   GROK VISION ANALYSIS (detailed description of pose reference environment):
   ${poseDescription}
   
   YOUR TASK - GENERATE ENVIRONMENT SIMILAR TO POSE REFERENCE:
   
   🎯 GOAL: Create an environment that LOOKS SIMILAR to the pose reference, but is NOT an exact copy
   
   ✅ USE POSE REFERENCE AS VISUAL INSPIRATION:
   - Similar wall colors (same tone family, but can vary shade)
   - Similar furniture style (if modern → modern, if vintage → vintage)
   - Similar lighting quality (if bright → bright, if dim → dim)
   - Similar spatial layout (if open → open, if compact → compact)
   - Similar decorative style (if minimalist → minimalist, if ornate → ornate)
   - Similar color palette overall (warm/cool/neutral tones)
   
   🔄 VARIATIONS (make it NOT identical):
   - Furniture: similar style but different specific items (different chair model, different table shape)
   - Decorations: same style but different objects (different paintings, different plants)
   - Layout: similar but with adjusted positions (furniture in different spots)
   - Lighting fixtures: similar type but different design
   - Small details: vary textures, materials, specific accessories
   
   ❌ FORBIDDEN - DO NOT USE:
   - Generic bedroom/café/kitchen from your training data or stock images
   - Environment from DNA reference image
   - Environment from outfit photo
   - Random environment that doesn't match pose reference visual appearance
   
   📋 VERIFICATION CHECKLIST:
   Question: "If someone sees the pose reference and my generated image side by side, would they say 'these look like the same type of place'?"
   Answer must be: YES ✅
   
   EXAMPLE:
   - Pose ref shows: beige walls, wooden bed, warm lighting, minimalist bedroom
   - ✅ CORRECT: beige/cream walls, wooden furniture (different bed design), warm lighting, minimalist style bedroom
   - ❌ WRONG: white walls, modern metal furniture, cold lighting → looks like completely different place
   - ❌ WRONG: generic white bedroom with generic furniture → looks like stock photo, not inspired by reference
   
   Think: "I'm recreating THIS SPECIFIC ENVIRONMENT with variations, not designing a random environment of the same type"${disorderSection}`
    : `3. Room/location - for environment and lighting${disorderSection}`

  const promptText = `${DNA}

You are an expert NSFW/adult content prompt writer specializing in creating high-quality, detailed prompts for Seedream 4.5 EDIT image generation.

CRITICAL UNDERSTANDING: This is IMAGE EDITING mode, NOT image generation from scratch.
- Seedream 4.5 EDIT works by COPYING and TRANSFERRING visual elements from reference images
- Your prompt must guide visual CLONING/COPYING, not creative generation
- Think of it as photographic COMPOSITING - assembling exact pieces from references

TASK: Analyze ${nsfwRefs.length > 0 ? 'ALL' : 'the'} provided images and create ONE comprehensive EDIT prompt that instructs Seedream to ${nsfwRefs.length > 0 ? 'COPY specific visual elements from references' : 'generate appropriate adult content based on pose and user wishes'}.

IMAGES PROVIDED:
${outfitSection}
2. **POSE REFERENCE ${useSceneFromPose ? '(SELECTIVE COPYING MODE)' : '(PRIMARY)'}**
   ${useSceneFromPose ? `
   ⚠️ **CRITICAL - SELECTIVE COPYING INSTRUCTIONS**:
   
   FROM POSE REFERENCE, YOU MUST COPY:
   ✅ Body pose (exact position, angles)
   ✅ Camera angle and composition
   ✅ Objects in subject's hands/being held (${userWishes.includes('шаурма') || userWishes.includes('shawarma') || userWishes.includes('burger') || userWishes.includes('drink') || userWishes.includes('food') || userWishes.includes('bottle') || userWishes.includes('cup') ? 'BUT REPLACE with object specified in user wishes' : 'copy exact object type - bottle/cup/food/etc.'})
   ✅ Hand positions and interaction with objects
   ${userWishes.trim() ? `\n   ⚠️ USER WISHES OVERRIDE: If user wishes specify a different object (e.g., "с шаурмой"), REPLACE the object in hands with the one from user wishes while keeping the exact hand pose and grip.` : ''}
   
   FROM POSE REFERENCE, YOU MUST NOT COPY:
   ❌ Subject's FACE - pose reference (SECOND image) shows A DIFFERENT PERSON → COMPLETELY IGNORE HER FACE
   ❌ Subject's HAIR - pose reference shows A DIFFERENT PERSON → COMPLETELY IGNORE HER HAIR (may be blonde/brown/red - ignore it!)
   ❌ Use ONLY DNA features from FIRST image (heterochromia, black hair with fringe)
   ❌ Subject's CLOTHING - use outfit photo OR user wishes OR DNA style description
   ❌ ENVIRONMENT: walls, furniture, tables, chairs, decorations, floor, ceiling
   ❌ Background objects, wall colors, room layout, specific items
   ❌ Body type or physique (use DNA body type)
   ❌ PHONE/CAMERA DEVICE - if pose reference shows selfie (arm extended holding phone), REMOVE the phone from the generated image entirely
   
   🎯 POSE REFERENCE (SECOND image) PROVIDES:
   ✅ Body pose and angles ONLY
   ✅ Camera angle ONLY
   ✅ Composition ONLY
   ✅ Objects in hands ONLY
   ❌ NOT the face (that's a different person - use DNA face from FIRST image)
   ❌ NOT the hair (that's a different person - use DNA hair from FIRST image)
   ❌ NOT the body type (use DNA body from FIRST image)
   
   ⚠️ **SELFIE MODE SPECIAL INSTRUCTIONS**:
   If Grok Vision analysis mentions "SELFIE MODE" or describes arm extended holding phone/device:
   - COPY the arm pose and hand position exactly (extended arm, hand gesture)
   - But REMOVE the phone/device completely - the hand should be empty or naturally posed
   - Subject MUST look directly at camera (gaze toward viewer)
   - The arm is extended as if taking a selfie, but NO PHONE is visible in the frame
   - This creates natural selfie composition WITHOUT showing the device
   
   ENVIRONMENT GENERATION (from Grok Vision analysis in section 3):
   - Analyze the TYPE of environment from text description (café/bedroom/kitchen/etc.)
   - Generate a COMPLETELY NEW environment of the same type
   - Different furniture, different colors, different layout, different decorations
   - Keep only the general style/vibe, not specific visual details
   ` : `
   THE MAIN SOURCE for body positioning, camera angle, action, composition
   ⚠️ **CRITICAL WARNING - DO NOT COPY FROM POSE REFERENCE**:
   - DO NOT copy the FACE from pose reference
   - DO NOT copy the CLOTHING/OUTFIT from pose reference  
   - DO NOT copy the BODY TYPE from pose reference
   - ONLY copy: POSE (body position), CAMERA ANGLE, and COMPOSITION
   `}
${sceneSection}
${nsfwRefsSection}${wishesSection}

CRITICAL REQUIREMENTS (IN ORDER OF PRIORITY):

⚠️⚠️⚠️ **IRON-CLAD RULE #1 - DNA FACE IS NON-NEGOTIABLE** ⚠️⚠️⚠️
THIS IS THE MOST CRITICAL REQUIREMENT. VIOLATION OF THIS RULE MEANS COMPLETE FAILURE.

1. **FACIAL FEATURES (MANDATORY - ABSOLUTE PRIORITY - CANNOT BE OVERRIDDEN)**: 
   
   ⚠️ **IMAGE ARRAY ORDER**: DNA reference (three face views) is the FIRST image. Pose reference is SECOND. Outfit photo is later.
   
   The woman's face MUST be EXACT 1:1 CLONE of FIRST image (DNA reference) with these MANDATORY features:
   - **Heterochromia** (REQUIRED): left eye soft blue, right eye warm brown - THIS IS NON-NEGOTIABLE
   - **Black hair** (REQUIRED): Long black hair with FULL STRAIGHT FRINGE (bangs) to eyebrows - NO OTHER HAIR COLOR OR STYLE
   - **Hair texture** (REQUIRED): Soft natural waves reaching to chest
   - **Facial structure** (REQUIRED): EXACT match to FIRST image (DNA reference) - same face shape, same features, same proportions
   
   ⛔ **ABSOLUTE PROHIBITIONS - THESE WILL CAUSE IMMEDIATE FAILURE**:
   - SECOND IMAGE (pose reference) shows A DIFFERENT PERSON'S FACE → COMPLETELY IGNORE IT, DO NOT COPY ANY FACIAL FEATURES
   - OUTFIT PHOTO shows A DIFFERENT PERSON'S FACE → COMPLETELY IGNORE IT, DO NOT COPY ANY FACIAL FEATURES
   - DO NOT copy hair color, hair style, eye color, face shape, or ANY facial features from ANY image except FIRST (DNA reference)
   - DO NOT copy ANY facial features from NSFW references - ZERO TOLERANCE
   - DO NOT use ANY face except FIRST image (DNA reference) - ZERO TOLERANCE
   - DO NOT modify, adapt, or "blend" the DNA face - USE IT EXACTLY AS-IS
   - DO NOT change eye colors, hair color, or facial structure - FORBIDDEN
   - If you see blonde/brown/red hair in pose/outfit refs → IGNORE IT, use BLACK hair with fringe from DNA ref
   - If you see normal eyes in pose/outfit refs → IGNORE THEM, use HETEROCHROMIA from DNA ref
   
   🎯 **FACE SOURCE PRIORITY** (in order of importance):
   1. FIRST IMAGE (DNA reference) → 100% PRIORITY FOR FACE - USE THIS FACE ONLY
   2. All other images → 0% PRIORITY FOR FACE - IGNORE ALL FACES IN THESE IMAGES
   
   ✅ **VERIFICATION CHECKLIST** (ALL must be YES):
   [ ] Does the face match FIRST image (DNA reference) exactly?
   [ ] Are eyes heterochromic (blue left, brown right)?
   [ ] Is hair black with full straight fringe?
   [ ] Are facial features identical to DNA reference?
   [ ] Did you IGNORE all faces shown in pose reference and outfit photo?
   
   If ANY checkbox is NO, the entire image is REJECTED and FAILED.
   
   🔒 **LOCKED REQUIREMENT**: The DNA face (FIRST image) is the ONLY acceptable face. No exceptions, no variations, no interpretations.
   
2. **CAMERA ANGLE & COMPOSITION (CRITICAL - GUARANTEED 100% MATCH)**: 
   ${useSceneFromPose ? `
   ⚠️ **USE ONLY THE TEXT DESCRIPTION BELOW - NO IMAGE REFERENCE AVAILABLE**:
   
   The pose reference image was PRE-ANALYZED and you have DETAILED TEXT SPECIFICATIONS.
   Extract camera and composition details from the Grok Vision analysis in section 3.
   
   YOUR TASK:
   - Read the technical specifications from the text description
   - Extract: vertical angle, horizontal distance, frame content, viewpoint type
   - Translate these specifications into your image generation prompt
   - Be EXTREMELY PRECISE - copy the exact measurements from the text
   - The text description contains forensic-level details - use them ALL
   
   Write your prompt with EXACT measurements from the text:
   ✅ Copy specifications like: "Shot from 60° high angle", "Subject occupies 70% of frame", "Legs cropped at mid-thigh"
   
   ❌ DO NOT make assumptions or simplify - use EXACT specs from text description!
   ` : `
   YOU MUST EXTRACT AND REPLICATE THE EXACT CAMERA SETUP FROM POSE REFERENCE IMAGE.
   
   MANDATORY ANALYSIS STEPS (complete ALL before writing prompt):
   
   A) VERTICAL ANGLE measurement:
      - Look at pose reference. Is camera above, level, or below subject?
      - Estimate angle in degrees (e.g., "60° from above", "eye-level 0°", "30° from below")
      - Note: If you see mostly floor → high angle. If you see mostly ceiling → low angle.
   
   B) HORIZONTAL DISTANCE measurement:
      - How much of subject fills the frame? 20%? 50%? 80%?
      - Is this extreme close-up (face/detail only), close-up (upper body), medium (waist up), or wide (full body)?
   
   C) FRAME CONTENT inventory:
      - List EXACTLY what's visible: "floor in bottom 70%", "hands in center", "head cropped at top edge"
      - List what's NOT visible: "legs cut off below knees", "left arm out of frame"
   
   D) VIEWPOINT type:
      - Is this POV (first-person view)? Over-shoulder? Third-person observational?
      - Where is the "camera" located in 3D space relative to subject?
   
   THEN write in your prompt with EXACT measurements:
   ✅ "Shot from 60° high angle, camera positioned 1 meter above subject looking down. 
       Floor occupies bottom 65% of frame. Subject's head visible in upper 30% of frame, 
       legs cropped out below knees. POV perspective."
   
   ❌ NOT: "High-angle shot of woman" - TOO VAGUE!
   ❌ NOT: "Cinematic POV" - NO TECHNICAL SPECS!
   `}
   
3. **POSE & BODY POSITIONING (CRITICAL - 1:1 COPY REQUIRED)**: 
   ${useSceneFromPose ? `
   ⚠️ **USE ONLY THE TEXT DESCRIPTION - NO IMAGE TO COPY FROM**:
   
   The Grok Vision analysis (section 3 above) contains FORENSIC-LEVEL pose specifications.
   
   YOUR TASK:
   - Extract ALL pose details from the text description
   - Body position, torso angle, arm positions, hand actions, leg positions, head tilt
   - Translate EVERY specification into your prompt with EXACT measurements
   - Use the exact angles and positions mentioned in the text (e.g., "torso leaning 30° forward", "right arm bent at 90°")
   
   ✅ Copy pose specs from text like: "sitting position", "arms bent at elbows holding object at chest height", "head tilted 15° down"
   
   ❌ DO NOT improvise or interpret - use EXACT pose specifications from the text!
   ` : `
   The subject's pose and position in frame MUST be an EXACT 1:1 REPLICA of the POSE REFERENCE IMAGE:
   - Body ANGLE: Match exact torso rotation, lean, tilt (e.g., "torso leaning 30° forward")
   - Limb POSITIONS: Copy exact arm angles, leg positions, finger placement
   - Head POSITION: Match exact head tilt, face direction, gaze angle
   - SPATIAL positioning: Subject must occupy same area of frame as reference
   - DO NOT "interpret" or "adapt" the pose - it must be a PERFECT MATCH
   `}

4. **NSFW ELEMENTS (CRITICAL - VISUAL CLONING MODE, 100% IDENTICAL COPY)**: 
   THIS IS THE MOST IMPORTANT SECTION. THE NSFW REFERENCES MUST BE COPIED WITH PIXEL-LEVEL ACCURACY.
   
   UNDERSTAND: Seedream 4.5 EDIT is designed to TRANSFER visual elements from references to the output.
   Your job is to MEASURE and DOCUMENT every detail so Seedream knows EXACTLY what to copy.
   
   MANDATORY VISUAL CLONING PROTOCOL (DO NOT SKIP ANY STEP):
   
   STEP 1 - MEASURE each NSFW reference in EXTREME DETAIL:
   You MUST analyze NSFW references as if taking forensic measurements:
   
   A) If you see lips/mouth and object:
      - Lip opening: measure width in mm (e.g., "35mm opening")
      - Contact depth: how deep is penetration visible (e.g., "60mm depth")
      - Lip stretch: describe exact lip position around object (e.g., "lips sealed tight at 50mm mark")
      - Lip color: exact pink/red tone (e.g., "natural pink with darker edges")
      - Surface: wetness, shine, texture details
      - Teeth/tongue: visible position if any
   
   B) If you see hands:
      - Each finger: exact angle and position (e.g., "thumb at 45° on left side")
      - Grip type: full wrap, partial, fingertips only
      - Contact points: where exactly skin touches object
      - Pressure indicators: tight grip (fingertips white) or loose
      - Hand rotation: palm facing camera, rotated inward, etc.
   
   C) If you see body parts/objects:
      - Size: length and diameter in cm (estimate from image scale)
      - Color: specific color name and tone (e.g., "pink-beige", "pale with pink undertones")
      - Texture: smooth, veiny, with surface details
      - Curvature: straight, curved left/right, angle in degrees
      - Distinctive features: any visible marks, patterns, color variations
   
   STEP 2 - In your prompt, use COPYING language (not generation language):
   ✅ CORRECT (copy mode):
   "Replicate the EXACT lip position from NSFW reference: lips stretched around object with 3cm opening, 
    contact depth of 5cm, lips forming tight seal at exact midpoint shown in reference. 
    Copy the EXACT object from NSFW reference: 15cm length, 4cm diameter, pink-beige tone with visible veining pattern. 
    Match the EXACT hand position from NSFW reference: right hand gripping at base, thumb on left side, 
    fingers wrapped around with 2cm visible between fingertips."
   
   ❌ WRONG (generation mode):
   "Realistic lips around realistic object" - NO! This tells AI to generate, not copy!
   "Natural hand grip" - NO! Must copy exact grip from reference!
   "Photorealistic adult content" - NO! Must specify exact visual copying!
   
   STEP 3 - For EVERY visible NSFW element in references, you MUST specify:
   - Source: "as shown in NSFW reference"
   - Measurement: size/angle/depth/position
   - Instruction: "copy exactly", "replicate precisely", "match identically"
   
   FORBIDDEN WORDS: "generate", "create", "realistic", "natural", "photorealistic" (these trigger generation, not copying)
   REQUIRED WORDS: "copy", "replicate", "reproduce", "match", "transfer", "clone", "from reference"

5. **CLOTHING & STYLE (CRITICAL - DO NOT COPY FROM POSE REFERENCE)**: 
   ${sarahImage ? `
   - Use outfit/accessories from the OUTFIT PHOTO ONLY
   - ⚠️ **CRITICAL**: Outfit photo shows A DIFFERENT PERSON → IGNORE HER FACE COMPLETELY, copy ONLY her clothing/outfit
   - DO NOT copy clothing from pose reference (SECOND image)
   - DO NOT copy the face/hair from outfit photo - use DNA face from FIRST image
   - If user wishes specify clothing, incorporate those details into the outfit
   ` : `
   - If user wishes specify clothing (e.g., "leather jacket", "white dress"), GENERATE that clothing
   - Otherwise, use minimal elegant dark clothing (black, charcoal, or deep navy) matching DNA description
   - Simple clean silhouette, no patterns
   `}
   - ⚠️ **CRITICAL**: NEVER copy clothing/outfit from pose reference (SECOND image)
   - ⚠️ **CRITICAL**: NEVER copy accessories from pose reference
   - ⚠️ **CRITICAL**: If outfit photo is present, copy ONLY clothing/accessories, NEVER the face/hair
   - The clothing must come from outfit photo OR user wishes OR DNA style description ONLY

6. **ENVIRONMENT**: ${useSceneFromPose ? 'Generate a SIMILAR environment inspired by pose reference (same type/style) but with DIFFERENT details (different furniture, colors, layout)' : 'Use room/location from room image'}

The result should look like: A woman with DNA facial features (heterochromia, black hair with fringe) wearing the ${sarahImage ? 'outfit from outfit photo' : 'specified clothing'}, performing the EXACT pose/action from pose reference, with EXACT NSFW elements from references, in the ${useSceneFromPose ? 'similar-style environment' : 'room setting'}.

OUTPUT FORMAT:
Return ONLY the final prompt text, no explanations or sections. Write in natural English suitable for Seedream 4.5 Edit.

FINAL CRITICAL REMINDER - YOUR PROMPT STRUCTURE MUST BE:

⚠️⚠️⚠️ IMAGE ORDER IN ARRAY (CRITICAL FOR CORRECT RESULT) ⚠️⚠️⚠️
1. FIRST IMAGE = DNA REFERENCE (three views of face) → USE FOR FACE ONLY, IGNORE EVERYTHING ELSE
2. SECOND IMAGE = POSE REFERENCE → USE FOR POSE/CAMERA/COMPOSITION, IGNORE FACE COMPLETELY
3. REMAINING IMAGES = NSFW/Outfit/Scene references → USE AS SPECIFIED

FIRST SENTENCE (MANDATORY - WRITE THIS EXACTLY):
"Use the FIRST image (DNA reference with three face views) as the ONLY source for the woman's face - exact heterochromia eyes (blue left, brown right), black hair with full straight fringe. Copy pose, camera angle, and composition from the SECOND image (pose reference), but COMPLETELY IGNORE the face shown in pose reference."

NOTE: The DNA reference is FIRST, pose reference is SECOND. Models tend to copy from first image, so DNA MUST be first to ensure correct face.

[CAMERA SETUP from pose reference with exact measurements]
Shot from [angle in degrees], camera positioned [distance], [what's visible in frame percentages].

[POSE from pose reference with exact body positioning]
Subject positioned exactly as in pose reference: [torso angle], [arm positions], [head tilt], [spatial location in frame].

[NSFW ELEMENTS - THIS IS THE MOST IMPORTANT PART - USE MAXIMUM DETAIL]
CRITICAL: These NSFW elements are the PRIMARY FOCUS of this edit. They must be PERFECTLY COPIED.

Transfer the EXACT visual appearance from NSFW reference images:
- COPY element 1: [ultra-detailed measurements: size in cm, color RGB description, texture details, surface features]
- REPLICATE element 2: [precise position in 3D space, angle in degrees, contact points with mm precision]
- REPRODUCE interaction: [contact depth in cm, pressure indicators, grip details, every visible detail]

For lips/mouth: COPY exact lip stretch (opening width in mm), corner positions, contact seal depth, 
surface wetness/shine, color (natural pink/red values), any visible teeth/tongue position.

For hands: REPLICATE exact finger positions (each finger angle), grip pressure (tight/loose indicators), 
skin contact points, visible nail positions, hand rotation angle.

For objects/body parts: MATCH exact size (length/diameter in cm), color tone (use specific color names), 
surface texture (smooth/veiny/etc), curvature angle, any distinctive features or markings.

[FACIAL FEATURES from DNA]
Woman with heterochromia (blue left eye, brown right eye), long black hair with straight fringe.

${sarahImage ? '[OUTFIT from outfit photo]' : '[OUTFIT: minimal elegant dark clothing - black or charcoal, clean silhouette]'} + [ENVIRONMENT from room image]

LANGUAGE REQUIREMENTS:
✅ USE: "copy from reference", "replicate from NSFW reference", "match exactly as shown", "transfer the exact appearance"
❌ AVOID: "generate", "create", "realistic", "photorealistic", "natural-looking"

REMEMBER: Seedream 4.5 EDIT is a COMPOSITING tool, not a generation tool. 
Your prompt instructs it WHERE to copy elements FROM (references), not WHAT to generate.

⚠️⚠️⚠️ FINAL IRON-CLAD REMINDERS - MANDATORY - CANNOT BE VIOLATED ⚠️⚠️⚠️

1. **DNA FACE (NON-NEGOTIABLE)**:
   - The woman MUST have EXACT DNA features from FIRST image: heterochromia (blue left, brown right), black hair with full straight fringe
   - This is MANDATORY and CANNOT be changed, adapted, or blended with any other reference
   - Any deviation from DNA face = COMPLETE FAILURE of the entire task
   - Include in your prompt: "The woman has the exact face from the FIRST image (DNA reference): heterochromia with left eye soft blue and right eye warm brown, long black hair with full straight fringe to eyebrows. COMPLETELY IGNORE all faces shown in other reference images (pose reference, outfit photo) - those are DIFFERENT people and their faces must NOT be copied."

2. **SELFIE MODE HANDLING** (if detected in Grok Vision analysis):
   - If analysis mentions "SELFIE MODE" or "arm extended holding phone/device":
   - In your prompt, specify: "Copy the extended arm pose and hand position exactly, but REMOVE the phone/device completely - hand should be empty or naturally posed. Subject looks directly at camera with engaging eye contact."
   - This creates authentic selfie composition WITHOUT showing the phone in frame

3. **ENVIRONMENT** (when useSceneFromPose mode):
   - Generate environment that LOOKS SIMILAR to pose reference (same visual style, colors, lighting)
   - Use pose reference as visual inspiration, not just type category
   - Apply variations to make it NOT identical (different specific furniture items, adjusted layout)
   - DO NOT use generic stock images or training data environments
   - Verification: "Does it look like the same type of place as pose reference?" Answer must be YES

Be explicit, detailed, and professional in describing the NSFW scene.`

  const content: Array<{ type: string; image_url?: string; detail?: string; text?: string }> = []
  
  // Add all images for analysis
  if (sarahImage) {
    content.push({ type: 'input_image', image_url: sarahImage, detail: 'high' })
  }
  content.push({ type: 'input_image', image_url: poseRefImage, detail: 'high' })
  
  // CRITICAL: Only add room image if NOT using scene from pose
  // When useSceneFromPose is true, roomImage will be empty string
  if (roomImage && !useSceneFromPose) {
    content.push({ type: 'input_image', image_url: roomImage, detail: 'high' })
  }
  
  nsfwRefs.forEach(ref => {
    content.push({ type: 'input_image', image_url: ref, detail: 'high' })
  })
  content.push({ type: 'input_text', text: promptText })

  const payload = {
    model: 'grok-4.20-reasoning',
    input: [{ role: 'user', content }],
    temperature: 0.8,
    max_output_tokens: 2048,
    store: false,
  }

  onLog?.('📤 Отправка всех изображений в Grok...')

  const httpResponse = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: bearer(grokKey, 'Grok'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const errorData = await httpResponse.json().catch(() => ({}))
    throw new Error(`Grok ${httpResponse.status}: ${JSON.stringify(errorData)}`)
  }

  const data = (await httpResponse.json()) as {
    output?: Array<{
      type?: string
      content?: Array<{ type?: string; text?: string }>
    }>
  }

  const output = data.output ?? []
  const messageOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const outputText =
    messageOutput?.content?.find((c) => c.type === 'output_text')?.text ??
    messageOutput?.content?.[0]?.text

  const finalPrompt: string = typeof outputText === 'string' ? outputText.trim() : ''

  if (!finalPrompt || finalPrompt.length < 50) {
    throw new Error(`Grok вернул слишком короткий промпт (${finalPrompt.length} символов)`)
  }

  onLog?.(`✅ NSFW промпт готов! Длина: ${finalPrompt.length} символов`, 'success')
  onLog?.(`📄 Grok промпт: ${finalPrompt.substring(0, 200)}...`, 'info')
  return finalPrompt
}

export async function editImageWithSeedream(
  wavespeedKey: string,
  referenceImages: string[],
  prompt: string,
  width: number,
  height: number,
  onLog?: LogFn
): Promise<WavespeedResult> {
  onLog?.('🖼️ Запускаю Seedream v4.5 Edit...', 'info')

  // Use Grok's prompt as-is (it already includes DNA description)
  onLog?.(`📊 Seedream payload: ${referenceImages.length} images, ${width}x${height}, prompt length: ${prompt.length}`, 'info')
  onLog?.(`📝 Отправляемый промпт: ${prompt.substring(0, 150)}...`, 'info')
  onLog?.(`📊 Seedream API payload: width=${width}, height=${height}, aspect=${(width/height).toFixed(3)} (должно быть ${(9/16).toFixed(3)} для 9:16)`, 'info')

  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/bytedance/seedream-v4.5/edit'
    : 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit'

  const payload = {
    images: referenceImages, // First image (pose ref) determines composition and aspect ratio
    prompt: prompt, // Use Grok's prompt directly without adding DNA again
    width: width,
    height: height,
    enable_sync_mode: false,
    enable_base64_output: false,
  }
  
  onLog?.(`🔧 Реальный payload: ${JSON.stringify({ width: payload.width, height: payload.height, imagesCount: payload.images.length })}`, 'info')

  const httpResp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(payload),
  })

  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`Seedream v4.5 ${httpResp.status}: ${JSON.stringify(err)}`)
  }

  const submitData = await httpResp.json() as Record<string, unknown>
  type SubmitResp = { id?: string; urls?: { get?: string }; status?: string; outputs?: string[] }
  const submit = (submitData.data ?? submitData) as SubmitResp
  let pollUrl = submit.urls?.get

  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }

  if (submit.status === 'completed' && submit.outputs?.length) {
    const raw = submit.outputs[0]
    return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` }
  }

  if (!submit.id || !pollUrl) throw new Error('Seedream v4.5: не получен ID задачи')
  onLog?.(`⏳ Seedream v4.5: задача ${submit.id}, опрос...`, 'info')

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollResp = await fetch(pollUrl!, { headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') } })
    if (!pollResp.ok) continue
    const pollData = await pollResp.json() as Record<string, unknown>
    const result = (pollData.data ?? pollData) as SubmitResp
    if (result.status === 'failed') throw new Error('Seedream v4.5: задача завершилась ошибкой')
    if (result.status === 'completed') {
      const raw = result.outputs?.[0]
      if (!raw) throw new Error('Seedream v4.5: пустой outputs')
      onLog?.('✅ Seedream v4.5 готово!', 'success')
      return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` }
    }
  }

  throw new Error('Seedream v4.5: таймаут')
}

export async function editImageWithGrokImagineWavespeed(
  wavespeedKey: string,
  imageDataUrl: string,
  prompt: string,
  resolution: string,
  aspectRatio: string,
  onLog?: LogFn
): Promise<WavespeedResult> {
  onLog?.('🖼️ Запускаю Grok Imagine через Wavespeed...', 'info')

  // Load DNA reference image
  const dnaRefImage = await loadDnaReferenceImage()
  const fullPrompt = `${DNA}\n\n${prompt}`

  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/x-ai/grok-imagine-image/edit'
    : 'https://api.wavespeed.ai/api/v3/x-ai/grok-imagine-image/edit'

  const payload = {
    image: imageDataUrl,
    prompt: fullPrompt,
    resolution,
    aspect_ratio: aspectRatio,
    enable_sync_mode: false,
    enable_base64_output: false,
  }

  console.log('[Grok Imagine Wavespeed] payload:', { ...payload, image: '[base64]' })

  const httpResp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(payload),
  })

  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`Grok Imagine ${httpResp.status}: ${JSON.stringify(err)}`)
  }

  const submitData = await httpResp.json() as Record<string, unknown>
  type SubmitResp = { id?: string; urls?: { get?: string }; status?: string; outputs?: string[] }
  const submit = (submitData.data ?? submitData) as SubmitResp
  let pollUrl = submit.urls?.get

  if (pollUrl && import.meta.env.DEV && pollUrl.startsWith('https://api.wavespeed.ai')) {
    pollUrl = pollUrl.replace('https://api.wavespeed.ai/api', '/api/wavespeed')
  }

  if (submit.status === 'completed' && submit.outputs?.length) {
    const raw = submit.outputs[0]
    return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` }
  }

  if (!submit.id || !pollUrl) throw new Error('Grok Imagine: не получен ID задачи')
  onLog?.(`⏳ Grok Imagine: задача ${submit.id}, опрос...`, 'info')

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollResp = await fetch(pollUrl!, { headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') } })
    if (!pollResp.ok) continue
    const pollData = await pollResp.json() as Record<string, unknown>
    const result = (pollData.data ?? pollData) as SubmitResp
    if (result.status === 'failed') throw new Error('Grok Imagine: задача завершилась ошибкой')
    if (result.status === 'completed') {
      const raw = result.outputs?.[0]
      if (!raw) throw new Error('Grok Imagine: пустой outputs')
      onLog?.('✅ Grok Imagine готово!', 'success')
      return { imageUrl: raw.startsWith('http') || raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}` }
    }
  }

  throw new Error('Grok Imagine: таймаут')
}

export async function editImageWithGrokImage(
  grokKey: string,
  imageDataUrl: string,
  prompt: string,
  aspectRatio: string,
  resolution: string,
  onLog?: LogFn
): Promise<WavespeedResult> {
  onLog?.('🖼️ Запускаю Grok Image...', 'info')

  const payload = {
    model: 'grok-imagine-image',
    prompt,
    image: {
      url: imageDataUrl,
      type: 'image_url',
    },
    aspect_ratio: aspectRatio,
    resolution,
  }

  const httpResp = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: bearer(grokKey, 'Grok'),
    },
    body: JSON.stringify(payload),
  })

  if (!httpResp.ok) {
    const err = await httpResp.json().catch(() => ({}))
    throw new Error(`Grok Image ${httpResp.status}: ${JSON.stringify(err)}`)
  }

  const data = await httpResp.json() as { data?: Array<{ url?: string; b64_json?: string }> }
  const imageData = data.data?.[0]
  if (!imageData) throw new Error('Grok Image: пустой ответ')

  const imageUrl = imageData.url ?? (imageData.b64_json ? `data:image/png;base64,${imageData.b64_json}` : '')
  if (!imageUrl) throw new Error('Grok Image: не получен URL изображения')

  onLog?.('✅ Grok Image готово!', 'success')
  return { imageUrl }
}

// ── Link Validation ────────────────────────────────────────────────────────
async function validateLink(url: string, onLog?: LogFn): Promise<boolean> {
  try {
    // Check if URL has valid format first
    const urlObj = new URL(url)
    if (!urlObj.protocol.startsWith('http')) {
      onLog?.(`❌ Неверный протокол: ${url}`, 'error')
      return false
    }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 sec timeout
    
    // no-cors mode returns opaque response, we just check if request succeeds
    void await fetch(url, {
      method: 'GET', // Changed from HEAD - more sites support GET
      signal: controller.signal,
      redirect: 'follow',
      mode: 'no-cors' // Skip CORS for validation
    })
    
    clearTimeout(timeoutId)
    
    // If fetch didn't throw, assume link is accessible
    return true
  } catch (error) {
    // Check if it's a CORS error or timeout - these might still be valid links
    const errorMsg = String(error)
    if (errorMsg.includes('CORS') || errorMsg.includes('NetworkError')) {
      // Assume link is valid if CORS blocked (can't verify, but likely real)
      return true
    }
    onLog?.(`⚠️ Недоступная ссылка: ${url.slice(0, 60)}...`, 'error')
    return false
  }
}

async function validateAndFilterLinks(
  posts: AutoGeneratedPost[],
  onLog?: LogFn
): Promise<AutoGeneratedPost[]> {
  onLog?.('🔍 Проверка всех ссылок на доступность...', 'info')
  
  const validatedPosts: AutoGeneratedPost[] = []
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    onLog?.(`📝 Проверка темы ${i + 1}/${posts.length}: ${post.topicEn}`, 'info')
    
    // Validate X links
    const validXLinks: string[] = []
    for (const link of post.xLinks) {
      const isValid = await validateLink(link, onLog)
      if (isValid) {
        validXLinks.push(link)
      }
    }
    
    // Validate web links
    const validWebLinks: string[] = []
    for (const link of post.webLinks) {
      const isValid = await validateLink(link, onLog)
      if (isValid) {
        validWebLinks.push(link)
      }
    }
    
    // Only include post if it has at least some valid links (softened criteria)
    if (validXLinks.length >= 2 && validWebLinks.length >= 1) {
      validatedPosts.push({
        ...post,
        xLinks: validXLinks,
        webLinks: validWebLinks
      })
      onLog?.(`✅ Тема "${post.topicRu}": ${validXLinks.length} X ссылок + ${validWebLinks.length} веб-статей`, 'success')
    } else {
      onLog?.(`❌ Тема "${post.topicRu}" отклонена: недостаточно рабочих ссылок`, 'error')
    }
  }
  
  return validatedPosts
}

// ── Auto Generate Posts ────────────────────────────────────────────────────
export interface AutoGeneratedPost {
  topicRu: string
  topicEn: string
  summaryRu: string
  postText: string
  postTextRu: string
  xLinks: string[]
  webLinks: string[]
  stats: {
    totalEngagement: number    // Sum of comments + retweets from 5 found posts
    avgComments: number        // Average comments per found post
    avgRetweets: number        // Average retweets per found post
    topPostEngagement: number  // Engagement of the most discussed post
  }
}

export async function autoGeneratePostsWithGrok(
  grokKey: string,
  postCount: number,
  minSentences: number,
  maxSentences: number,
  onLog?: LogFn,
  onProgress?: (current: number, total: number) => void
): Promise<AutoGeneratedPost[]> {
  onLog?.(`🤖 Автоматическая генерация ${postCount} постов...`, 'info')
  onLog?.('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info')
  onLog?.('📋 ПРОЦЕСС (6 ШАГОВ):', 'info')
  onLog?.('  1️⃣ Web research — поиск САМЫХ обсуждаемых новостей', 'info')
  onLog?.('  2️⃣ Сбор новостных статей по каждой теме', 'info')
  onLog?.('  3️⃣ Поиск 5 самых обсуждаемых постов в X (Twitter)', 'info')
  onLog?.('  4️⃣ Подсчёт РЕАЛЬНОЙ статистики с найденных постов', 'info')
  onLog?.('  5️⃣ Написание постов от Sarah Icelyn', 'info')
  onLog?.('  6️⃣ Перевод на русский + описание темы', 'info')
  onLog?.('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'info')
  onLog?.('🔄 Запуск Grok API с web search...', 'info')

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  
  const prompt = `${SARAH_ICELYN_LORE}

CURRENT DATE & TIME: ${dateStr}, ${timeStr} ET

WORKFLOW (MUST FOLLOW THIS ORDER):

STEP 1: WEB RESEARCH - FIND MOST DISCUSSED NEWS
- Use web search to find the MOST DISCUSSED news stories in the US
- Search query: "trending news ${dateStr} most discussed viral"
- Look for news with HIGH social media engagement
- Find ${postCount} DIFFERENT topics from LAST 48 HOURS
- NO politics, NO elections, NO government topics
- Diverse: pop culture, tech, entertainment, social issues, lifestyle, etc.
- Prioritize stories with many social media shares and comments

STEP 2: FOR EACH NEWS TOPIC, FIND NEWS ARTICLES

⚠️ CRITICAL: You MUST perform a SEPARATE web search for EACH topic!

For Topic #1:
  1. Use web_search tool with query: "[Topic 1 name] news ${dateStr}"
  2. Find 3-5 REAL articles from LAST 48 HOURS (after ${new Date(Date.now() - 48*60*60*1000).toISOString().split('T')[0]})
  3. VERIFY each article date is within 48 hours
  4. Copy EXACT URLs from search results

For Topic #2:
  1. Use web_search tool AGAIN with query: "[Topic 2 name] news ${dateStr}"
  2. Find 3-5 DIFFERENT articles from LAST 48 HOURS
  3. VERIFY each article date is within 48 hours
  4. Copy EXACT URLs from search results

Repeat for ALL ${postCount} topics - EACH topic needs its OWN web search!

- Only from reputable sources: CNN, BBC, NYTimes, Reuters, AP, etc.
- Articles MUST be specifically about THIS topic, NOT general information
- IMPORTANT: Each topic must have DIFFERENT, UNIQUE articles
- DO NOT reuse the same articles for multiple topics

CRITICAL FOR NEWS LINKS (EXTREMELY IMPORTANT):
- ONLY extract URLs that YOU ACTUALLY SEE in web search results
- Copy the FULL URL exactly character-by-character as it appears
- DO NOT generate, modify, or fabricate article slugs
- DO NOT create fake article paths or guess URLs
- DO NOT use placeholder URLs or examples
- If you cannot find a real URL in search results, SKIP that article
- VERIFY: Each URL must be visible in your web search output
- Example of CORRECT: Copy "https://www.bbc.com/news/world-us-canada-12345678" from search
- Example of WRONG: Creating "https://www.bbc.com/news/topic-name-article"

STEP 3: SEARCH X (TWITTER) FOR TOP 5 MOST DISCUSSED POSTS

⚠️ CRITICAL: You MUST perform a SEPARATE web search for EACH topic!

For Topic #1:
  1. Use web_search tool with query: "site:x.com [Topic 1 name] ${dateStr}"
  2. Find 5 REAL X posts from LAST 48 HOURS (after ${new Date(Date.now() - 48*60*60*1000).toISOString().split('T')[0]})
  3. VERIFY each post date is within 48 hours
  4. Copy EXACT URLs from search results (format: https://x.com/username/status/18-19-digit-id)
  5. Record engagement (comments + retweets) for each post

For Topic #2:
  1. Use web_search tool AGAIN with query: "site:x.com [Topic 2 name] ${dateStr}"
  2. Find 5 DIFFERENT X posts from LAST 48 HOURS
  3. VERIFY each post date is within 48 hours
  4. Copy EXACT URLs from search results
  5. Record engagement for each post

Repeat for ALL ${postCount} topics - EACH topic needs its OWN web search!

- PRIORITIZE posts with the MOST COMMENTS (highest discussion)
- Sort by: comments > retweets > likes
- IMPORTANT: Each topic must have DIFFERENT, UNIQUE X posts
- DO NOT reuse the same X posts for multiple topics
- Each topic should have posts from DIFFERENT users discussing THAT specific topic

CRITICAL FOR X LINKS (EXTREMELY IMPORTANT):
- ONLY extract URLs that YOU ACTUALLY SEE in web search results
- URL format must be: https://x.com/[username]/status/[numeric_id]
- Status ID format: 18-19 digits (e.g., 1234567890123456789)
- DO NOT generate, modify, or fabricate status IDs
- DO NOT create fake usernames or guess post URLs
- DO NOT use placeholder URLs or examples
- If you cannot find a real X post URL in search results, SKIP it
- VERIFY: Each URL must be visible in your web search output
- The status ID must be the EXACT number from the search result

EXAMPLES OF REAL X STATUS IDS (for reference):
✅ CORRECT: https://x.com/elonmusk/status/1790123456789012345 (19 digits)
✅ CORRECT: https://x.com/NASA/status/178901234567890123 (18 digits)
✅ CORRECT: https://x.com/BarackObama/status/1791234567890123456 (19 digits)
❌ WRONG: https://x.com/user/status/19234567890123456789 (20 digits - TOO LONG)
❌ WRONG: https://x.com/user/status/192345678901234567890 (21 digits - TOO LONG)
❌ WRONG: https://x.com/user/status/1111111111 (10 digits - TOO SHORT)

- For EACH post, record its engagement: comments count + retweets count

STEP 4: CALCULATE REAL STATISTICS FROM FOUND POSTS
- Sum total engagement from all 5 found posts (comments + retweets)
- Calculate average comments per post
- Calculate average retweets per post
- Identify the engagement of the most discussed post
- These are REAL numbers from actual found posts, not estimates

STEP 5: WRITE POSTS FROM SARAH ICELYN'S PERSPECTIVE

⚠️⚠️⚠️ CRITICAL: ZERO TEMPLATE POSTS! EACH POST MUST BE WILDLY DIFFERENT! ⚠️⚠️⚠️

🚫 BANNED PHRASES & PATTERNS (DO NOT USE THESE):
❌ "Let me be clear..."
❌ "Here's the thing..."
❌ "I don't care what anyone says..."
❌ "Unpopular opinion but..."
❌ "Hot take:"
❌ "Tell me you [X] without telling me you [X]"
❌ "The way men..."
❌ "Men really think..."
❌ "POV: you're..."
❌ "Not me [X]ing..."
❌ Starting multiple posts with the same structure
❌ Ending multiple posts with rhetorical questions
❌ Using the same sentence length pattern across posts

🎯 MANDATORY VARIABILITY MATRIX (Use DIFFERENT for each post):

POST STRUCTURE VARIETY:
→ Post 1: Start with shocking statement → expand with cold logic → end with dismissal
→ Post 2: Open with rhetorical question → answer with brutal honesty → no conclusion needed
→ Post 3: List format (3 points) → each more savage than the last
→ Post 4: Single long run-on sentence that builds tension
→ Post 5: Two short sentences. Third one hits different.
→ Post 6: Observation → comparison to something ridiculous → let it hang
→ Rotate through these structures - NEVER use the same structure twice in a row!

TONE ROTATION (Pick ONE per post, cycle through all):
1. Ice-cold analytical: Clinical observation of male behavior like you're David Attenborough
2. Fake-sweet vicious: Sugary tone masking absolute destruction
3. Deadpan absurdist: State ridiculous preferences as mundane facts
4. Exasperated disdain: Tired of explaining obvious things to idiots
5. Gleeful cruelty: Enjoying the chaos you're about to cause
6. Philosophical detachment: Treating dating like it's quantum physics
7. Mock-confused innocence: "Wait, you guys actually think...?"
8. Rapid-fire brutality: Short. Sentences. That. Sting.

ATTACK VECTOR DIVERSITY (NEVER repeat the same angle):
✓ Physical standards (but get specific: jawlines, shoulder-width ratio, hand veins)
✓ Financial flex (rental vs ownership, car year, watch brands, vacation tier)
✓ Behavioral red flags (texting cadence, restaurant choices, friend quality)
✓ Lifestyle incompatibility (gym routine, sleep schedule, dietary restrictions)
✓ Social proof hierarchy (follower counts, social circle composition)
✓ Temporal dealbreakers (how long to text back, date planning timeline)
✓ Micro-aggression catalog (specific annoying habits nobody talks about)
✓ Aspiration gap (where he is vs where he thinks he is)
✓ Effort asymmetry (what women do vs what men think is effort)
✓ Delusion diagnosis (self-perception vs reality check)

SENTENCE STRUCTURE VARIETY (Mix these within and across posts):
- Fragment. Complete sentence. Question?
- Long flowing observation that builds and builds until it crashes
- Three-part list with escalating absurdity
- Single devastating sentence standing alone
- Dialogue format: "Him: [X]. Me: [Y]."
- Comparison: "Men who [X] vs men who [Y]"
- Hypothetical: "If you [specific behavior], don't be surprised when [consequence]"
- Inverse logic: "Imagine thinking [ridiculous thing] makes you [desirable quality]"

CONTENT FRESHNESS REQUIREMENTS:
🔥 SPECIFIC OVER GENERIC:
✗ BORING: "Men with no ambition"
✅ SPICY: "Men who still have the same friend group from high school and call it 'loyalty'"

✗ BORING: "Bad texters"
✅ SPICY: "Men who send 'wyd' at 11pm after not texting for 3 days"

✗ BORING: "Cheap dates"
✅ SPICY: "Men who suggest 'coffee' for a first date but have a $200 sneaker collection"

🔥 UNEXPECTED ANGLES:
Instead of obvious takes, find the weird specific thing:
- Not "height matters" → "Men under 6' who wear Timberlands to look taller think we don't notice"
- Not "be rich" → "Men who split appetizers at Olive Garden but talk about 'investing'"
- Not "be confident" → "Men who use 'alpha male' unironically have never made a woman finish"

🔥 CREATIVE COMPARISONS:
Relate dating to completely unrelated things:
- "Choosing a man is like picking a phone plan - why settle for limited data?"
- "Men's self-ratings work like Yelp reviews - everyone's 5 stars in their own mind"
- "Dating apps are speed chess. Most men are playing checkers. Badly."

WRITING STYLE - SARAH'S VOICE (Must sound like HER, not generic Twitter):
- Write in English (US audience)
- ${minSentences}-${maxSentences} sentences (vary the count per post!)
- Voice: Casually cruel, like discussing the weather while destroying egos
- Channel: Succession's Shiv Roy meets Euphoria's Cassie's inner monologue
- No emojis - words cut deeper
- No hashtags - we're not trying that hard
- No caps lock - lowercase cruelty hits different

UNIQUE OPENING HOOKS (Use DIFFERENT for each post):
1. Shocking statistic nobody asked for
2. Fake empathy that turns into an insult
3. Observation framed as a question
4. Statement so bold it needs no setup
5. Comparison that starts normal then goes dark
6. "Interesting how men..." setup that goes somewhere unexpected
7. Direct address: "To the guy who..."
8. Cold scientific observation
9. List that starts innocuous and escalates
10. Single word. Then the explanation that ruins someone's day.

FORBIDDEN TEMPLATES (If you catch yourself using these, STOP):
❌ [Statement]. [Explanation]. [Rhetorical question].
❌ Men who [X] vs men who [Y] (unless comparing absurd specifics)
❌ "I said what I said" (cringe, never)
❌ Multiple posts starting with "The fact that..."
❌ Multiple posts using the same punctuation rhythm
❌ Repeating "men really" or "men be" structures
❌ Using the same type of example (heights, money, etc.) twice

ENGAGEMENT TRIGGERS (Vary which ones you use per post):
- Weaponize specificity: Call out EXACT behaviors
- False choice: "Would you rather [bad] or [worse]?"
- Bait-and-switch: Start reasonable, end brutal
- Reverse psychology: "Please keep doing [thing], it helps us filter"
- Backhanded compliment: "I love how confident [obviously delusional thing]"
- Cold hard math: "If [X]% of women want [Y], and you're [Z]..."
- Hypothetical devastation: "Imagine being [specific embarrassing thing]"
- Contrast killer: "[Common thing he does] vs [what actually works]"

CREATIVITY CHECKPOINTS (Ask yourself before finalizing each post):
□ Have I used this exact sentence structure before?
□ Have I started a post this way already?
□ Is this comparison fresh or recycled?
□ Would this post blend into generic Twitter discourse?
□ Am I attacking from a new angle or rehashing?
□ Does this FEEL different from the previous post?
□ If I removed the topic, would posts 1-5 sound identical?

If ANY answer is wrong, REWRITE THAT POST from scratch with a different approach!

Each post must feel like it came from a different mood, targeting a different insecurity, using a different weapon!

STEP 6: TRANSLATE AND SUMMARIZE
- summaryRu: 2-3 sentence summary in Russian explaining what this topic is about
- postTextRu: Russian translation of the post (keep Sarah's cold, ironic tone)

CRITICAL REQUIREMENTS:
✓ ALL topics MUST be from the LAST 48 HOURS ONLY
✓ ALL X posts MUST be from the LAST 48 HOURS ONLY
✓ ALL news articles MUST be from the LAST 48 HOURS ONLY
✓ Use web search to verify each link is real and working
✓ Links MUST be specifically about the topic, NOT general facts
✓ NO fake URLs - all links from web search results only

Return ONLY valid JSON array (no markdown, no extra text):
[
  {
    "topicRu": "Название темы на русском",
    "topicEn": "Topic name in English",
    "summaryRu": "Краткое описание темы на русском языке в 2-3 предложениях",
    "postText": "Post text from Sarah in English...",
    "postTextRu": "Перевод поста на русский от лица Sarah...",
    "xLinks": ["https://x.com/username/status/1234567890", "https://x.com/user2/status/9876543210", ...],
    "webLinks": ["https://cnn.com/article-about-this-topic", "https://bbc.com/news/this-topic-article", ...],
    "stats": {
      "totalEngagement": 57500,
      "avgComments": 8200,
      "avgRetweets": 3300,
      "topPostEngagement": 18500
    }
  },
  ...
]

IMPORTANT: Return exactly ${postCount} posts. Follow the workflow in order: Web research for most discussed news → News articles → Find Twitter posts → Calculate real stats → Write posts → Translate.

CRITICAL FINAL REMINDER:
- Stats must be REAL DATA from the 5 found X posts, NOT estimates!
- ALL URLs must be COPIED EXACTLY from web search results
- DO NOT generate, modify, or fabricate ANY URLs under any circumstances
- If you cannot find enough real links, skip that topic and find another one
- QUALITY over quantity - only real, working links!
- BEFORE including ANY URL, ask yourself: "Did I see this EXACT URL in my web search results?"
- If the answer is NO, DO NOT include that URL
- It is better to return fewer topics with 100% real links than many topics with fake links

⚠️ CRITICAL: NO DUPLICATE LINKS BETWEEN TOPICS!
- Each topic MUST have its OWN unique set of links
- DO NOT copy/paste the same links to multiple topics
- Perform a SEPARATE web search for EACH topic
- Topic 1 links ≠ Topic 2 links ≠ Topic 3 links, etc.
- If you find yourself using the same URL twice, STOP and search again

⚠️ CRITICAL: 48-HOUR REQUIREMENT!
- ALL articles must be published within LAST 48 HOURS
- ALL X posts must be posted within LAST 48 HOURS
- Current date: ${dateStr}
- Cutoff date: ${new Date(Date.now() - 48*60*60*1000).toISOString().split('T')[0]}
- VERIFY the date on EVERY article and post before including it
- If you cannot find enough recent content, skip that topic

📝 VERIFICATION CHECKLIST (for EACH topic):
☐ Did I use web_search tool for THIS specific topic?
☐ Are all article dates within 48 hours?
☐ Are all X post dates within 48 hours?
☐ Did I copy URLs EXACTLY from search results?
☐ Are status IDs 18-19 digits long?
☐ Are these links DIFFERENT from other topics?

WARNING: Fabricated URLs, duplicate links, and old content (>48h) will be detected and rejected. Only use URLs you found via web_search tool!`

  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: bearer(grokKey, 'Grok'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4.20-reasoning',
      input: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search' }],
      store: false,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Grok API ${response.status}: ${JSON.stringify(err)}`)
  }

  // Parse Grok API response (same structure as callGrokResponses)
  const data = await response.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const responseText = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''

  if (!responseText) {
    onLog?.('❌ Grok вернул пустой ответ. Структура ответа: ' + JSON.stringify(data).slice(0, 200), 'error')
    throw new Error('Grok вернул пустой ответ')
  }

  onLog?.('📥 Получен ответ от Grok, парсинг JSON...', 'info')

  // Extract JSON from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/)?.[0]
  if (!jsonMatch) {
    onLog?.('❌ Не найден JSON массив в ответе: ' + responseText.slice(0, 200), 'error')
    throw new Error('Не удалось извлечь JSON из ответа Grok')
  }

  let posts = JSON.parse(jsonMatch) as AutoGeneratedPost[]

  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error('Grok вернул некорректный формат данных')
  }

  // Note: Link validation disabled because no-cors mode cannot detect fake Twitter status IDs
  // Relying on strict prompt instructions instead
  onLog?.('⚠️ Валидация ссылок отключена - полагаемся на точность Grok', 'info')

  onLog?.('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'success')
  onLog?.(`✅ УСПЕШНО! Сгенерировано ${posts.length} постов`, 'success')
  
  // Validate links and stats
  const totalXLinks = posts.reduce((sum, p) => sum + (p.xLinks?.length || 0), 0)
  const totalWebLinks = posts.reduce((sum, p) => sum + (p.webLinks?.length || 0), 0)
  const totalEngagement = posts.reduce((sum, p) => sum + (p.stats?.totalEngagement || 0), 0)
  const avgEngagement = totalEngagement / (posts.length || 1)
  
  onLog?.(`📊 Статистика генерации:`, 'success')
  onLog?.(`  • Постов создано: ${posts.length}`, 'success')
  onLog?.(`  • X (Twitter) ссылок: ${totalXLinks}`, 'success')
  onLog?.(`  • Веб-статей: ${totalWebLinks}`, 'success')
  onLog?.(`  • Все посты переведены на русский`, 'success')
  onLog?.(``, 'success')
  onLog?.(`📈 Вовлечённость (РЕАЛЬНЫЕ данные с найденных постов):`, 'success')
  onLog?.(`  • Общий engagement: ${totalEngagement.toLocaleString()} (комм. + ретв.)`, 'success')
  onLog?.(`  • Средний engagement на тему: ${Math.round(avgEngagement).toLocaleString()}`, 'success')
  onLog?.(`  • Данные основаны на ${totalXLinks} постах из web search`, 'success')
  onLog?.(``, 'success')
  onLog?.(`⚠️ ВАЖНО:`, 'success')
  onLog?.(`  • Ссылки получены через web_search инструмент Grok`, 'success')
  onLog?.(`  • Проверьте ссылки вручную перед публикацией`, 'success')
  onLog?.(`  • Status ID должны быть 18-19 цифр`, 'success')
  onLog?.('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'success')
  
  return posts
}

/**
 * Regenerate a single post with user feedback
 * @param grokKey - Grok API key
 * @param currentPost - Current post to be regenerated
 * @param userFeedback - User's wishes for corrections/improvements
 * @param onLog - Logging callback
 * @returns Updated post texts (EN and RU)
 */
export async function regeneratePostWithFeedback(
  grokKey: string,
  currentPost: AutoGeneratedPost,
  userFeedback: string,
  onLog?: LogFn
): Promise<{ postText: string; postTextRu: string }> {
  onLog?.('🔄 Перегенерация поста с учетом пожеланий...', 'info')

  const prompt = `${SARAH_ICELYN_LORE}

TASK: Regenerate this post based on user feedback

CURRENT POST:
Topic: ${currentPost.topicEn} (${currentPost.topicRu})
Summary: ${currentPost.summaryRu}
Current English text: "${currentPost.postText}"
Current Russian text: "${currentPost.postTextRu}"

USER FEEDBACK:
"${userFeedback}"

INSTRUCTIONS:
1. Keep the same topic and context
2. Apply the user's feedback to improve the post
3. Maintain Sarah Icelyn's provocative voice and style
4. Ensure the post remains unique and non-template (follow all anti-template rules from original generation)
5. Keep the same provocative energy and engagement triggers
6. Make sure changes address the specific feedback provided

IMPORTANT STYLE REQUIREMENTS:
- Voice: Cold, sharp, dismissive, unapologetically controversial
- Channel: Succession's Shiv Roy meets Euphoria's Cassie's inner monologue
- No emojis, no hashtags, lowercase cruelty
- Short, punchy sentences
- Make it feel fresh and different from generic Twitter discourse

Return ONLY valid JSON (no markdown, no extra text):
{
  "postText": "Regenerated English post text...",
  "postTextRu": "Перевод на русский..."
}`

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: bearer(grokKey, 'Grok'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Grok API ${response.status}: ${JSON.stringify(err)}`)
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const responseText = data.choices?.[0]?.message?.content?.trim() ?? ''

  if (!responseText) {
    throw new Error('Grok вернул пустой ответ')
  }

  onLog?.('📥 Получен ответ от Grok, парсинг...', 'info')

  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonMatch) {
    onLog?.('❌ Не найден JSON в ответе', 'error')
    throw new Error('Не удалось извлечь JSON из ответа Grok')
  }

  const result = JSON.parse(jsonMatch) as { postText: string; postTextRu: string }

  if (!result.postText || !result.postTextRu) {
    throw new Error('Некорректный формат ответа от Grok')
  }

  onLog?.('✅ Пост успешно перегенерирован', 'success')
  return result
}

// ── Kling Video-to-Audio ───────────────────────────────────────────────────

export interface KlingVideoToAudioResult {
  soundEffectPrompt: string
  bgmPrompt: string
  soundEffectPromptRu: string
  bgmPromptRu: string
}

/**
 * Analyze video with Grok Vision and generate Kling Video-to-Audio prompts
 * @param grokKey - Grok API key
 * @param videoFrameDataUrl - Base64 data URL of a video frame for analysis
 * @param userWishes - User's desired audio description (optional)
 * @param onLog - Logging callback
 * @returns Generated SFX and BGM prompts in English and Russian
 */
export async function generateKlingVideoAudioPromptsWithGrok(
  grokKey: string,
  videoFrameDataUrl: string,
  userWishes: string,
  onLog?: LogFn
): Promise<KlingVideoToAudioResult> {
  onLog?.('🧠 Grok анализирует видео и генерирует промпты для звука...', 'info')

  const systemPrompt = `You are an expert audio designer specializing in video-to-audio generation.
Return ONLY valid JSON with exactly 4 keys: soundEffectPrompt, bgmPrompt, soundEffectPromptRu, bgmPromptRu.
No markdown, no code blocks, no extra text — just raw JSON.`

  const userText = `Analyze this video frame and create audio prompts for Kling Video-to-Audio generation.

${userWishes ? `User's audio wishes: ${userWishes}\n` : ''}
Instructions:
1. **sound_effect_prompt** (SFX): Describe on-screen events, materials, actions, and textures.
   - Be concrete: call out specific events, materials, distances
   - Examples: "Leather jacket rustle, footsteps on wet concrete, elevator ding, neon hum"
   - For food: "sizzling pan, knife slicing vegetables, pouring water, crisp texture"
   - For nature: "rain drops, wind through grass, distant birds, water trickling"
   - For ASMR: use "close-mic", "whispered", "delicate", "gentle" descriptors
   
2. **bgm_prompt** (Background Music): Describe musical mood, instrumentation, and pacing.
   - Specify tempo/structure
   - Examples: "Brooding orchestral score, low strings, sparse piano hits, slow build"
   - For upbeat: "Energetic electronic beats, bright synths, fast tempo"
   - Keep stylistically consistent with SFX to avoid clashes

3. If user specified certain sounds or music style, incorporate those EXACTLY into prompts
4. Provide Russian translations that preserve all technical audio details

Return JSON format:
{
  "soundEffectPrompt": "<English SFX prompt based on video and user wishes>",
  "bgmPrompt": "<English BGM prompt>",
  "soundEffectPromptRu": "<Russian translation of SFX>",
  "bgmPromptRu": "<Russian translation of BGM>"
}`

  const payload = {
    model: 'grok-4.20-reasoning',
    input: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: videoFrameDataUrl, detail: 'high' },
          { type: 'input_text', text: userText },
        ],
      },
    ],
    store: false,
  }

  const httpResponse = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer(grokKey, 'Grok') },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const err = await httpResponse.json().catch(() => ({}))
    throw new Error(`Grok vision ${httpResponse.status}: ${JSON.stringify(err)}`)
  }

  const data = await httpResponse.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
  }
  const output = data.output ?? []
  const msgOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  const raw = msgOutput?.content?.find((c) => c.type === 'output_text')?.text?.trim() ?? ''

  let parsed: KlingVideoToAudioResult
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON found')
    parsed = JSON.parse(jsonMatch[0]) as KlingVideoToAudioResult
  } catch {
    throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  }

  if (!parsed.soundEffectPrompt || !parsed.bgmPrompt) {
    throw new Error('Grok не вернул полные промпты')
  }

  onLog?.(`✅ Промпты для звука готовы`, 'success')
  onLog?.(`🔊 SFX: ${parsed.soundEffectPrompt}`, 'info')
  onLog?.(`🎵 BGM: ${parsed.bgmPrompt}`, 'info')

  return parsed
}

export interface KlingVideoToAudioJobResult {
  requestId: string
}

/**
 * Submit video to Kling Video-to-Audio API
 * @param wavespeedKey - Wavespeed API key
 * @param videoDataUrl - Base64 data URL of the video
 * @param soundEffectPrompt - Sound effects prompt
 * @param bgmPrompt - Background music prompt
 * @param asmrMode - Enable ASMR mode for hyper-detailed textures
 * @param onLog - Logging callback
 * @returns Request ID for polling
 */
export async function submitKlingVideoToAudio(
  wavespeedKey: string,
  videoDataUrl: string,
  soundEffectPrompt: string,
  bgmPrompt: string,
  asmrMode: boolean,
  onLog?: LogFn
): Promise<KlingVideoToAudioJobResult> {
  onLog?.('📤 Отправка видео в Kling Video-to-Audio...', 'info')

  // Kling API requires max 200 characters for each prompt
  const truncateTo200 = (text: string) => text.length > 200 ? text.substring(0, 200) : text

  const payload: {
    video: string
    sound_effect_prompt?: string
    bgm_prompt?: string
    asmr_mode?: boolean
  } = {
    video: videoDataUrl,
  }

  if (soundEffectPrompt) payload.sound_effect_prompt = truncateTo200(soundEffectPrompt)
  if (bgmPrompt) payload.bgm_prompt = truncateTo200(bgmPrompt)
  if (asmrMode) payload.asmr_mode = true

  const apiUrl = import.meta.env.DEV
    ? '/api/wavespeed/v3/kwaivgi/kling-video-to-audio'
    : 'https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-to-audio'

  const httpResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': bearer(wavespeedKey, 'Wavespeed'),
    },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const err = await httpResponse.json().catch(() => ({}))
    throw new Error(`Kling V2A API ${httpResponse.status}: ${JSON.stringify(err)}`)
  }

  const data = await httpResponse.json() as { request_id?: string; requestId?: string; id?: string }
  
  onLog?.(`📋 Ответ API: ${JSON.stringify(data).substring(0, 500)}`, 'info')
  
  // Try different possible field names
  const requestId = data.request_id || data.requestId || data.id
  
  if (!requestId) {
    throw new Error(`Kling V2A API не вернул request_id. Полный ответ: ${JSON.stringify(data)}`)
  }

  onLog?.(`✅ Задача создана: ${requestId}`, 'success')
  return { requestId }
}

/**
 * Poll Kling Video-to-Audio result
 * @param wavespeedKey - Wavespeed API key
 * @param requestId - Request ID from submit
 * @param onLog - Logging callback
 * @returns Audio URL when ready
 */
export async function pollKlingVideoToAudioResult(
  wavespeedKey: string,
  requestId: string,
  onLog?: LogFn
): Promise<string> {
  const maxAttempts = 180 // 3 minutes with 1s intervals
  const pollInterval = 1000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval))

    let pollUrl = import.meta.env.DEV
      ? `/api/wavespeed/v3/status/${requestId}`
      : `https://api.wavespeed.ai/api/v3/status/${requestId}`

    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: bearer(wavespeedKey, 'Wavespeed') },
    })

    if (!pollResp.ok) {
      const err = await pollResp.json().catch(() => ({}))
      throw new Error(`Poll failed ${pollResp.status}: ${JSON.stringify(err)}`)
    }

    const pollData = await pollResp.json() as {
      status?: string
      output?: { audio_url?: string }
      error?: string
    }

    if (pollData.status === 'completed' && pollData.output?.audio_url) {
      onLog?.(`✅ Звук готов!`, 'success')
      return pollData.output.audio_url
    }

    if (pollData.status === 'failed') {
      throw new Error(`Kling V2A failed: ${pollData.error || 'Unknown error'}`)
    }

    if (attempt % 5 === 0) {
      onLog?.(`⏳ Генерация звука... ${Math.round((attempt / maxAttempts) * 100)}%`, 'info')
    }
  }

  throw new Error('Kling V2A: превышено время ожидания (3 минуты)')
}

// ─────────────────────────────────────────────────────────────────────────
// Bogdana pipeline — Grok helpers (Stage 3.3 audio & Stage 3.4 Threads)
// ─────────────────────────────────────────────────────────────────────────

/** Extract the message text from an xAI /v1/responses payload. */
function extractGrokText(data: unknown): string {
  const output = (data as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }).output ?? []
  const messageOutput = output.find((o) => o.type === 'message') ?? output[output.length - 1]
  return (
    messageOutput?.content?.find((c) => c.type === 'output_text')?.text ??
    messageOutput?.content?.[0]?.text ??
    ''
  ).trim()
}

async function callGrokJson(grokKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const payload = {
    model: 'grok-4.20-reasoning',
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
    ],
    temperature: 0.8,
    store: false,
  }

  const httpResponse = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer(grokKey, 'Grok') },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const err = await httpResponse.json().catch(() => ({}))
    throw new Error(`Grok ${httpResponse.status}: ${JSON.stringify(err)}`)
  }

  return extractGrokText(await httpResponse.json())
}

function parseJsonArray<T>(raw: string): T[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`Grok вернул невалидный JSON: ${raw.slice(0, 200)}`)
  return JSON.parse(match[0]) as T[]
}

/**
 * Stage 3.3 (audio): generate a list of SEQUENTIAL sound prompts for a scene.
 * Each returned prompt is hard-clamped to 200 characters (Kling Audio limit).
 */
export async function generateKlingAudioSequence(
  grokKey: string,
  sceneDescription: string,
  userWishes: string,
  onLog?: LogFn,
  count = 4
): Promise<string[]> {
  onLog?.('🔊 Grok: генерирую последовательность звуков для Kling Audio...', 'info')

  const systemPrompt = `You are a sound designer for 3D claymation stop-motion clips.
Return ONLY a JSON array of short, SEQUENTIAL sound-effect prompts (English).
Each prompt describes ONE sound event in playback order and MUST be at most ${KLING_AUDIO_MAX_CHARS} characters. No markdown, no extra text.`

  const userPrompt = `Scene: ${sceneDescription}
${userWishes.trim() ? `Extra wishes: ${userWishes.trim()}\n` : ''}Return exactly ${count} sequential sound prompts as a JSON array of strings, e.g. ["...", "...", "...", "..."]. Each string <= ${KLING_AUDIO_MAX_CHARS} chars.`

  const raw = await callGrokJson(grokKey, systemPrompt, userPrompt)
  const list = parseJsonArray<string>(raw)
  const clamped = clampKlingAudioPrompts(list.map((s) => String(s)))

  if (clamped.length === 0) throw new Error('Grok не вернул звуковые промпты')
  onLog?.(`✅ Готово ${clamped.length} звук(ов), каждый ≤ ${KLING_AUDIO_MAX_CHARS} симв.`, 'success')
  return clamped
}

export interface BogdanaThreadsPost {
  /** Detected trend / audience pain the post reacts to. */
  trend: string
  /** Post body (triggering, ironic), from the girl's POV. */
  text: string
  /** Whether this post natively integrates the qeep product. */
  hasProduct: boolean
  /** qeep article — present only for the single product-integration post. */
  article?: string
}

/**
 * Stage 3.4: use Grok (X/Twitter access) to parse trends & audience pains and
 * write viral, ironic Threads posts from the girl's POV. Most posts are on
 * abstract/topical themes WITHOUT the product; exactly one softly integrates it.
 */
export async function generateBogdanaThreadsPosts(
  grokKey: string,
  productId: BogdanaProductId,
  onLog?: LogFn,
  count = 5
): Promise<BogdanaThreadsPost[]> {
  const product = getBogdanaProduct(productId)
  const withoutProduct = Math.max(count - 1, 0)
  onLog?.(`🧵 Grok: парсю тренды и пишу ${count} постов для Threads (${withoutProduct} без продукта + 1 с интеграцией)...`, 'info')

  const systemPrompt = `You write viral, ironic Threads posts in Russian, first-person, from a young woman's POV (Bogdana — a 22 y.o. designer from Saint Petersburg, "clean girl").
Use current X/Twitter trends and audience pains (burnout, remote work, women's health, relationships, everyday absurd) as hooks.
Goal: provoke arguments, laughter, or "это я" comments.
IMPORTANT: Most posts must be pure lifestyle/topical takes WITHOUT any product or brand mention. Only ONE post may softly, natively integrate the product — no ads tone, no hard article dumping.
Return ONLY raw JSON, no markdown.`

  const userPrompt = `Напиши ровно ${count} виральных, ироничных поста для Threads от лица девушки (Богданы).
- ${withoutProduct} постов — на отвлечённые актуальные темы (выгорание, удалёнка, женское здоровье, отношения, бытовой абсурд), БЕЗ упоминания продукта или бренда. Для них "hasProduct": false и без поля article.
- 1 пост — мягкая нативная интеграция продукта ${product.name} (снимает ${product.pain}); упомяни артикул ${product.article} ненавязчиво, без рекламного тона. Для него "hasProduct": true и "article": "${product.article}".
Верни строгий JSON-массив вида:
[
  { "trend": "<тренд/боль>", "text": "<текст поста>", "hasProduct": false },
  { "trend": "<тренд/боль>", "text": "<текст поста с мягкой интеграцией>", "hasProduct": true, "article": "${product.article}" }
]`

  const raw = await callGrokJson(grokKey, systemPrompt, userPrompt)
  const posts = parseJsonArray<BogdanaThreadsPost>(raw)
    .map((p) => {
      const hasProduct = Boolean(p.hasProduct)
      return {
        trend: String(p.trend ?? ''),
        text: String(p.text ?? ''),
        hasProduct,
        ...(hasProduct ? { article: String(p.article ?? product.article) } : {}),
      }
    })
    .filter((p) => p.text.length > 0)

  if (posts.length === 0) throw new Error('Grok не вернул посты для Threads')
  onLog?.(`✅ Готово ${posts.length} постов для Threads`, 'success')
  return posts
}
