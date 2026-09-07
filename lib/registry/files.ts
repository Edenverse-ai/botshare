import { z } from "zod";
import sharp from "sharp";

const fileInput = z
  .object({
    kind: z.enum(["NAMEPLATE", "PRESENTATION", "ATTACHMENT"]),
    name: z.string().trim().min(1).max(150),
    mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
    base64: z
      .string()
      .max(7_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict()
  .transform((file, context) => {
    const bytes = Buffer.from(file.base64, "base64");
    const valid =
      file.mime === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        : file.mime === "image/jpeg"
          ? bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
          : file.mime === "image/webp"
            ? bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP"
            : file.kind === "ATTACHMENT" &&
              bytes.toString("ascii", 0, 5) === "%PDF-";
    if (!valid || bytes.length > 5 * 1024 * 1024)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Use a PNG, JPEG or WebP image (or PDF attachment), up to 5 MB, with matching content.",
      });
    return { kind: file.kind, name: file.name, mime: file.mime, bytes };
  });
export const fileMetadata = {
  id: true,
  kind: true,
  name: true,
  mime: true,
  createdAt: true,
} as const;
export async function validateFile(input: unknown) {
  const file = fileInput.parse(input);
  if (file.mime !== "application/pdf") {
    try {
      // Decode, rather than trusting a signature or metadata-only header. Keep
      // the original evidence bytes; only the validation output is discarded.
      await sharp(file.bytes, {
        failOn: "warning",
        limitInputPixels: 25_000_000,
      })
        .resize(1, 1)
        .raw()
        .toBuffer();
    } catch {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["file"],
          message:
            "Upload a complete, decodable image of at most 25 megapixels.",
        },
      ]);
    }
  }
  return file;
}
export function fileResponse(file: { mime: string; bytes: Buffer }) {
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-store",
      "Content-Disposition":
        file.mime === "application/pdf"
          ? 'attachment; filename="evidence.pdf"'
          : "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
