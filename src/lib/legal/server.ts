/**
 * Legal Document Generation System — Server-only exports
 *
 * Use this entry point for imports that depend on Node.js builtins
 * (fs, path) — e.g. the HTML template renderer and PDF engine.
 *
 * For types, court rules, and pure helpers, import from './index' instead.
 */

// ── HTML Template Renderer (requires Node.js fs/path) ──
export {
  renderDocumentHTML,
  renderExhibitCover,
  renderExhibitIndex,
  renderTextExcerptExhibit,
} from './templateRenderer';
export type { RenderDocumentOptions } from './templateRenderer';

// ── PDF Renderer (requires puppeteer-core) ──
export {
  renderHTMLToPDF,
  renderHTMLToPDFBase64,
} from './pdfRenderer';

// ── AI Court Rules Lookup (requires tavily + openai) ──
export {
  lookupCourtRules,
  CACHE_TTL_MS,
} from './courtRulesLookup';
export type { CourtRulesLookupResult } from './courtRulesLookup';
