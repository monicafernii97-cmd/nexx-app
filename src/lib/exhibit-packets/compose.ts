import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFArray,
  rgb,
  degrees,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { rasterizeSource, RASTER_VERSION } from "./raster";
import {
  parseEvidenceMessages,
  selectEvidenceMessages,
  MESSAGE_PARSER_VERSION,
} from "../../../shared/exhibitMessages";
import { createHash } from "node:crypto";
import { EXHIBIT_FONT_BASE64 } from "../../../convex/lib/exhibitFont";
import {
  assignLabels,
  canonicalJSON,
  EXHIBIT_LIMITS,
  parseItems,
  parseSettings,
  sourceSelections,
  normalizeSha256,
  classificationNames,
  type ExhibitItem,
  type PacketSettings,
} from "../../../shared/exhibits";

export type PacketSource = {
  id: string;
  title: string;
  kind: "file" | "timeline" | "note";
  mimeType: string;
  bytes?: Uint8Array;
  snapshot?: string;
  sha256?: string;
};
export type PageEntry = {
  page: number;
  role: "title" | "letter" | "index" | "divider" | "cover" | "evidence";
  exhibitId?: string;
  label?: string;
  sourceId?: string;
  sourcePage?: number;
  messageIds?: string[];
  bates?: string;
};
export type PacketReport = {
  pageCount: number;
  exhibitCount: number;
  evidencePageCount: number;
  pages: PageEntry[];
  exhibits: {
    id: string;
    label: string;
    start: number;
    end: number;
    title: string;
    evidenceStart?: number;
    evidencePageCount?: number;
    batesStart?: string;
    batesEnd?: string;
  }[];
  sources: { id: string; sha256: string }[];
  warnings: string[];
};
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const INK = rgb(0.12, 0.16, 0.23),
  MUTED = rgb(0.35, 0.39, 0.45),
  BLUE = rgb(0.12, 0.25, 0.4);
const supportedCharacters = new WeakMap<PDFFont, Set<number>>();

