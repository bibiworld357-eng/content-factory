// ─────────────────────────────────────────────────────────────────────────
// Video Uniqueizer — builds randomized, visually-imperceptible FFmpeg filter
// graphs so each exported copy of a source video is byte-different.
//
// Runs in the browser via FFmpeg-WASM, so there is no Python/subprocess, no
// filesystem folder picker and no Windows context-menu (.reg / SendTo): the
// results are produced in-memory and offered as downloads.
// ─────────────────────────────────────────────────────────────────────────

export type Rng = () => number

/** Deterministic, seedable PRNG (mulberry32) — used so runs are reproducible in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random float in [min, max). */
function frand(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Random integer in [min, max] (inclusive). */
function irand(rng: Rng, min: number, max: number): number {
  return Math.floor(frand(rng, min, max + 1))
}

/** Nearest even integer, clamped to a sane minimum (x264 needs even dimensions). */
function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

function randomWatermarkText(rng: Rng): string {
  const stamp = Date.now().toString(36)
  const salt = Math.floor(rng() * 0xffffff).toString(36)
  return `${stamp}-${salt}`
}

// ── Individual filter builders (pure; exported for unit tests) ────────────────

/** Crop 1–3% off the edges, then scale back to the original resolution. */
export function buildCropScale(rng: Rng, w: number, h: number): string {
  const pct = frand(rng, 1, 3)
  const cropW = even(Math.floor(w * (1 - pct / 100)))
  const cropH = even(Math.floor(h * (1 - pct / 100)))
  const x = Math.floor((w - cropW) / 2)
  const y = Math.floor((h - cropH) / 2)
  return `crop=${cropW}:${cropH}:${x}:${y},scale=${w}:${h}`
}

/** Rotate 0.3–0.8° (random direction) and crop out the black corners, then rescale. */
export function buildRotate(rng: Rng, w: number, h: number): string {
  const deg = frand(rng, 0.3, 0.8) * (rng() < 0.5 ? -1 : 1)
  const rad = ((deg * Math.PI) / 180).toFixed(6)
  return `rotate=${rad}:fillcolor=black@0,crop=iw*0.96:ih*0.96,scale=${w}:${h}`
}

/** Brightness ±0.04, contrast ±0.03, saturation ±0.05. */
export function buildEq(rng: Rng): string {
  const brightness = frand(rng, -0.04, 0.04).toFixed(4)
  const contrast = (1 + frand(rng, -0.03, 0.03)).toFixed(4)
  const saturation = (1 + frand(rng, -0.05, 0.05)).toFixed(4)
  return `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`
}

/** Barely-perceptible temporal noise (low amplitude). */
export function buildNoise(rng: Rng): string {
  const amp = irand(rng, 1, 4)
  const seed = irand(rng, 1, 99999)
  return `noise=alls=${amp}:allf=t+u:all_seed=${seed}`
}

/** Semi-transparent moving watermark (opacity < 0.02). Requires a drawtext-capable build. */
export function buildDrawtext(rng: Rng, text = randomWatermarkText(rng)): string {
  const alpha = frand(rng, 0.005, 0.02).toFixed(4)
  const fontsize = irand(rng, 18, 30)
  const speed = irand(rng, 20, 60)
  const safe = text.replace(/[':\\]/g, '')
  return `drawtext=text='${safe}':fontcolor=white@${alpha}:fontsize=${fontsize}:x=mod(t*${speed}\\,w):y=h/2+40*sin(t)`
}

export interface SpeedShift {
  /** PTS multiplier for the video (setpts). */
  setpts: number
  /** Matching audio tempo factor (atempo). */
  atempo: number
}

/** setpts 0.992–1.008 for video with the inverse atempo for audio (length ~unchanged). */
export function pickSpeed(rng: Rng): SpeedShift {
  const factor = frand(rng, 0.992, 1.008)
  return { setpts: 1 / factor, atempo: factor }
}

/** Random EQ band, gain ±2 dB. */
export function buildAudioEq(rng: Rng): string {
  const freqs = [120, 1000, 3000, 8000]
  const f = freqs[irand(rng, 0, freqs.length - 1)]
  const g = frand(rng, -2, 2).toFixed(2)
  return `equalizer=f=${f}:t=q:w=1:g=${g}`
}

/** Volume ±1%. */
export function buildVolume(rng: Rng): string {
  return `volume=${(1 + frand(rng, -0.01, 0.01)).toFixed(4)}`
}

/** GOP / keyframe interval 45–90 (x264 -g). */
export function pickGop(rng: Rng): number {
  return irand(rng, 45, 90)
}

/** CRF 20–23. */
export function pickCrf(rng: Rng): number {
  return irand(rng, 20, 23)
}

/** x264 profile main/high. */
export function pickProfile(rng: Rng): 'main' | 'high' {
  return rng() < 0.5 ? 'main' : 'high'
}

// ── Variant plan ──────────────────────────────────────────────────────────────

export interface UniqueizerPlanOptions {
  /** Add a drawtext watermark (experimental — needs a drawtext-capable FFmpeg build). */
  watermark?: boolean
  /** Fixed watermark text; a random stamp is used when omitted. */
  watermarkText?: string
}

export interface VariantPlan {
  videoFilters: string[]
  audioFilters: string[]
  gop: number
  crf: number
  profile: 'main' | 'high'
}

/** Fisher–Yates shuffle driven by the provided rng. */
function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = irand(rng, 0, i)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Build a randomized plan applying AT LEAST 4 video filters plus audio tweaks
 * and randomized encoder parameters. Geometry filters are ordered first.
 */
export function buildVariantPlan(
  rng: Rng,
  width: number,
  height: number,
  options: UniqueizerPlanOptions = {}
): VariantPlan {
  const speed = pickSpeed(rng)

  // Each candidate carries an ordering weight so geometry runs before color/noise.
  const candidates: Array<{ order: number; video: string; audio?: string }> = [
    { order: 0, video: buildCropScale(rng, width, height) },
    { order: 1, video: buildRotate(rng, width, height) },
    { order: 3, video: buildEq(rng) },
    { order: 4, video: buildNoise(rng) },
    { order: 2, video: `setpts=${speed.setpts.toFixed(6)}*PTS`, audio: `atempo=${speed.atempo.toFixed(6)}` },
  ]
  if (options.watermark) {
    candidates.push({ order: 5, video: buildDrawtext(rng, options.watermarkText) })
  }

  // Pick a random subset of at least 4 filters.
  const minFilters = Math.min(4, candidates.length)
  const count = irand(rng, minFilters, candidates.length)
  const chosen = shuffle(rng, candidates)
    .slice(0, count)
    .sort((a, b) => a.order - b.order)

  const videoFilters = chosen.map((c) => c.video)
  const audioFilters = chosen.filter((c) => c.audio).map((c) => c.audio as string)

  // Audio always gets a subtle EQ + volume nudge.
  audioFilters.push(buildAudioEq(rng), buildVolume(rng))

  return {
    videoFilters,
    audioFilters,
    gop: pickGop(rng),
    crf: pickCrf(rng),
    profile: pickProfile(rng),
  }
}

/**
 * Assemble a single-pass FFmpeg argument list from a plan. Metadata is stripped
 * (`-map_metadata -1`) and everything runs in one encode to avoid quality loss.
 */
export function buildFfmpegArgs(
  inputFile: string,
  outputFile: string,
  plan: VariantPlan,
  hasAudio: boolean
): string[] {
  const args = ['-i', inputFile]
  if (plan.videoFilters.length) args.push('-vf', plan.videoFilters.join(','))
  if (hasAudio && plan.audioFilters.length) args.push('-af', plan.audioFilters.join(','))
  args.push('-map_metadata', '-1')
  args.push(
    '-c:v',
    'libx264',
    '-profile:v',
    plan.profile,
    '-crf',
    String(plan.crf),
    '-g',
    String(plan.gop),
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p'
  )
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k')
  else args.push('-an')
  args.push(outputFile)
  return args
}

/** `movie.mp4` + variant 1 => `movie_variant1.mp4`. */
export function buildVariantName(sourceName: string, index: number): string {
  const dot = sourceName.lastIndexOf('.')
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName
  return `${stem}_variant${index}.mp4`
}
