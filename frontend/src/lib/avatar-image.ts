/** Reading a picked image, and cutting the square the reader chose out of it. */

export const AVATAR_SIZE = 256;
const AVATAR_TYPE = "image/webp";
/** Generous for a phone photograph, and refused long before any upload. */
export const MAX_AVATAR_SOURCE_BYTES = 12 * 1024 * 1024;

export class AvatarImageError extends Error {}

/** Decodes the file, so the editor can measure and show it.
 *
 * The object URL is left alive on purpose: the editor shows the same picture
 * on screen, and a revoked URL would leave it staring at an empty circle.
 * Whoever asked for the image releases `image.src` when they are done with it.
 */
export function loadAvatarImage(file: Blob): Promise<HTMLImageElement> {
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    return Promise.reject(new AvatarImageError("too-large"));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new AvatarImageError("decode"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AvatarImageError("decode"));
    };
    image.src = url;
  });
}

/**
 * Cuts one square out of the image and scales it to the stored size.
 *
 * The square is given in the source picture's own pixels, which is what the
 * editor works out from where the reader dragged and how far they zoomed.
 * Doing it here means a 6MB photograph leaves as a few dozen kilobytes.
 */
export async function renderAvatarBlob(
  image: HTMLImageElement,
  sourceX: number,
  sourceY: number,
  sourceSize: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new AvatarImageError("decode");

  // Rounding in the editor can land a fraction of a pixel past the edge, and
  // what falls outside is drawn transparent - a hairline on the avatar.
  const size = Math.min(sourceSize, image.naturalWidth, image.naturalHeight);
  const x = Math.min(Math.max(sourceX, 0), image.naturalWidth - size);
  const y = Math.min(Math.max(sourceY, 0), image.naturalHeight - size);

  context.drawImage(
    image,
    x,
    y,
    size,
    size,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, AVATAR_TYPE, 0.9);
  });
  if (!blob) throw new AvatarImageError("decode");
  return blob;
}
