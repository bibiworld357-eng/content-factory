// Nano Banana 2 pricing calculation
export function calculateNanoBananaPrice(resolution: string, aspectRatio: string): number {
  // Actual pricing from Nano Banana 2 Edit API documentation
  const priceMap: Record<string, number> = {
    '0.5k': 0.045,
    '1k': 0.07,
    '2k': 0.105,
    '4k': 0.14,
  }

  // All aspect ratios have same price for Nano Banana
  return priceMap[resolution] ?? 0.07
}

// Kling 3.0 Pro Image-to-Video pricing calculation
export function calculateKlingPrice(
  duration: number,
  withSound: boolean,
  count: number = 1
): number {
  const baseRatePerSecond = 0.112
  const soundMultiplier = withSound ? 1.5 : 1

  const pricePerVideo = duration * baseRatePerSecond * soundMultiplier
  return pricePerVideo * count
}

// Format price for display
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}

// Get duration label with price
export function getDurationLabel(duration: number, withSound: boolean): string {
  const price = calculateKlingPrice(duration, withSound, 1)
  const soundIcon = withSound ? ' 🔊' : ''
  return `${duration}s • ${formatPrice(price)}${soundIcon}`
}
