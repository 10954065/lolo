import "server-only";
import sharp from "sharp";
import { sha256Hex } from "@/server/crypto";
import { validationError } from "@/server/errors";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 600;

type ImageKind = "jpeg" | "png" | "webp";

/** Identify the format from magic bytes — never trust the file name or declared MIME type. */
export function sniffImage(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

/**
 * Re-encode an uploaded photo to a 600×600 WebP. Re-encoding strips EXIF/GPS metadata and
 * neutralises polyglot files; pixel limits stop decompression bombs.
 */
export async function processCandidatePhoto(input: Buffer): Promise<{ data: Buffer; mimeType: string; sha256: string }> {
  if (input.length === 0) throw validationError("The photo file is empty.", { photo: ["The file is empty."] });
  if (input.length > MAX_PHOTO_BYTES) throw validationError("The photo must be 5 MB or smaller.", { photo: ["Too large (max 5 MB)."] });
  if (!sniffImage(input)) {
    throw validationError("Upload a JPEG, PNG or WebP image.", { photo: ["Only JPEG, PNG or WebP images are accepted."] });
  }
  try {
    const data = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
    return { data, mimeType: "image/webp", sha256: sha256Hex(data) };
  } catch {
    throw validationError("The image could not be read. Try a different photo.", { photo: ["Unreadable image."] });
  }
}