async function newDoc() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(Buffer.from(EXHIBIT_FONT_BASE64, "base64"), {
    subset: true,
  });
  return { doc, font };
}
function lines(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const proposal = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(proposal, size) <= width) {
        current = proposal;
        continue;
      }
      if (current) result.push(current);
      current = "";
      for (const character of word) {
        if (font.widthOfTextAtSize(current + character, size) > width) {
          result.push(current);
          current = "";
        }
        current += character;
      }
    }
    result.push(current);
  }
  return result;
}
function draw(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 11,
  color = INK,
) {
  // Refuse unsupported glyphs instead of silently replacing source/metadata text.
  let supported = supportedCharacters.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    supportedCharacters.set(font, supported);
  }
  if ([...text].some((c) => !supported.has(c.codePointAt(0)!)))
    throw new Error(
      "UNSUPPORTED_TEXT_GLYPH: A generated title or note contains a character this template cannot display. Use an original PDF/image for that source.",
    );
  page.drawText(text, { x, y, size, font, color });
}
function textPages(
  doc: PDFDocument,
  font: PDFFont,
  title: string,
  body: string,
): PDFPage[] {
  const result: PDFPage[] = [];
  let page: PDFPage;
  let y = 0;
  const add = () => {
    page = doc.addPage([612, 792]);
    result.push(page);
    y = 730;
  };
  add();
  for (const line of lines(title, font, 18, 504)) {
    if (y < 72) add();
    draw(page!, font, line, 54, y, 18, BLUE);
    y -= 25;
  }
  y -= 20;
  for (const line of lines(body, font, 11, 504)) {
    if (y < 72) add();
    draw(page!, font, line, 54, y);
    y -= 17;
  }
  return result;
}
function sourceText(source: PacketSource): string {
  if (source.kind === "note")
    return `User-authored note. This is not an original external document.\n\n${source.snapshot ?? ""}`;
  const events = JSON.parse(source.snapshot ?? "[]") as {
    date: string;
    title: string;
    description: string;
    status: string;
    sourceMessageId?: string;
    sourceConversationId?: string;
  }[];
  return (
    "Recorded timeline snapshot. Entries reflect recorded accounts; confirmation status does not independently verify the event.\n\n" +
    events
      .map(
        (e) =>
          `${e.date} | ${e.title}\n${e.description}\nRecorded status: ${e.status}${e.sourceMessageId ? `\nSource message reference: ${e.sourceMessageId}` : ""}${e.sourceConversationId ? `\nSource conversation reference: ${e.sourceConversationId}` : ""}`,
      )
      .join("\n\n")
  );
}
export async function composePacket(input: {
  title: string;
  items: ExhibitItem[];
  settings: PacketSettings;
  sources: PacketSource[];
  checkpoint?: (stage: string) => Promise<void>;
  context?: { caseId: string; collectionId: string; revision: number };
}): Promise<{
  bytes: Uint8Array;
  sha256: string;
  manifestHash: string;
  manifestJson: string;
  indexBytes: Uint8Array;
  indexSha256: string;
  report: PacketReport;
}> {
  const items = parseItems(input.items),
    settings = parseSettings(input.settings),
    labels = assignLabels(items, settings);
  if (!items.length) throw new Error("Select at least one exhibit.");
  const sources = new Map(input.sources.map((s) => [s.id, s]));
  const sourceHashes: { id: string; sha256: string }[] = [];
  let totalBytes = 0;
  for (const id of new Set(sourceSelections(items).map((i) => i.sourceId))) {
    const source = sources.get(id);
    if (!source) throw new Error("SOURCE_UNAVAILABLE");
    const bytes = source.bytes ?? Buffer.from(source.snapshot ?? "");
    totalBytes += bytes.length;
    if (
      bytes.length > EXHIBIT_LIMITS.sourceBytes ||
      totalBytes > EXHIBIT_LIMITS.totalBytes
    )
      throw new Error(
        "PROCESSING_LIMIT_EXCEEDED: Source bytes exceed this release’s tested limits.",
      );
    const actual = hash(bytes);
    if (source.sha256 && normalizeSha256(source.sha256) !== actual)
      throw new Error(
        "SOURCE_VERSION_CHANGED: Original file checksum does not match.",
      );
    sourceHashes.push({ id, sha256: actual });
  }
  const { doc: body, font } = await newDoc();
  const pdfCache = new Map<string, PDFDocument>();
  const sourcePdf = async (source: PacketSource) => {
    let pdf = pdfCache.get(source.id);
    if (!pdf) {
      pdf = await PDFDocument.load(source.bytes!);
      pdfCache.set(source.id, pdf);
    }
    return pdf;
  };
  let preparedBytes = 0;
  const accountImage = (bytes: Uint8Array) => {
    preparedBytes += bytes.length;
    if (preparedBytes > 50 * 1024 * 1024)
      throw new Error(
        "PROCESSING_LIMIT_EXCEEDED: Prepared images exceed 50 MB. Split this packet into smaller collections.",
      );
  };
  const entries: PageEntry[] = [];
  const exhibits: PacketReport["exhibits"] = [];
  const warnings = new Set<string>();
  const recordPages = (count: number, entry: Omit<PageEntry, "page">) => {
    for (let i = 0; i < count; i++)
      entries.push({ page: entries.length + 1, ...entry });
  };
  let lastGroup = "";
  const expanded = items.flatMap((item, index) =>
    [
      item,
      ...(item.parts ?? []).map((part) => ({
        ...item,
        sourceId: part.sourceId,
        pages: part.pages,
        crop: part.crop,
        redactions: part.redactions,
        messageIds: part.messageIds,
        parts: undefined,
      })),
    ].map((part, partIndex) => ({
      item: part,
      label: labels[index],
      first: partIndex === 0,
    })),
  );
  for (let index = 0; index < expanded.length; index++) {
    await input.checkpoint?.(
      `Assembling selection ${index + 1} of ${expanded.length}`,
    );
    const { item, label, first } = expanded[index],
      source = sources.get(item.sourceId)!;
    const group = classificationNames(item).join("; ");
    if (settings.dividers && group !== lastGroup) {
      recordPages(textPages(body, font, group, "Exhibit collection").length, {
        role: "divider",
      });
      lastGroup = group;
    }
    const start = body.getPageCount() + 1;
    if (settings.covers && first) {
      const details = [
        item.title,
        item.date ? `Date: ${item.date}` : "Date: not specified",
        item.participants ? `Participants: ${item.participants}` : "",
        item.conversation ? `Conversation: ${item.conversation}` : "",
        `Classifications (user-assigned): ${classificationNames(item).join("; ")}`,
        `Source: ${[item, ...(item.parts ?? [])].map((part) => sources.get(part.sourceId)!.title).join("; ")}`,
        item.originLabel
          ? `Master reference: ${item.originPacket ?? "Source packet"}, ${item.originLabel}`
          : "",
        sourceSelections([item]).some((s) => s.redactions?.length)
          ? "Includes redacted derivatives. Compare against originals and review all descriptions for confidential information."
          : item.crop
            ? "Selected source region; this is an excerpt, not a redacted copy."
            : "",
        settings.summaries ? (item.summary ?? "") : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      recordPages(textPages(body, font, `EXHIBIT ${label}`, details).length, {
        role: "cover",
        exhibitId: item.id,
        label,
      });
    }
    if (
      (source.mimeType === "text/plain" && source.kind === "file") ||
      source.mimeType === "application/json"
    ) {
      if (item.pages || item.crop || item.redactions?.length)
        throw new Error("Use message selection for a structured transcript.");
      const all = parseEvidenceMessages(
          new TextDecoder("utf-8", { fatal: true }).decode(source.bytes!),
          source.mimeType,
        ),
        selected = selectEvidenceMessages(all, item.messageIds);
      let page: PDFPage,
        y = 0,
        entry: PageEntry;
      const nextPage = () => {
        page = body.addPage([612, 792]);
        y = 704;
        draw(
          page,
          font,
          `EXHIBIT ${label} · MESSAGE EXCERPTS`,
          54,
          738,
          14,
          BLUE,
        );
        entry = {
          page: entries.length + 1,
          role: "evidence",
          exhibitId: item.id,
          label,
          sourceId: source.id,
          messageIds: [],
        };
        entries.push(entry);
      };
      nextPage();
      const write = (text: string, messageId?: string) => {
        for (const paragraph of text.split("\n")) {
          let line = "";
          const wrapped: string[] = [];
          for (const character of paragraph) {
            if (font.widthOfTextAtSize(line + character, 11) > 504) {
              wrapped.push(line);
              line = "";
            }
            line += character;
          }
          wrapped.push(line);
          for (const line of wrapped) {
            if (y < 72) nextPage();
            draw(page!, font, line, 54, y, 11);
            y -= 17;
            if (messageId && !entry!.messageIds!.includes(messageId))
              entry!.messageIds!.push(messageId);
          }
        }
      };
      write(
        "Rendered from the original message export. Timestamps are reproduced as recorded; time zone and date convention are not inferred.",
      );
      y -= 12;
      let previous = -1;
      for (const message of selected) {
        if (message.ordinal > previous + 1)
          write("[Unselected messages omitted]");
        if (y < 145) nextPage();
        write(`${message.timestamp} | ${message.sender}`, message.id);
        write(
          `Conversation: ${message.conversationId}${message.lineStart ? ` | Source lines ${message.lineStart}-${message.lineEnd}` : ` | Source message ${message.ordinal + 1}`}`,
          message.id,
        );
        write(message.text, message.id);
        y -= 17;
        previous = message.ordinal;
      }
      if (previous < all.length - 1) write("[Unselected messages omitted]");
    } else if (source.kind !== "file") {
      if (item.pages || item.crop || item.redactions?.length || item.messageIds)
        throw new Error(
          "Use whole timeline/note snapshots; page selections apply to original PDF files.",
        );
      recordPages(
        textPages(body, font, item.title, sourceText(source)).length,
        { role: "evidence", exhibitId: item.id, label, sourceId: source.id },
      );
    } else if (item.crop || item.redactions?.length) {
      const count =
        source.mimeType === "application/pdf"
          ? (await sourcePdf(source)).getPageCount()
          : 1;
      const selected =
        item.pages ?? Array.from({ length: count }, (_, i) => i + 1);
      if (item.redactions?.some((r) => !selected.includes(r.page)))
        throw new Error("Redaction page is outside the selected evidence.");
      for (const pageNumber of selected) {
        await input.checkpoint?.(
          `Preparing derivative ${index + 1}, source page ${pageNumber}`,
        );
        const raster = await rasterizeSource({
          bytes: source.bytes!,
          mimeType: source.mimeType,
          page: pageNumber,
          crop: item.crop,
          redactions: item.redactions
            ?.filter((r) => r.page === pageNumber)
            .map((r) => r.region),
        });
        const img = await body.embedPng(raster.bytes);
        accountImage(raster.bytes);
        const w = img.width / 2,
          h = img.height / 2,
          rotation = ((raster.rotation % 360) + 360) % 360;
        const sw = rotation === 90 || rotation === 270 ? h : w,
          sh = rotation === 90 || rotation === 270 ? w : h;
        const target = body.addPage([
          Math.max(360, sw + 48),
          Math.max(144, sh + 64),
        ]);
        const positions: Record<number, { x: number; y: number }> = {
          0: { x: 24, y: 40 },
          90: { x: 24, y: 40 + w },
          180: { x: 24 + w, y: 40 + h },
          270: { x: 24 + h, y: 40 },
        };
        target.drawImage(img, {
          ...positions[rotation],
          width: w,
          height: h,
          rotate: degrees(-rotation),
        });
        recordPages(1, {
          role: "evidence",
          exhibitId: item.id,
          label,
          sourceId: source.id,
          sourcePage: pageNumber,
        });
      }
      warnings.add(
        `${item.title}: review the rendered ${item.redactions?.length ? "redacted" : "cropped"} derivative against the original. Derivative pages are images, without a searchable original text layer.`,
      );
    } else if (source.mimeType === "application/pdf") {
      if (item.messageIds)
        throw new Error(
          "Message IDs apply to structured transcripts, not PDF files.",
        );
      const original = await sourcePdf(source);
      const selected =
        item.pages ?? original.getPageIndices().map((i) => i + 1);
      for (const pageNumber of selected) {
        if (pageNumber > original.getPageCount())
          throw new Error(
            `SELECTION_OUT_OF_RANGE: ${item.title}, page ${pageNumber}.`,
          );
        const p = original.getPage(pageNumber - 1);
        // Annotations may contain evidence not present in the page content stream.
        if (p.node.Annots()?.size())
          throw new Error(
            `SOURCE_ANNOTATIONS: ${source.title} contains annotations/forms. Supply a visually verified flattened copy to preserve their appearance.`,
          );
        const rotation = ((p.getRotation().angle % 360) + 360) % 360;
        const box = p.getCropBox();
        const bounds = {
          left: box.x,
          right: box.x + box.width,
          bottom: box.y,
          top: box.y + box.height,
        };
        const embedded = await body.embedPage(p, bounds);
        const w = embedded.width,
          h = embedded.height,
          sw = rotation === 90 || rotation === 270 ? h : w,
          sh = rotation === 90 || rotation === 270 ? w : h;
        if (sw > 14400 || sh > 14400 || sw < 10 || sh < 10)
          throw new Error("Source page dimensions are unsupported.");
        const target = body.addPage([
          Math.max(360, sw + 48),
          Math.max(144, sh + 64),
        ]);
        const positions: Record<number, { x: number; y: number }> = {
          0: { x: 24, y: 40 },
          90: { x: 24, y: 40 + w },
          180: { x: 24 + w, y: 40 + h },
          270: { x: 24 + h, y: 40 },
        };
        if (!positions[rotation])
          throw new Error("Unsupported source rotation.");
        target.drawPage(embedded, {
          ...positions[rotation],
          rotate: degrees(-rotation),
        });
        recordPages(1, {
          role: "evidence",
          exhibitId: item.id,
          label,
          sourceId: source.id,
          sourcePage: pageNumber,
        });
      }
    } else {
      if (item.messageIds)
        throw new Error(
          "Message IDs apply to structured transcripts, not images.",
        );
      if (item.pages) throw new Error("Page ranges apply to PDF sources.");
      if (item.crop)
        throw new Error(
          "Image crops require a prepared derivative. Include the full image in this release.",
        );
      if (!["image/png", "image/jpeg"].includes(source.mimeType))
        throw new Error("Unsupported source type.");
      const normalized = await rasterizeSource({
        bytes: source.bytes!,
        mimeType: source.mimeType,
        page: 1,
      });
      accountImage(normalized.bytes);
      const embedded = await body.embedPng(normalized.bytes);
      const landscape = embedded.width > embedded.height;
      const page = body.addPage(landscape ? [792, 612] : [612, 792]);
      const scale = Math.min(
        (page.getWidth() - 72) / embedded.width,
        (page.getHeight() - 100) / embedded.height,
      );
      const width = embedded.width * scale,
        height = embedded.height * scale;
      page.drawImage(embedded, {
        x: (page.getWidth() - width) / 2,
        y: 50 + (page.getHeight() - 100 - height) / 2,
        width,
        height,
      });
      if (embedded.width < 600)
        warnings.add(`Review image legibility: ${source.title}`);
      recordPages(1, {
        role: "evidence",
        exhibitId: item.id,
        label,
        sourceId: source.id,
        sourcePage: 1,
      });
    }
    if (body.getPageCount() > EXHIBIT_LIMITS.pages)
      throw new Error(
        "PROCESSING_LIMIT_EXCEEDED: Split this packet into fewer than 500 pages.",
      );
    if (first)
      exhibits.push({
        id: item.id,
        label,
        start,
        end: body.getPageCount(),
        title: item.title,
      });
    else exhibits[exhibits.length - 1].end = body.getPageCount();
  }
  const { doc: output, font: outFont } = await newDoc();
  const front: PageEntry[] = [];
  const frontRecord = (count: number, role: PageEntry["role"]) => {
    for (let i = 0; i < count; i++)
      front.push({ page: front.length + 1, role });
  };
  if (settings.titleSheet)
    frontRecord(
      textPages(
        output,
        outFont,
        input.title,
        `${items.length} exhibits\n\nPrepared with Nexproof\n\nEvidence selections and descriptions are provided by the preparer.`,
      ).length,
      "title",
    );
  if (settings.coverLetter)
    frontRecord(
      textPages(output, outFont, "Cover letter", settings.coverLetter).length,
      "letter",
    );
  const indexRows: { page: PDFPage; y: number; exhibitIndex: number }[] = [];
  if (settings.index) {
    let indexPage: PDFPage;
    let y = 0;
    const add = () => {
      indexPage = output.addPage([612, 792]);
      frontRecord(1, "index");
      draw(indexPage, outFont, "EXHIBIT INDEX", 54, 738, 18, BLUE);
      draw(
        indexPage,
        outFont,
        "Exhibit / description / date",
        54,
        708,
        10,
        MUTED,
      );
      draw(indexPage, outFont, "Pages", 508, 708, 10, MUTED);
      y = 680;
    };
    add();
    exhibits.forEach((ex, i) => {
      const rowLines = lines(
        `${ex.label}  ${ex.title}${items[i].date ? ` | ${items[i].date}` : ""}${classificationNames(items[i])[0] !== "Unclassified" ? `\n${classificationNames(items[i]).join("; ")}` : ""}`,
        outFont,
        10,
        420,
      );
      const height = rowLines.length * 15 + 14;
      if (y - height < 65) add();
      indexRows.push({ page: indexPage!, y, exhibitIndex: i });
      for (const line of rowLines) {
        draw(indexPage!, outFont, line, 54, y, 10);
        y -= 15;
      }
      y -= 14;
    });
  }
  const offset = output.getPageCount();
  for (const page of await output.copyPages(body, body.getPageIndices()))
    output.addPage(page);
  const pages = [
    ...front,
    ...entries.map((e) => ({ ...e, page: e.page + offset })),
  ];
  for (const ex of exhibits) {
    ex.start += offset;
    ex.end += offset;
  }
  for (const row of indexRows) {
    const ex = exhibits[row.exhibitIndex];
    draw(row.page, outFont, `${ex.start}-${ex.end}`, 508, row.y, 10);
    const annotation = output.context.register(
      output.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [50, row.y - 4, 560, row.y + 13],
        Border: [0, 0, 0],
        Dest: [output.getPage(ex.start - 1).ref, "Fit"],
      }),
    );
    const annots =
      row.page.node.lookupMaybe(PDFName.of("Annots"), PDFArray) ??
      output.context.obj([]);
    annots.push(annotation);
    row.page.node.set(PDFName.of("Annots"), annots);
  }
  const root = output.context.register(
    output.context.obj({ Type: "Outlines" }),
  );
  const outlineRefs = exhibits.map(() => output.context.nextRef());
  exhibits.forEach((ex, i) =>
    output.context.assign(
      outlineRefs[i],
      output.context.obj({
        Title: PDFString.of(`Exhibit ${ex.label}`),
        Parent: root,
        Dest: [output.getPage(ex.start - 1).ref, "Fit"],
        ...(i ? { Prev: outlineRefs[i - 1] } : {}),
        ...(i < exhibits.length - 1 ? { Next: outlineRefs[i + 1] } : {}),
      }),
    ),
  );
  output.context.assign(
    root,
    output.context.obj({
      Type: "Outlines",
      First: outlineRefs[0],
      Last: outlineRefs[outlineRefs.length - 1],
      Count: outlineRefs.length,
    }),
  );
  output.catalog.set(PDFName.of("Outlines"), root);
  let bates = settings.batesStart;
  for (const entry of pages) {
    const page = output.getPage(entry.page - 1),
      width = page.getWidth();
    draw(
      page,
      outFont,
      `Page ${entry.page} of ${pages.length}`,
      settings.bates && settings.batesPlacement === "left"
        ? width -
            24 -
            outFont.widthOfTextAtSize(
              `Page ${entry.page} of ${pages.length}`,
              9,
            )
        : 24,
      20,
      9,
      MUTED,
    );
    if (entry.role === "evidence") {
      const stamp = `Exhibit ${entry.label}${entry.sourcePage ? ` | Source page ${entry.sourcePage}` : ""}`;
      draw(page, outFont, stamp, 24, page.getHeight() - 16, 8, MUTED);
    }
    if (settings.bates && settings.batesRoles.includes(entry.role)) {
      entry.bates = `${settings.batesPrefix}${String(bates++).padStart(settings.batesPadding, "0")}`;
      const size = settings.batesFontSize;
      const stampWidth = outFont.widthOfTextAtSize(entry.bates, size);
      if (stampWidth > width - 180)
        throw new Error("Bates label does not fit this page.");
      draw(
        page,
        outFont,
        entry.bates,
        settings.batesPlacement === "left" ? 24 : width - 24 - stampWidth,
        20,
        size,
      );
    }
  }
  if (output.getPageCount() > EXHIBIT_LIMITS.pages)
    throw new Error(
      "PROCESSING_LIMIT_EXCEEDED: Packet including front matter exceeds 500 pages.",
    );
  output.setTitle(input.title);
  output.setCreator("Nexproof Exhibit Studio");
  await input.checkpoint?.("Validating PDF and page map");
  const bytes = await output.save();
  const parsed = await PDFDocument.load(bytes);
  if (parsed.getPageCount() !== pages.length)
    throw new Error("PACKET_INVENTORY_MISMATCH");
  const report: PacketReport = {
    pageCount: pages.length,
    exhibitCount: items.length,
    evidencePageCount: pages.filter((p) => p.role === "evidence").length,
    pages,
    exhibits,
    sources: sourceHashes,
    warnings: [...warnings],
  };
  for (const exhibit of exhibits) {
    const evidence = pages.filter(
      (p) => p.exhibitId === exhibit.id && p.role === "evidence",
    );
    exhibit.evidenceStart = evidence[0]?.page;
    exhibit.evidencePageCount = evidence.length;
    exhibit.batesStart = evidence.find((p) => p.bates)?.bates;
    exhibit.batesEnd = [...evidence].reverse().find((p) => p.bates)?.bates;
  }
  const manifestJson = canonicalJSON({
    schemaVersion: 1,
    rendererVersion: 2,
    derivativeVersion: RASTER_VERSION,
    messageParserVersion: MESSAGE_PARSER_VERSION,
    title: input.title,
    items,
    settings,
    sources: sourceHashes,
    context: input.context,
  });
  const manifestHash = hash(manifestJson),
    sha256 = hash(bytes);
  const { doc: indexDoc, font: indexFont } = await newDoc();
  textPages(
    indexDoc,
    indexFont,
    `${input.title} — Exhibit index`,
    [
      `Standalone index. Page ranges below refer to the complete ${pages.length}-page packet, not this index document.`,
      `Referenced packet SHA-256: ${sha256}`,
      ...exhibits.map(
        (ex, i) =>
          `${ex.label} | ${ex.title}\n${items[i].date ?? "Date not specified"}${classificationNames(items[i])[0] !== "Unclassified" ? ` | ${classificationNames(items[i]).join("; ")}` : ""}\nPacket pages ${ex.start}–${ex.end}; evidence starts on page ${ex.evidenceStart}.${ex.batesStart ? ` Bates: ${ex.batesStart}–${ex.batesEnd}.` : ""}${items[i].originLabel ? ` Master reference: ${items[i].originPacket ?? "Source packet"}, ${items[i].originLabel}.` : ""}`,
      ),
    ].join("\n\n"),
  );
  indexDoc
    .getPages()
    .forEach((p, i) =>
      draw(
        p,
        indexFont,
        `Index page ${i + 1} of ${indexDoc.getPageCount()}`,
        54,
        24,
        9,
        MUTED,
      ),
    );
  const indexBytes = await indexDoc.save();
  return {
    bytes,
    sha256,
    manifestHash,
    manifestJson,
    indexBytes,
    indexSha256: hash(indexBytes),
    report,
  };
}
