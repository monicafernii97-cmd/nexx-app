import { it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import { composePacket, type PacketSource } from "../compose";
import {
  DEFAULT_PACKET_SETTINGS,
  type ExhibitItem,
} from "../../../../shared/exhibits";

it("preserves dense mixed-source inventory, long metadata and readable stamp margins", async () => {
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  for (const dimensions of [
    [612, 792],
    [792, 612],
  ] as [number, number][]) {
    const page = original.addPage(dimensions);
    page.drawText("SYNTHETIC ORIGINAL — existing bottom stamp", {
      font,
      x: 20,
      y: 10,
      size: 12,
    });
    page.drawText("Portrait / landscape source content", {
      font,
      x: 40,
      y: 500,
      size: 16,
    });
  }
  const canvas = createCanvas(600, 900),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 600, 900);
  ctx.font = "16px sans-serif";
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = i % 2 ? "#e5eef8" : "#eeeeee";
    ctx.fillRect(20, 15 + i * 34, 560, 30);
    ctx.fillStyle = "#172238";
    ctx.fillText(
      `2026-09-21 10:${String(i).padStart(2, "0")}  Synthetic conversation ${i}`,
      30,
      36 + i * 34,
    );
  }
  const sources: PacketSource[] = [
    {
      id: "pdf",
      kind: "file",
      title: "Portrait and landscape.pdf",
      mimeType: "application/pdf",
      bytes: await original.save(),
    },
    {
      id: "image",
      kind: "file",
      title: "Dense messages.png",
      mimeType: "image/png",
      bytes: canvas.toBuffer("image/png"),
    },
    {
      id: "timeline",
      kind: "timeline",
      title: "Recorded timeline",
      mimeType: "application/json",
      snapshot: JSON.stringify(
        Array.from({ length: 24 }, (_, i) => ({
          date: "2026-09-21",
          title: `Recorded event ${i}`,
          description: `Source-grounded recorded event ${i}. `.repeat(
            i === 10 ? 100 : 3,
          ),
          status: "confirmed",
        })),
      ),
    },
  ];
  const items: ExhibitItem[] = Array.from({ length: 35 }, (_, i) => ({
    id: `mixed-${i}`,
    sourceId: i === 1 ? "image" : i === 2 ? "timeline" : "pdf",
    pages: i === 1 || i === 2 ? undefined : [(i % 2) + 1],
    title:
      i === 0
        ? "A long source title with precise dates and conversation context. ".repeat(
            3,
          )
        : `Synthetic exhibit ${i + 1}`,
    classification:
      i === 0
        ? "Disparaging, profane, or hostile language"
        : "Recorded communications",
    date: "2026-09-21",
    summary:
      i === 0
        ? "This is authored summary text, separate from the original source. ".repeat(
            65,
          )
        : undefined,
  }));
  const packet = await composePacket({
    title: "Synthetic visual acceptance packet",
    items,
    sources,
    settings: {
      ...DEFAULT_PACKET_SETTINGS,
      timelineLayout: "table",
      bates: true,
      batesPlacement: "left",
      labelStyle: "custom",
      prefix: "R2-R-MED",
      coverLetter:
        "Synthetic review fixture. All evidence in this packet was created for software verification.",
    },
  });
  expect(packet.report.exhibitCount).toBe(35);
  expect(packet.report.exhibits.every((e) => e.evidencePageCount! > 0)).toBe(
    true,
  );
  expect(
    packet.report.pages.filter((p) => p.role === "index").length,
  ).toBeGreaterThan(1);
  const pdf = await PDFDocument.load(packet.bytes);
  for (const entry of packet.report.exhibits) {
    const roles = packet.report.pages
      .slice(entry.start - 1, entry.end)
      .map((p) => p.role);
    expect(roles[0]).toBe("cover");
    expect(roles.lastIndexOf("cover")).toBeLessThan(roles.indexOf("evidence"));
  }
  const landscape = packet.report.pages.find(
    (p) => p.sourceId === "pdf" && p.sourcePage === 2,
  )!;
  expect(pdf.getPage(landscape.page - 1).getHeight()).toBeGreaterThan(612);
  await mkdir("output/exhibit-qa", { recursive: true });
  await writeFile("output/exhibit-qa/visual-mixed.pdf", packet.bytes);
  await writeFile(
    "output/exhibit-qa/visual-mixed-report.json",
    JSON.stringify(packet.report, null, 2),
  );
}, 120000);
