import { it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
import { composePacket } from "../compose";
import { DEFAULT_PACKET_SETTINGS } from "../../../../shared/exhibits";

it("composes 100 indexed exhibits into a reconciled 500-page packet", async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 100; i++) {
    const p = source.addPage([612, 792]);
    p.drawText(`SYNTHETIC ORIGINAL PAGE ${i + 1}`, {
      x: 54,
      y: 700,
      font,
      size: 14,
    });
  }
  const bytes = await source.save();
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: `scale-${i}`,
    sourceId: "scale-source",
    title: `Synthetic exhibit ${i + 1}`,
    date: "2026-03-12",
    pages: [1, 2, 3],
  }));
  const input = {
    title: "Synthetic scale verification",
    items,
    settings: { ...DEFAULT_PACKET_SETTINGS, bates: true },
    sources: [
      {
        id: "scale-source",
        kind: "file" as const,
        title: "synthetic.pdf",
        mimeType: "application/pdf",
        bytes,
      },
    ],
  };
  const baseline = await composePacket(input);
  items[0].pages = Array.from(
    { length: 3 + 500 - baseline.report.pageCount },
    (_, i) => i + 1,
  );
  const started = performance.now();
  const packet = await composePacket(input);
  const durationMs = Math.round(performance.now() - started);
  expect(packet.report.pageCount).toBe(500);
  expect(packet.report.exhibitCount).toBe(100);
  expect(packet.report.pages.filter((p) => p.role === "cover")).toHaveLength(
    100,
  );
  expect(
    packet.report.pages.filter((p) => p.role === "index").length,
  ).toBeGreaterThan(1);
  const evidence = packet.report.pages.filter((p) => p.role === "evidence");
  expect(new Set(evidence.map((p) => p.bates)).size).toBe(evidence.length);
  expect(packet.report.exhibits.at(-1)?.end).toBe(500);
  expect((await PDFDocument.load(packet.bytes)).getPageCount()).toBe(500);
  await mkdir("output/exhibit-qa", { recursive: true });
  await writeFile("output/exhibit-qa/scale-500.pdf", packet.bytes);
  await writeFile(
    "output/exhibit-qa/scale-report.json",
    JSON.stringify(
      {
        durationMs,
        bytes: packet.bytes.length,
        pageCount: 500,
        exhibitCount: 100,
        evidencePages: evidence.length,
        rssBytes: process.memoryUsage().rss,
        environment:
          "Local Node, one worker, repeated prepared PDF source; not a p95 benchmark",
      },
      null,
      2,
    ),
  );
}, 120000);
