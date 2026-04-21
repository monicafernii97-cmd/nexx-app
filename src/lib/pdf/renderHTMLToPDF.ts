/**
 * PDF Renderer Re-Export
 *
 * Thin path-alignment wrapper. The canonical implementation
 * lives at src/lib/legal/pdfRenderer.ts — do NOT duplicate
 * Puppeteer logic here.
 *
 * This file exists solely so imports from the `pdf/` namespace
 * align with the pipeline spec:
 *
 *   import { renderHTMLToPDF } from '@/lib/pdf/renderHTMLToPDF'
 */

export { renderHTMLToPDF, renderHTMLToPDFBase64 } from '@/lib/legal/pdfRenderer';
