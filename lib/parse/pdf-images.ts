import fs from "fs";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";

export interface BBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface RenderedPage {
  image: Image;
  widthPx: number;
  heightPx: number;
  heightPt: number;
}

/**
 * Renders one PDF page to a raster image at the given scale (PDF points *
 * scale = pixels), decoded and ready for repeated drawImage() crops.
 *
 * NOTE: `new Image(); img.src = buffer` in @napi-rs/canvas does NOT actually
 * decode pixel data synchronously (width/height report correctly but
 * drawImage silently paints nothing) — loadImage() is the one that works.
 */
export async function renderPageToImage(
  pdfjsDoc: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy,
  pageNumber: number,
  scale: number
): Promise<RenderedPage> {
  const page = await pdfjsDoc.getPage(pageNumber);
  const pt = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const image = await loadImage(canvas.toBuffer("image/png"));
  return { image, widthPx: viewport.width, heightPx: viewport.height, heightPt: pt.height };
}

export async function loadPdf(filePath: string) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  return pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
}

/**
 * Crops a rendered page to a bounding box given in PDF point space (origin
 * bottom-left, y increasing upward — pdfjs's native coordinate system).
 * `scale` and `pageHeightPt` convert it into the top-left-origin pixel space
 * the canvas uses.
 */
export function cropToPng(page: RenderedPage, bbox: BBox, scale: number, padding = 4): Buffer {
  const x0px = Math.max(0, bbox.x0 * scale - padding);
  const x1px = Math.min(page.widthPx, bbox.x1 * scale + padding);
  // Flip y: PDF y1 (top, larger value) -> smaller pixel y.
  const yTopPx = Math.max(0, page.heightPt * scale - bbox.y1 * scale - padding);
  const yBottomPx = Math.min(page.heightPx, page.heightPt * scale - bbox.y0 * scale + padding);

  const cropW = Math.max(1, Math.round(x1px - x0px));
  const cropH = Math.max(1, Math.round(yBottomPx - yTopPx));

  const out = createCanvas(cropW, cropH);
  const ctx = out.getContext("2d");
  ctx.drawImage(page.image, x0px, yTopPx, cropW, cropH, 0, 0, cropW, cropH);
  return out.toBuffer("image/png");
}
