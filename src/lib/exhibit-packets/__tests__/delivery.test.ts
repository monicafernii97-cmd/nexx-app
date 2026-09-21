import { it, expect } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import { composePacket } from "../compose";
import { buildDelivery } from "../delivery";
import {
  DEFAULT_PACKET_SETTINGS,
  parseSettings,
} from "../../../../shared/exhibits";
import { deliveryFilename } from "../../../../shared/exhibitDelivery";

async function fixture() {
  const source = await PDFDocument.create();
  for (let i = 0; i < 12; i++)
    source.addPage([400, 500]).drawText(`ORIGINAL ${i + 1}`, { x: 30, y: 250 });
  return composePacket({
    title: "Delivery verification",
    settings: { ...DEFAULT_PACKET_SETTINGS, bates: true },
    items: [
      {
        id: "a",
        sourceId: "s",
        title: "First long exhibit",
        pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      { id: "b", sourceId: "s", title: "Second exhibit", pages: [11, 12] },
    ],
    sources: [
      {
        id: "s",
        kind: "file",
        title: "original.pdf",
        mimeType: "application/pdf",
        bytes: await source.save(),
      },
    ],
  });
}
it("packages reviewed master, independent exhibits and bounded volumes with complete mappings and local links", async () => {
  const p = await fixture();
  const result = await buildDelivery({
    master: p.bytes,
    index: p.indexBytes,
    sha256: p.sha256,
    manifestJson: p.manifestJson,
    report: p.report,
    settings: {
      individual: true,
      volumes: true,
      maxPages: 10,
      allowSplit: true,
    },
  });
  const zip = await JSZip.loadAsync(result.bytes);
  expect(await zip.file("master.pdf")!.async("uint8array")).toEqual(p.bytes);
  const individuals = result.artifacts.filter((a) =>
    a.filename.startsWith("exhibits/"),
  );
  expect(individuals).toHaveLength(2);
  expect(
    individuals[0]
      .pages!.filter((p) => p.masterPage)
      .every((p) => p.exhibitId === "a"),
  ).toBe(true);
  expect(
    individuals[1]
      .pages!.filter((p) => p.masterPage)
      .every((p) => p.exhibitId === "b"),
  ).toBe(true);
  const volumes = result.artifacts.filter((a) =>
    a.filename.startsWith("volumes/"),
  );
  expect(
    volumes.flatMap((v) =>
      v.pages!.flatMap((p) => (p.masterPage ? [p.masterPage] : [])),
    ),
  ).toEqual(Array.from({ length: p.report.pageCount }, (_, i) => i + 1));
  for (const a of result.artifacts) {
    const doc = await PDFDocument.load(a.bytes),
      refs = new Set(doc.getPages().map((p) => p.ref.toString()));
    expect(
      doc.context
        .enumerateIndirectObjects()
        .filter(
          ([, o]) =>
            o instanceof PDFDict &&
            o.get(PDFName.of("Type")) === PDFName.of("Page"),
        ),
    ).toHaveLength(doc.getPageCount());
    if (a.filename.startsWith("volumes/"))
      expect(doc.getPageCount()).toBeLessThanOrEqual(10);
    for (const page of doc.getPages())
      for (const ref of page.node
        .lookupMaybe(PDFName.of("Annots"), PDFArray)
        ?.asArray() ?? []) {
        const annot = doc.context.lookup(ref, PDFDict);
        const dest = annot.lookup(PDFName.of("Dest"), PDFArray);
        expect(refs.has(dest.get(0).toString())).toBe(true);
      }
    for (const mapping of a.pages!.filter((p) => p.masterPage))
      expect(mapping.bates).toBe(p.report.pages[mapping.masterPage! - 1].bates);
  }
  await mkdir("output/exhibit-extensions", { recursive: true });
  await writeFile("output/exhibit-extensions/delivery.zip", result.bytes);
  await writeFile("output/exhibit-extensions/volume.pdf", volumes[1].bytes);
}, 30000);
it("blocks implicit exhibit splitting and altered parent bytes", async () => {
  const p = await fixture(),
    input = {
      master: p.bytes,
      index: p.indexBytes,
      sha256: p.sha256,
      manifestJson: p.manifestJson,
      report: p.report,
      settings: {
        individual: false,
        volumes: true,
        maxPages: 10,
        allowSplit: false,
      },
    };
  await expect(buildDelivery(input)).rejects.toThrow("EXHIBIT_EXCEEDS_VOLUME");
  await expect(
    buildDelivery({ ...input, sha256: "0".repeat(64) }),
  ).rejects.toThrow("PACKET_HASH_MISMATCH");
  expect(deliveryFilename(0, "../../CON:💥")).not.toContain("..");
  expect(deliveryFilename(0, "a/b")).not.toBe(deliveryFilename(1, "a?b"));
});
it("allocates shared Bates only after the exact physical-page plan is known", async () => {
  const source = await PDFDocument.create();
  source.addPage();
  let requested = 0;
  const p = await composePacket({
    title: "Shared Bates",
    settings: {
      ...DEFAULT_PACKET_SETTINGS,
      bates: true,
      batesSeriesId: "series",
    },
    items: [{ id: "a", sourceId: "s", title: "Evidence" }],
    sources: [
      {
        id: "s",
        kind: "file",
        title: "source.pdf",
        mimeType: "application/pdf",
        bytes: await source.save(),
      },
    ],
    allocateBates: async (count) => {
      requested = count;
      return { start: 201, prefix: "CASE-", padding: 6, reservationId: "r" };
    },
  });
  expect(requested).toBe(1);
  expect(p.report.pages.filter((p) => p.bates).map((p) => p.bates)).toEqual([
    "CASE-000201",
  ]);
  expect(JSON.parse(p.manifestJson).batesReservation.reservationId).toBe("r");
  expect(parseSettings(DEFAULT_PACKET_SETTINGS).batesSeriesId).toBeUndefined();
});
