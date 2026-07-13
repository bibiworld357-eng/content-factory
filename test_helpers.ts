import {
  buildNanoBananaPrompt,
  buildKlingFramePairs,
  withStaticCamera,
  clampKlingAudioPrompt,
  clampKlingAudioPrompts,
  NANOBANANA_STYLE_SUFFIX,
  KLING_AUDIO_MAX_CHARS,
} from './src/lib/bogdana'
import { bearer } from './src/lib/api'
import {
  mulberry32,
  buildVariantPlan,
  buildFfmpegArgs,
  buildVariantName,
  pickGop,
  pickCrf,
  pickProfile,
} from './src/lib/uniqueizer'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`PASS: ${name}`)
  } else {
    fail++
    console.log(`FAIL: ${name} ${detail}`)
  }
}

// ── NanoBanana: @image1-4 tags + style suffix + prev-frame => @image2 ──────────
const refs = { face: 'FACE', scene: 'SCENE', korzhik: 'KORZHIK', product: 'PRODUCT' }
const first = buildNanoBananaPrompt('a cozy room', refs)
check('NanoBanana appends style suffix', first.prompt.endsWith(NANOBANANA_STYLE_SUFFIX), first.prompt.slice(-40))
check('NanoBanana legend lists @image1', first.prompt.includes('@image1'))
check('NanoBanana legend lists @image2', first.prompt.includes('@image2'))
check('NanoBanana legend lists @image3', first.prompt.includes('@image3'))
check('NanoBanana legend lists @image4', first.prompt.includes('@image4'))
check('First frame @image2 = scene ref', first.referenceImages[1] === 'SCENE', JSON.stringify(first.referenceImages))
check('Ref order = [face,scene,korzhik,product]',
  JSON.stringify(first.referenceImages) === JSON.stringify(['FACE','SCENE','KORZHIK','PRODUCT']))

const next = buildNanoBananaPrompt('same room', refs, 'PREV_FRAME_URL')
check('Subsequent frame @image2 = previous frame', next.referenceImages[1] === 'PREV_FRAME_URL', JSON.stringify(next.referenceImages))
check('Prev-frame legend mentions previous generated frame', next.prompt.includes('previous generated frame'))

// ── Kling: pairing 1->2, 3->4, 5->6 (trailing odd skipped) ─────────────────────
const pairs = buildKlingFramePairs([1,2,3,4,5])
check('5 frames => 2 pairs (odd trailing skipped)', pairs.length === 2, `got ${pairs.length}`)
check('Pair1 = 1->2', pairs[0].start === 1 && pairs[0].end === 2 && pairs[0].pairIndex === 1)
check('Pair2 = 3->4', pairs[1].start === 3 && pairs[1].end === 4 && pairs[1].pairIndex === 2)
check('4 frames => 2 pairs exactly', buildKlingFramePairs([1,2,3,4]).length === 2)
check('1 frame => 0 pairs', buildKlingFramePairs([1]).length === 0)

// ── Static camera injection ────────────────────────────────────────────────────
check('withStaticCamera appends tag', withStaticCamera('slow zoom') === 'slow zoom, Static camera', withStaticCamera('slow zoom'))
check('withStaticCamera no duplicate', withStaticCamera('already Static camera here') === 'already Static camera here')
check('withStaticCamera empty => tag only', withStaticCamera('') === 'Static camera')

// ── Kling Audio 200-char hard limit ────────────────────────────────────────────
const long = 'x'.repeat(350)
check('Single audio prompt clamped to 200', clampKlingAudioPrompt(long).length === KLING_AUDIO_MAX_CHARS, `len=${clampKlingAudioPrompt(long).length}`)
const many = clampKlingAudioPrompts(['ok short', 'y'.repeat(500), '  ', 'z'.repeat(201)])
check('List: empty removed, all <=200', many.every(p => p.length <= 200) && many.length === 3, JSON.stringify(many.map(p=>p.length)))

// ── bearer(): trims key (401 fix) + throws on empty ────────────────────────────
check('bearer trims whitespace/newlines', bearer('  abc123\n') === 'Bearer abc123', bearer('  abc123\n'))
let threw = false
try { bearer('   ', 'Wavespeed') } catch { threw = true }
check('bearer throws on empty key (401 guard)', threw)

// ── Uniqueizer: >=4 video filters, encoder ranges, args, naming ────────────────
const urng = mulberry32(12345)
const plan = buildVariantPlan(urng, 720, 1280, {})
check('Uniqueizer plan has >=4 video filters', plan.videoFilters.length >= 4, `got ${plan.videoFilters.length}`)
check('Uniqueizer plan has audio filters', plan.audioFilters.length >= 2, `got ${plan.audioFilters.length}`)
check('GOP in 45..90', plan.gop >= 45 && plan.gop <= 90, `gop=${plan.gop}`)
check('CRF in 20..23', plan.crf >= 20 && plan.crf <= 23, `crf=${plan.crf}`)
check('Profile main|high', plan.profile === 'main' || plan.profile === 'high', plan.profile)

const args = buildFfmpegArgs('in.mp4', 'out.mp4', plan, true)
check('Args strip metadata', args.includes('-map_metadata') && args[args.indexOf('-map_metadata') + 1] === '-1')
check('Args use libx264', args.includes('libx264'))
check('Args include -vf', args.includes('-vf'))
check('Args include -af when audio present', args.includes('-af'))

const argsNoAudio = buildFfmpegArgs('in.mp4', 'out.mp4', plan, false)
check('No audio => -an, no -af', argsNoAudio.includes('-an') && !argsNoAudio.includes('-af'))

// Pickers stay in range across many draws.
let gopOk = true, crfOk = true, profOk = true
const rng2 = mulberry32(999)
for (let i = 0; i < 200; i++) {
  const g = pickGop(rng2); if (g < 45 || g > 90) gopOk = false
  const c = pickCrf(rng2); if (c < 20 || c > 23) crfOk = false
  const p = pickProfile(rng2); if (p !== 'main' && p !== 'high') profOk = false
}
check('pickGop always 45..90', gopOk)
check('pickCrf always 20..23', crfOk)
check('pickProfile always main|high', profOk)

check('Variant naming', buildVariantName('My Clip.mov', 2) === 'My Clip_variant2.mp4', buildVariantName('My Clip.mov', 2))

// Watermark adds a drawtext filter to the pool.
const wmPlan = buildVariantPlan(mulberry32(7), 1080, 1920, { watermark: true, watermarkText: 'stamp' })
check('Watermark plan still >=4 filters', wmPlan.videoFilters.length >= 4)

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
if (fail > 0) process.exit(1)
