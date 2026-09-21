import { describe, it, expect } from "vitest";
import {
  PDFDocument,
  PDFName,
  PDFArray,
  StandardFonts,
  degrees,
} from "pdf-lib";
import { composePacket } from "../compose";
import { rasterizeSource } from "../raster";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  DEFAULT_PACKET_SETTINGS,
  parsePageRanges,
  assignLabels,
  parseItems,
  parseSettings,
} from "../../../../shared/exhibits";

async function fixture(count = 3) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`ORIGINAL PAGE ${i}`, { x: 20, y: 200, font });
  }
  return doc.save();
}
const item = { id: "ex-1", sourceId: "src-1", title: "Original messages" };
describe("original-evidence packet assembly", () => {
  it("verifies Convex base64 storage checksums without weakening byte-integrity checks", async () => {
    const bytes = await fixture(1);
    const source = {
      id: "src-1",
      kind: "file" as const,
      title: "upload.pdf",
      mimeType: "application/pdf",
      bytes,
      sha256: createHash("sha256").update(bytes).digest("base64"),
    };
    const input = {
      title: "Original upload",
      items: [item],
      settings: DEFAULT_PACKET_SETTINGS,
      sources: [source],
    };
    expect((await composePacket(input)).report.sources[0].sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    await expect(
      composePacket({
        ...input,
        sources: [
          {
            ...source,
            sha256: createHash("sha256").update("changed").digest("base64"),
          },
        ],
      }),
    ).rejects.toThrow("SOURCE_VERSION_CHANGED");
  });
  it("honors camera EXIF orientation and all-page Bates placement", async () => {
    const bytes = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "red" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await composePacket({
      title: "Oriented image",
      items: [item],
      settings: {
        ...DEFAULT_PACKET_SETTINGS,
        bates: true,
        batesPlacement: "left",
        batesFontSize: 10,
        batesRoles: ["title", "index", "cover", "evidence"],
      },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "camera.jpg",
          mimeType: "image/jpeg",
          bytes,
        },
      ],
    });
    expect(result.report.pages.map((p) => p.bates)).toEqual([
      "NEX-00001",
      "NEX-00002",
      "NEX-00003",
      "NEX-00004",
    ]);
    expect(
      (await PDFDocument.load(result.bytes)).getPages().at(-1)?.getSize(),
    ).toEqual({ width: 612, height: 792 });
    expect(result.report.exhibits[0].batesStart).toBe("NEX-00004");
    expect(JSON.parse(result.manifestJson).settings.batesPlacement).toBe(
      "left",
    );
    expect(
      (await PDFDocument.load(result.indexBytes)).getPageCount(),
    ).toBeGreaterThan(0);
  });
  it("burns redactions into fresh pixels and excludes original text objects", async () => {
    const bytes = await fixture(1);
    const raster = await rasterizeSource({
      bytes,
      mimeType: "application/pdf",
      page: 1,
      redactions: [{ x: 0, y: 0, width: 1, height: 1 }],
    });
    const img = await loadImage(Buffer.from(raster.bytes)),
      canvas = createCanvas(img.width, img.height),
      ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3] !== 255)
        throw new Error("Redacted pixel leaked");
    }
    const result = await composePacket({
      title: "Redaction fixture",
      items: [
        {
          ...item,
          redactions: [
            { page: 1, region: { x: 0, y: 0, width: 1, height: 1 } },
          ],
        },
      ],
      settings: {
        ...DEFAULT_PACKET_SETTINGS,
        titleSheet: false,
        index: false,
        covers: false,
      },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "source.pdf",
          mimeType: "application/pdf",
          bytes,
        },
      ],
    });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: result.bytes.slice() });
    try {
      const pdf = await task.promise;
      const text = await (await pdf.getPage(1)).getTextContent();
      expect(
        text.items.map((i) => ("str" in i ? i.str : "")).join(" "),
      ).not.toContain("ORIGINAL PAGE");
    } finally {
      await task.destroy();
    }
    expect(result.report.warnings.some((w) => w.includes("redacted"))).toBe(
      true,
    );
  }, 30000);
  it("crops rotated PDFs using unrotated source coordinates", async () => {
    const source = await PDFDocument.load(await fixture(1));
    source.getPage(0).setRotation(degrees(90));
    const result = await composePacket({
      title: "Crop fixture",
      items: [
        { ...item, pages: [1], crop: { x: 0, y: 0, width: 0.5, height: 1 } },
      ],
      settings: {
        ...DEFAULT_PACKET_SETTINGS,
        titleSheet: false,
        index: false,
        covers: false,
      },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "rotated.pdf",
          mimeType: "application/pdf",
          bytes: await source.save(),
        },
      ],
    });
    expect((await PDFDocument.load(result.bytes)).getPage(0).getSize()).toEqual(
      { width: 448, height: 214 },
    );
  }, 30000);
  it("builds the 100-exhibit, 500-page evidence benchmark without truncation", async () => {
    const started = performance.now();
    const result = await composePacket({
      title: "Scale fixture",
      items: Array.from({ length: 100 }, (_, i) => ({
        ...item,
        id: `scale-${i}`,
      })),
      settings: {
        ...DEFAULT_PACKET_SETTINGS,
        titleSheet: false,
        index: false,
        covers: false,
        bates: true,
      },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "source.pdf",
          mimeType: "application/pdf",
          bytes: await fixture(5),
        },
      ],
    });
    expect(result.report.pageCount).toBe(500);
    expect(result.report.exhibitCount).toBe(100);
    expect(result.report.pages.at(-1)?.bates).toBe("NEX-00500");
    expect(performance.now() - started).toBeLessThan(300000);
  }, 300000);
  it("includes only selected physical pages and interleaves covers, with real Bates and destinations", async () => {
    const result = await composePacket({
      title: "Test packet",
      items: [
        { ...item, pages: [2, 3] },
        { id: "ex-2", sourceId: "src-1", title: "First page", pages: [1] },
      ],
      settings: { ...DEFAULT_PACKET_SETTINGS, bates: true },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "messages.pdf",
          mimeType: "application/pdf",
          bytes: await fixture(),
        },
      ],
    });
    expect(result.report.pages.map((p) => p.role)).toEqual([
      "title",
      "index",
      "cover",
      "evidence",
      "evidence",
      "cover",
      "evidence",
    ]);
    expect(
      result.report.pages
        .filter((p) => p.role === "evidence")
        .map((p) => [p.sourcePage, p.bates]),
    ).toEqual([
      [2, "NEX-00001"],
      [3, "NEX-00002"],
      [1, "NEX-00003"],
    ]);
    expect(
      result.report.exhibits.map((e) => [e.label, e.start, e.end]),
    ).toEqual([
      ["A", 3, 5],
      ["B", 6, 7],
    ]);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(7);
    expect(pdf.catalog.has(PDFName.of("Outlines"))).toBe(true);
    expect(
      pdf.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray).size(),
    ).toBe(2);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects missing sources, out-of-range pages and changed source hashes", async () => {
    const source = {
      id: "src-1",
      kind: "file" as const,
      title: "original.pdf",
      mimeType: "application/pdf",
      bytes: await fixture(),
    };
    await expect(
      composePacket({
        title: "Test",
        items: [item],
        settings: DEFAULT_PACKET_SETTINGS,
        sources: [],
      }),
    ).rejects.toThrow("SOURCE_UNAVAILABLE");
    await expect(
      composePacket({
        title: "Test",
        items: [{ ...item, pages: [4] }],
        settings: DEFAULT_PACKET_SETTINGS,
        sources: [source],
      }),
    ).rejects.toThrow("SELECTION_OUT_OF_RANGE");
    await expect(
      composePacket({
        title: "Test",
        items: [item],
        settings: DEFAULT_PACKET_SETTINGS,
        sources: [{ ...source, sha256: "0".repeat(64) }],
      }),
    ).rejects.toThrow("SOURCE_VERSION_CHANGED");
  });
  it("retains every requested cover beyond the old 20-cover cap, even without summaries", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      ...item,
      id: `e-${i}`,
      title: `Document ${i + 1}`,
    }));
    const result = await composePacket({
      title: "Thirty exhibits",
      items,
      settings: { ...DEFAULT_PACKET_SETTINGS, summaries: false },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "source.pdf",
          mimeType: "application/pdf",
          bytes: await fixture(1),
        },
      ],
    });
    expect(result.report.pages.filter((p) => p.role === "cover")).toHaveLength(
      30,
    );
    expect(result.report.exhibits[26].label).toBe("AA");
    expect(
      result.report.pages.filter((p) => p.role === "index").length,
    ).toBeGreaterThan(1);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(result.report.pages.length);
  }, 30000);
  it("uses actual overflow pages for authored documents and honors front matter toggles", async () => {
    const result = await composePacket({
      title: "Notes",
      items: [item],
      settings: {
        ...DEFAULT_PACKET_SETTINGS,
        titleSheet: false,
        index: false,
        covers: false,
        bates: true,
      },
      sources: [
        {
          id: "src-1",
          kind: "note",
          title: "Recorded note",
          mimeType: "text/plain",
          snapshot: "Complete user-authored line.\n".repeat(120),
        },
      ],
    });
    expect(result.report.pageCount).toBeGreaterThan(2);
    expect(
      result.report.pages.every((p) => p.role === "evidence" && p.bates),
    ).toBe(true);
    expect(new Set(result.report.pages.map((p) => p.bates)).size).toBe(
      result.report.pageCount,
    );
  });
  it("preserves landscape display dimensions for a rotated source", async () => {
    const pdf = await PDFDocument.load(await fixture(1));
    pdf.getPage(0).setRotation(degrees(90));
    const result = await composePacket({
      title: "Rotated",
      items: [item],
      settings: {
        ...DEFAULT_PACKET_SETTINGS,
        titleSheet: false,
        index: false,
        covers: false,
      },
      sources: [
        {
          id: "src-1",
          kind: "file",
          title: "rotated.pdf",
          mimeType: "application/pdf",
          bytes: await pdf.save(),
        },
      ],
    });
    const output = await PDFDocument.load(result.bytes);
    expect(output.getPage(0).getSize()).toEqual({ width: 448, height: 364 });
  });
});
describe("selection and label contracts", () => {
  it("validates ranges and rejects accidental duplicates", () => {
    expect(parsePageRanges("2-4, 8")).toEqual([2, 3, 4, 8]);
    expect(() => parsePageRanges("1-3, 2")).toThrow();
    expect(() => parsePageRanges("0")).toThrow();
  });
  it("supports custom prefixes and collision-safe master labels", () => {
    expect(
      assignLabels([item], {
        ...DEFAULT_PACKET_SETTINGS,
        labelStyle: "custom",
        prefix: "R2-R-MED",
      }),
    ).toEqual(["R2-R-MED-1"]);
    expect(() =>
      assignLabels(
        [
          { ...item, label: "A" },
          { ...item, id: "other", label: "a" },
        ],
        DEFAULT_PACKET_SETTINGS,
      ),
    ).toThrow("LABEL_COLLISION");
  });
  it("rejects invalid crops, settings, and duplicate identities", () => {
    expect(() =>
      parseItems([{ ...item, crop: { x: 0.9, y: 0, width: 0.2, height: 1 } }]),
    ).toThrow();
    expect(() => parseItems([item, item])).toThrow();
    expect(() =>
      parseSettings({ ...DEFAULT_PACKET_SETTINGS, batesStart: -1 }),
    ).toThrow();
  });
});
