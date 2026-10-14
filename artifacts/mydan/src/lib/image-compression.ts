/**
 * High-performance client-side image compression utility.
 * Reduces 5MB-15MB mobile camera photos down to ~200KB-350KB before uploading
 * over Egyptian 3G/4G cellular networks to prevent timeouts and conserve Supabase storage.
 */

export interface CompressionOptions {
  maxDimension?: number; // Max width or height in pixels (default: 1400)
  quality?: number;      // JPEG compression quality 0.0 - 1.0 (default: 0.82)
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const { maxDimension = 1400, quality = 0.82 } = options;

  // Don't compress non-image files or vector SVGs
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }

  // If already under 250KB and already JPEG/WebP, keep original
  if (file.size < 250 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    return file;
  }

  try {
    let width = 0;
    let height = 0;
    let drawable: ImageBitmap | HTMLImageElement;

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        drawable = bitmap;
      } catch {
        // Fallback to Image element if createImageBitmap fails on specific EXIF formats
        drawable = await loadImageElement(file);
        width = drawable.naturalWidth || drawable.width;
        height = drawable.naturalHeight || drawable.height;
      }
    } else {
      drawable = await loadImageElement(file);
      width = drawable.naturalWidth || drawable.width;
      height = drawable.naturalHeight || drawable.height;
    }

    if (!width || !height) return file;

    // Calculate scaled dimensions maintaining aspect ratio
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return file;

    // High quality downscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw white background in case of transparent PNGs converted to JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.drawImage(drawable, 0, 0, width, height);

    // Close ImageBitmap if used to free GPU/RAM memory immediately
    if ('close' in drawable && typeof drawable.close === 'function') {
      drawable.close();
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });

    if (!blob) return file;

    // Construct a new File object with a .jpg extension
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const compressedFile = new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    // Only return compressed file if it's actually smaller than the original
    if (compressedFile.size < file.size) {
      return compressedFile;
    }
    return file;
  } catch (err) {
    console.warn('Image compression fallback to original:', err);
    return file;
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
