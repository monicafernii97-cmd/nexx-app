import { PDFDocument, PDFName, PDFHexString } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { EXHIBIT_FONT_BASE64 } from "../../../convex/lib/exhibitFont";
import { canonicalJSON } from "../../../shared/exhibits";
import {
  deliveryFilename,
  parseDeliverySettings,
} from "../../../shared/exhibitDelivery";
import type { PacketReport } from "./compose";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const LIMIT = 150 * 1024 * 1024;
export type DeliveryArtifact = {
  filename: string;
  bytes: Uint8Array;
  sha256: string;
  pages?: {
    localPage: number;
    masterPage?: number;
    exhibitId?: string;
    bates?: string;
  }[];
};

/** Derive from reviewed master bytes only. New local links never point outside their PDF. */
export async function buildDelivery(input: {
  master: Uint8Array;
  index: Uint8Array;
  sha256: string;
  manifestJson: string;
  report: PacketReport;
  settings: unknown;
  checkpoint?: (stage: string) => Promise<void>;
}) {
  if (hash(input.master) !== input.sha256)
    throw new Error("PACKET_HASH_MISMATCH");
  const settings = parseDeliverySettings(input.settings);
  const master = await PDFDocument.load(input.master);
  // Strip master navigation BEFORE copying. Removing copied annotations later
  // leaves their recursively copied destinations as hidden orphan PDF objects.
  for (const page of master.getPages()) page.node.delete(PDFName.of("Annots"));
  if (
    master.getPageCount() !== input.report.pageCount ||
    input.report.pages.length !== master.getPageCount()
  )
    throw new Error("PACKET_INVENTORY_MISMATCH");
  const artifacts: DeliveryArtifact[] = [];
  let totalBytes = input.master.length + input.index.length;
  const add = (artifact: DeliveryArtifact) => {
    totalBytes += artifact.bytes.length;
    if (totalBytes > LIMIT)
      throw new Error(
        "DELIVERY_SIZE_LIMIT: Split this delivery into fewer formats.",
      );
    artifacts.push(artifact);
  };
  async function segment(
    start: number,
    end: number,
    title: string,
    filename: string,
  ): Promise<DeliveryArtifact> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      Buffer.from(EXHIBIT_FONT_BASE64, "base64"),
      { subset: true },
    );
    const included = input.report.exhibits.filter(
      (e) => e.end >= start && e.start <= end,
    );
    const rows: {
      page: ReturnType<PDFDocument["addPage"]>;
      y: number;
      masterPage: number;
      lastMasterPage: number;
    }[] = [];
    let p = doc.addPage([612, 792]),
      y = 730;
    const print = (text: string, size = 10) => {
      let line = "";
      for (const char of text) {
        if (font.widthOfTextAtSize(line + char, size) > 490) {
          if (y < 80) {
            p = doc.addPage([612, 792]);
            y = 730;
          }
          p.drawText(line, { x: 54, y, font, size });
          y -= 16;
          line = "";
        }
        line += char;
      }
      if (y < 80) {
        p = doc.addPage([612, 792]);
        y = 730;
      }
      p.drawText(line, { x: 54, y, font, size });
      y -= 18;
    };
    print(title, 18);
    y -= 12;
    print(`Master packet pages ${start}-${end} of ${master.getPageCount()}.`);
    print("Evidence retains master page numbers, exhibit labels and Bates.");
    print("The local index links below navigate within this delivery PDF.");
    print(`Master SHA-256: ${input.sha256}`, 8);
    y -= 14;
    for (const e of included) {
      if (y < 125) {
        p = doc.addPage([612, 792]);
        y = 730;
      }
      print(`${e.label} | ${e.title}`);
      print(
        `Master ${Math.max(start, e.start)}-${Math.min(end, e.end)}${e.start < start || e.end > end ? " | Continued exhibit" : ""}`,
        9,
      );
      if (y < 80) {
        p = doc.addPage([612, 792]);
        y = 730;
      }
      rows.push({
        page: p,
        y,
        masterPage: Math.max(start, e.start),
        lastMasterPage: Math.min(end, e.end),
      });
      print("");
      y -= 8;
    }
    const frontCount = doc.getPageCount();
    const pages: NonNullable<DeliveryArtifact["pages"]> = Array.from(
      { length: frontCount },
      (_, i) => ({ localPage: i + 1 }),
    );
    for (const [i, page] of (
      await doc.copyPages(
        master,
        Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i),
      )
    ).entries()) {
      // Master index destinations would otherwise reference uncopied pages. Replace
      // navigation with the validated delivery index and bookmarks below.
      page.node.delete(PDFName.of("Annots"));
      doc.addPage(page);
      const origin = input.report.pages[start - 1 + i];
      pages.push({
        localPage: frontCount + i + 1,
        masterPage: start + i,
        exhibitId: origin.exhibitId,
        bates: origin.bates,
      });
    }
    for (const row of rows) {
      const local = frontCount + row.masterPage - start + 1;
      row.page.drawText(
        `Local pages ${local}-${frontCount + row.lastMasterPage - start + 1}`,
        { x: 54, y: row.y, font, size: 9 },
      );
      const a = doc.context.register(
        doc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [50, row.y - 4, 560, row.y + 13],
          Border: [0, 0, 0],
          Dest: [doc.getPage(local - 1).ref, "Fit"],
        }),
      );
      row.page.node.addAnnot(a);
    }
    if (included.length) {
      const root = doc.context.nextRef(),
        refs = included.map(() => doc.context.nextRef());
      included.forEach((e, i) =>
        doc.context.assign(
          refs[i],
          doc.context.obj({
            Title: PDFHexString.fromText(`${e.label} | ${e.title}`),
            Parent: root,
            Dest: [
              doc.getPage(frontCount + Math.max(start, e.start) - start).ref,
              "Fit",
            ],
            ...(i ? { Prev: refs[i - 1] } : {}),
            ...(i < refs.length - 1 ? { Next: refs[i + 1] } : {}),
          }),
        ),
      );
      doc.context.assign(
        root,
        doc.context.obj({
          Type: "Outlines",
          First: refs[0],
          Last: refs[refs.length - 1],
          Count: refs.length,
        }),
      );
      doc.catalog.set(PDFName.of("Outlines"), root);
    }
    doc
      .getPages()
      .slice(0, frontCount)
      .forEach((page, i) =>
        page.drawText(
          `Delivery index ${i + 1}/${frontCount} | ${doc.getPageCount()} local pages`,
          { x: 54, y: 30, font, size: 9 },
        ),
      );
    doc.setTitle(title);
    doc.setCreator("Nexproof Exhibit Studio delivery");
    const bytes = await doc.save();
    if ((await PDFDocument.load(bytes)).getPageCount() !== pages.length)
      throw new Error("DELIVERY_INVENTORY_MISMATCH");
    return { filename, bytes, sha256: hash(bytes), pages };
  }
  if (settings.individual)
    for (const [i, e] of input.report.exhibits.entries()) {
      await input.checkpoint?.(
        `Preparing exhibit ${i + 1} of ${input.report.exhibitCount}`,
      );
      add(
        await segment(
          e.start,
          e.end,
          `Exhibit ${e.label}`,
          deliveryFilename(i, e.label),
        ),
      );
    }
  if (settings.volumes) {
    let start = 1,
      volume = 1;
    while (start <= master.getPageCount()) {
      await input.checkpoint?.(`Preparing volume ${volume}`);
      let end = Math.min(master.getPageCount(), start + settings.maxPages - 2);
      let result: DeliveryArtifact;
      for (;;) {
        const crossing = input.report.exhibits.find(
          (e) => e.start <= end && e.end > end,
        );
        if (
          crossing &&
          crossing.start > start &&
          (!settings.allowSplit ||
            crossing.end - crossing.start + 1 <= settings.maxPages - 1)
        )
          end = crossing.start - 1;
        else if (crossing && !settings.allowSplit)
          throw new Error(
            `EXHIBIT_EXCEEDS_VOLUME: ${crossing.label}. Increase the limit or allow continuation volumes.`,
          );
        result = await segment(
          start,
          end,
          `Volume ${volume}`,
          `volumes/volume-${String(volume).padStart(3, "0")}.pdf`,
        );
        if (result.pages!.length <= settings.maxPages) break;
        end -= result.pages!.length - settings.maxPages;
        if (end < start) throw new Error("VOLUME_INDEX_EXCEEDS_LIMIT");
      }
      add(result);
      start = end + 1;
      volume++;
    }
  }
  const manifest = {
    schemaVersion: 1,
    rendererVersion: 1,
    parentSha256: input.sha256,
    parentManifestSha256: hash(input.manifestJson),
    settings,
    artifacts: [
      {
        filename: "master.pdf",
        sha256: input.sha256,
        bytes: input.master.length,
      },
      {
        filename: "master-index.pdf",
        sha256: hash(input.index),
        bytes: input.index.length,
      },
      ...artifacts.map((a) => ({
        filename: a.filename,
        sha256: a.sha256,
        bytes: a.bytes.length,
        pages: a.pages,
      })),
    ],
    exhibits: input.report.exhibits,
  };
  const manifestJson = canonicalJSON(manifest);
  const zip = new JSZip();
  const date = new Date("2000-01-01T00:00:00Z");
  zip.file("master.pdf", input.master, { date });
  zip.file("master-index.pdf", input.index, { date });
  zip.file("manifest.json", manifestJson, { date });
  zip.file("packet-manifest.json", input.manifestJson, { date });
  zip.file(
    "README.txt",
    "Nexproof exhibit delivery\nMaster.pdf is the unchanged reviewed packet. Individual/volume PDFs retain its printed pagination, exhibit labels and Bates. Their opening delivery indices and bookmarks navigate locally. manifest.json maps local pages to master pages and records SHA-256 checksums. No additional original source files are included.\n",
    { date },
  );
  for (const a of artifacts) zip.file(a.filename, a.bytes, { date });
  await input.checkpoint?.("Building delivery archive");
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  });
  if (bytes.length > LIMIT) throw new Error("DELIVERY_SIZE_LIMIT");
  return { artifacts, bytes, sha256: hash(bytes), manifestJson };
}
