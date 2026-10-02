// Browser-side preparation for registry uploads. Files travel as base64 JSON,
// which inflates them by a third, and a Netlify function accepts at most 6 MB
// per request, so phone photos are re-encoded before upload: oriented, scaled
// to keep nameplate text legible, and saved as JPEG (HEIC included, wherever
// the browser can decode it).
const MAX_EDGE = 2560;
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

export type PreparedUpload = { name: string; mime: string; base64: string };

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function decode(file: File) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This browser cannot read that photo. Export it as JPEG or PNG and try again.",
    );
  }
}

function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not prepare the photo.")),
      "image/jpeg",
      quality,
    ),
  );
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error("Choose a PDF up to 4 MB.");
    return { name: file.name, mime: file.type, base64: await toBase64(file) };
  }

  const image = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the photo.");
  // JPEG has no transparency; keep transparent PNG areas white, not black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  let blob = await encode(canvas, 0.88);
  for (const quality of [0.8, 0.7, 0.6]) {
    if (blob.size <= MAX_UPLOAD_BYTES) break;
    blob = await encode(canvas, quality);
  }
  if (blob.size > MAX_UPLOAD_BYTES)
    throw new Error("This photo is still too large after compression.");

  const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
  return { name, mime: "image/jpeg", base64: await toBase64(blob) };
}
