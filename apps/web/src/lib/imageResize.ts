// Shrinks a product photo in the browser before it is uploaded, so the database and the
// kiosk only ever handle small files: at most 800 px on the longer side, WebP (or JPEG
// where the browser can't write WebP), typically 30–100 KB. The API checks the result
// again (apps/api/src/modules/products/image.ts) and refuses anything over 512 KB.

const MAX_SIDE = 800;
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // a phone photo is a few MB
const MAX_OUTPUT_BYTES = 500 * 1024;
const QUALITY = 0.82;

export interface ResizedImage {
  contentType: "image/webp" | "image/jpeg";
  base64: string;
  /** An object URL for the preview; revoke it when it's no longer shown. */
  previewUrl: string;
  bytes: number;
}

export class ImageResizeError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new ImageResizeError("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
}

export async function resizeProductPhoto(file: File): Promise<ResizedImage> {
  if (!file.type.startsWith("image/")) throw new ImageResizeError("Choose a photo (JPEG, PNG or WebP).");
  if (file.size > MAX_INPUT_BYTES) throw new ImageResizeError("That file is over 25 MB. Choose a smaller photo.");

  let bitmap: ImageBitmap;
  try {
    // from-image: a phone photo taken sideways is turned the right way up.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageResizeError("This photo's format can't be read here. Choose a JPEG, PNG or WebP photo.");
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new ImageResizeError("Could not prepare the photo.");
  // A transparent PNG would otherwise turn black as a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Browsers that can't write WebP hand back a PNG instead; use JPEG for those.
  let blob = await toBlob(canvas, "image/webp", QUALITY);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", QUALITY);
  if (!blob) throw new ImageResizeError("Could not prepare the photo.");
  if (blob.size > MAX_OUTPUT_BYTES) throw new ImageResizeError("The photo is still too large after shrinking. Choose a simpler photo.");

  return {
    contentType: blob.type === "image/webp" ? "image/webp" : "image/jpeg",
    base64: await blobToBase64(blob),
    previewUrl: URL.createObjectURL(blob),
    bytes: blob.size,
  };
}
