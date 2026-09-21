import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { dirname, join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { Region } from "../../../shared/exhibits";

export const RASTER_VERSION = "pdfjs-5.4.296-canvas-2x-v1";
const MAX_PIXELS = 24_000_000;
/** Fresh PNG pixels only: no original PDF objects, text, metadata, or attachments. */
export async function rasterizeSource(args: {
  bytes: Uint8Array;
  mimeType: string;
  page: number;
  crop?: Region;
  redactions?: Region[];
}) {
  let canvas: Canvas;
  let rotation = 0;
  let pageCount = 1;
  if (args.mimeType === "application/pdf") {
    const { getDocument, GlobalWorkerOptions } =
      await import("pdfjs-dist/legacy/build/pdf.mjs");
    const require = createRequire(import.meta.url);
    const modulePath = require.resolve("pdfjs-dist/package.json");
    // Turbopack represents traced modules relative to its [project] root.
    const root =
      typeof modulePath === "string" && isAbsolute(modulePath)
        ? dirname(modulePath)
        : join(process.cwd(), "node_modules", "pdfjs-dist");
    GlobalWorkerOptions.workerSrc = pathToFileURL(
      join(root, "legacy/build/pdf.worker.mjs"),
    ).href;
    const task = getDocument({
      data: args.bytes.slice(),
      isEvalSupported: false,
      useSystemFonts: false,
      cMapUrl: join(root, "cmaps") + "/",
      cMapPacked: true,
      standardFontDataUrl: join(root, "standard_fonts") + "/",
      wasmUrl: join(root, "wasm") + "/",
    });
    try {
      const pdf = await task.promise;
      pageCount = pdf.numPages;
      if (args.page < 1 || args.page > pdf.numPages)
        throw new Error("SELECTION_OUT_OF_RANGE");
      const page = await pdf.getPage(args.page);
      rotation = page.rotate;
      const viewport = page.getViewport({ scale: 2, rotation: 0 });
      if (viewport.width * viewport.height > MAX_PIXELS)
        throw new Error(
          "PROCESSING_LIMIT_EXCEEDED: This page is too large for a reviewed image derivative.",
        );
      canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: canvas.getContext(
          "2d",
        ) as unknown as CanvasRenderingContext2D,
        viewport,
        background: "white",
      }).promise;
    } finally {
      await task.destroy();
    }
  } else {
    if (args.page !== 1) throw new Error("SELECTION_OUT_OF_RANGE");
    const image = await loadImage(Buffer.from(args.bytes));
    if (image.width * image.height > MAX_PIXELS)
      throw new Error(
        "PROCESSING_LIMIT_EXCEEDED: Image dimensions exceed 24 megapixels.",
      );
    canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
  }
  const ctx = canvas.getContext("2d");
  for (const region of args.redactions ?? []) {
    // Round outward so antialiased boundary pixels cannot survive.
    const x = Math.floor(region.x * canvas.width),
      y = Math.floor(region.y * canvas.height);
    const right = Math.ceil((region.x + region.width) * canvas.width),
      bottom = Math.ceil((region.y + region.height) * canvas.height);
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, right - x, bottom - y);
    const pixels = ctx.getImageData(x, y, right - x, bottom - y).data;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3] !== 255)
        throw new Error("REDACTION_VERIFICATION_FAILED");
  }
  if (args.crop) {
    const c = args.crop,
      x = Math.floor(c.x * canvas.width),
      y = Math.floor(c.y * canvas.height);
    const target = createCanvas(
      Math.max(1, Math.ceil(c.width * canvas.width)),
      Math.max(1, Math.ceil(c.height * canvas.height)),
    );
    target
      .getContext("2d")
      .drawImage(
        canvas,
        x,
        y,
        target.width,
        target.height,
        0,
        0,
        target.width,
        target.height,
      );
    canvas = target;
  }
  return {
    bytes: new Uint8Array(canvas.toBuffer("image/png")),
    width: canvas.width,
    height: canvas.height,
    rotation,
    pageCount,
  };
}
