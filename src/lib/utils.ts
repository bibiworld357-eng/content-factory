import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      // Return full data URL for display in <img> tags
      resolve(result)
    }
    reader.onerror = reject
  })
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

/**
 * Compress an image file to reduce its size for localStorage
 * @param file - Image file to compress
 * @param maxWidth - Maximum width (default: 1024)
 * @param maxHeight - Maximum height (default: 1024)
 * @param quality - JPEG quality 0-1 (default: 0.8)
 * @returns Promise<string> - Compressed image as base64 data URL
 */
export function compressImage(
  file: File,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width
        let height = img.height
        
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height
          
          if (width > height) {
            width = maxWidth
            height = width / aspectRatio
          } else {
            height = maxHeight
            width = height * aspectRatio
          }
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        
        ctx.drawImage(img, 0, 0, width, height)
        
        // Convert to base64 with compression
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
        
        // Log compression ratio
        const originalSize = (e.target?.result as string).length
        const compressedSize = compressedDataUrl.length
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1)
        console.log(`[Image Compression] ${file.name}: ${(originalSize / 1024).toFixed(0)}KB → ${(compressedSize / 1024).toFixed(0)}KB (${ratio}% reduction)`)
        
        resolve(compressedDataUrl)
      }
      
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
