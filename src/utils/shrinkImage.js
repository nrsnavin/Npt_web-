/**
 * Photos are made smaller in the browser before they are uploaded.
 *
 * A phone photo arrives at 3–5 MB and 4000 pixels across, and the server keeps what it is sent:
 * at thirty a day that is the whole of the disk's growth — 20–25 GB a year — for pictures that
 * are looked at on a screen. Resized to 2048 pixels on the long side, as a JPEG, the same photo
 * is a few hundred kilobytes and still reads a carton label or a drawing's dimensions. It also
 * uploads in a tenth of the time on a site's mobile signal.
 *
 * Documents (PDF, Word, Excel) and small images are sent as they are. Anything the browser cannot
 * read — a HEIC from an iPhone in Chrome, say — is sent as it is too: this saves space, it must
 * never cost an upload.
 */

export const LONG_EDGE = 2048;
export const SHRINK_ABOVE_BYTES = 1024 * 1024;
export const QUALITY = 0.82;

const SHRINKABLE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Whether a file is worth trying to shrink, from what is known before it is opened. */
export const worthShrinking = ({ type, size }) => SHRINKABLE.includes(type) && size > SHRINK_ABOVE_BYTES;

/** The size to draw a `width` × `height` image at: the long edge at most LONG_EDGE, never enlarged. */
export function fittedSize(width, height, longEdge = LONG_EDGE) {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** `IMG_4821.HEIC` → `IMG_4821.jpg`. */
export const jpegName = (name) => `${String(name || 'photo').replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`;

/** One file, smaller if it can be, otherwise the same file. Never throws. */
export async function shrinkImage(file) {
  if (!worthShrinking(file) || typeof globalThis.createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    /* `from-image` turns the picture the way the phone held it, before the orientation tag is lost. */
    const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fittedSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    /* A JPEG has no transparency; without a white ground a transparent PNG turns black. */
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** A form with every photo in it shrunk; the same form when there was nothing to shrink. */
export async function shrinkForm(form) {
  const entries = [...form.entries()];
  if (!entries.some(([, value]) => value instanceof File && worthShrinking(value))) return form;
  const next = new FormData();
  for (const [key, value] of entries) {
    if (value instanceof File) {
      const file = await shrinkImage(value);
      next.append(key, file, file.name);
    } else {
      next.append(key, value);
    }
  }
  return next;
}
