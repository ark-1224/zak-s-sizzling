import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";

/**
 * Product photos (product_images). The admin's browser shrinks a photo to a small WebP or
 * JPEG before uploading (apps/web/src/lib/imageResize.ts), so a real upload is around
 * 50 KB; the limit here only stops a stray large file. The bytes must really be the
 * format the upload claims: the type is checked from the file's own signature, and only
 * raster formats are accepted (an SVG can carry scripts).
 */
export const MAX_IMAGE_BYTES = 512 * 1024; // matches the product_images_size_limit CHECK
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

// Base64 is 4 characters per 3 bytes; anything longer can't decode to an allowed size.
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export const uploadImageSchema = z.object({
  contentType: z.enum(IMAGE_TYPES),
  imageBase64: z
    .string()
    .min(1)
    .max(MAX_BASE64_LENGTH, "The photo is too large. Choose a smaller one.")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "The photo isn't valid base64"),
});

/** The image format from the file's first bytes, or null if it isn't WebP, JPEG or PNG. */
export function detectImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

/** The URL the kiosk and admin screens load a photo from; `v` changes with every new photo. */
export function productImageUrl(productId: string, updatedAt: Date): string {
  return `/api/products/${productId}/image?v=${updatedAt.getTime()}`;
}

async function assertProductExists(productId: string) {
  const exists = await prisma.product.count({ where: { id: productId } });
  if (!exists) throw new HttpError(404, "Product not found");
}

export async function saveProductImage(productId: string, input: z.infer<typeof uploadImageSchema>): Promise<void> {
  const bytes = Buffer.from(input.imageBase64, "base64");
  if (bytes.length === 0) throw new HttpError(400, "The photo is empty");
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "The photo is too large. Choose a smaller one.");
  const detected = detectImageType(bytes);
  if (!detected) throw new HttpError(415, "The photo must be a JPEG, PNG or WebP image");
  if (detected !== input.contentType) throw new HttpError(415, `The file is a ${detected}, not a ${input.contentType}`);

  await assertProductExists(productId);
  await prisma.productImage.upsert({
    where: { productId },
    create: { productId, data: bytes, contentType: detected },
    update: { data: bytes, contentType: detected },
  });
}

/** Removes the product's photo; the kiosk goes back to its icon. Removing none is fine. */
export async function deleteProductImage(productId: string): Promise<void> {
  await assertProductExists(productId);
  await prisma.productImage.deleteMany({ where: { productId } });
}

export function getProductImage(productId: string) {
  return prisma.productImage.findUnique({ where: { productId }, select: { data: true, contentType: true, updatedAt: true } });
}
