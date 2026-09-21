import { describe, it, expect } from "vitest";
import {
  parseEvidenceMessages,
  selectEvidenceMessages,
} from "../../../../shared/exhibitMessages";
import { planStudioAction } from "../../../../shared/exhibitActions";
import {
  DEFAULT_PACKET_SETTINGS,
  combineExhibits,
  matchingClassifiedSelections,
  classificationNames,
} from "../../../../shared/exhibits";
import { composePacket } from "../compose";
import { PDFDocument, StandardFonts } from "pdf-lib";

describe("traceable selections and constrained actions", () => {
  it("paginates timeline tables without losing event descriptions", async () => {
    const events = Array.from({ length: 45 }, (_, i) => ({
      date: "2026-03-12",
      title: `Event ${i}`,
      description: `Complete recorded description ${i}.`,
      status: "confirmed",
    }));
    const result = await composePacket({
      title: "Timeline",
      items: [{ id: "e", sourceId: "s", title: "Chronology" }],
      settings: { ...DEFAULT_PACKET_SETTINGS, timelineLayout: "table" },
      sources: [
        {
          id: "s",
          title: "Recorded timeline",
          kind: "timeline",
          mimeType: "application/json",
          snapshot: JSON.stringify(events),
        },
      ],
    });
    expect(result.report.evidencePageCount).toBeGreaterThan(1);
    expect(JSON.parse(result.manifestJson).settings.timelineLayout).toBe(
      "table",
    );
  });
  it("requires explicit unlock before an assistant can replace a reviewed summary", () => {
    expect(() =>
      planStudioAction({
        title: "Master",
        items: [
          {
            id: "e",
            sourceId: "s",
            title: "Reviewed",
            summary: "Reviewed summary",
            summaryLocked: true,
          },
        ],
        settings: DEFAULT_PACKET_SETTINGS,
        action: { kind: "set_summary", targetIds: ["e"], value: "Replacement" },
      }),
    ).toThrow("Unlock");
  });
  it("filters combined exhibits to explicitly classified source selections without changing the master", () => {
    const master = combineExhibits([
      {
        id: "first",
        sourceId: "a",
        title: "Appointment",
        classification: "Medical",
        pages: [1],
      },
      {
        id: "second",
        sourceId: "b",
        title: "Language excerpt",
        classification: "Hostile language",
        pages: [3],
      },
    ]);
    expect(classificationNames(master)).toEqual([
      "Medical",
      "Hostile language",
    ]);
    const focused = matchingClassifiedSelections([master], "Hostile language");
    expect(focused).toHaveLength(1);
    expect(focused[0].sourceId).toBe("b");
    expect(focused[0].pages).toEqual([3]);
    expect(focused[0].parts).toEqual([]);
    expect(master.parts?.[0].sourceId).toBe("b");
    expect(master.sourceId).toBe("a");
  });
  it("includes a pinned extraction with its original page and exact manifest text", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("ORIGINAL SOURCE");
    const anchor = {
      id: "anchor",
      sourceId: "s",
      generationId: "generation-1",
      page: 1,
      start: 0,
      end: 15,
      text: "Exact  spacing.\n",
      method: "native",
    };
    const result = await composePacket({
      title: "Pinned text",
      items: [
        {
          id: "e",
          sourceId: "s",
          title: "Excerpt",
          textAnchorId: "anchor",
          pages: [1],
        },
      ],
      textAnchors: [anchor],
      sources: [
        {
          id: "s",
          kind: "file",
          title: "original.pdf",
          mimeType: "application/pdf",
          bytes: await pdf.save(),
        },
      ],
      settings: DEFAULT_PACKET_SETTINGS,
    });
    const evidence = result.report.pages.filter((p) => p.role === "evidence");
    expect(evidence).toHaveLength(2);
    expect(evidence[0].textAnchorId).toBe("anchor");
    expect(evidence[1].sourcePage).toBe(1);
    expect(JSON.parse(result.manifestJson).textAnchors[0].text).toBe(
      anchor.text,
    );
  });
  const raw =
    "[03/12/2026, 10:00 AM] Sam: First message.\nSecond line.\n[03/12/2026, 10:01 AM] Pat: Context.\n[03/12/2026, 10:02 AM] Sam: Third message.";
  it("preserves source ordering, multiline text and omissions in noncontiguous selections", async () => {
    const all = parseEvidenceMessages(raw, "text/plain");
    expect(all[0].text).toBe("First message.\nSecond line.");
    expect(all[0].lineEnd).toBe(2);
    const selected = selectEvidenceMessages(all, ["message-3", "message-1"]);
    expect(selected.map((m) => m.id)).toEqual(["message-1", "message-3"]);
    const result = await composePacket({
      title: "Transcript",
      items: [
        {
          id: "e",
          sourceId: "s",
          title: "Selected moments",
          messageIds: ["message-1", "message-3"],
        },
      ],
      settings: DEFAULT_PACKET_SETTINGS,
      sources: [
        {
          id: "s",
          kind: "file",
          title: "messages.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(raw),
        },
      ],
    });
    expect(
      result.report.pages
        .filter((p) => p.role === "evidence")
        .flatMap((p) => p.messageIds),
    ).toEqual(["message-1", "message-3"]);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: result.bytes.slice() });
    try {
      const pdf = await task.promise;
      const text = (
        await (await pdf.getPage(result.report.pageCount)).getTextContent()
      ).items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ");
      expect(text).toContain("Unselected messages omitted");
      expect(text).not.toContain("Pat:");
      expect(text).toContain("Third message.");
    } finally {
      await task.destroy();
    }
  });
  it("rejects ambiguous imports and stale message identifiers", () => {
    expect(() =>
      parseEvidenceMessages("Someone said something", "text/plain"),
    ).toThrow("Unrecognized");
    expect(() =>
      selectEvidenceMessages(parseEvidenceMessages(raw, "text/plain"), [
        "missing",
      ]),
    ).toThrow("SELECTION_OUT_OF_RANGE");
  });
  it("combines sources in their requested order under one cover and index entry", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let n = 1; n <= 3; n++)
      pdf.addPage().drawText(`Original ${n}`, { font });
    const bundle = combineExhibits([
      { id: "a", sourceId: "s", title: "Combined", pages: [3] },
      { id: "b", sourceId: "s", title: "Second", pages: [1, 2] },
    ]);
    const result = await composePacket({
      title: "Bundle",
      items: [bundle],
      settings: DEFAULT_PACKET_SETTINGS,
      sources: [
        {
          id: "s",
          kind: "file",
          title: "source.pdf",
          mimeType: "application/pdf",
          bytes: await pdf.save(),
        },
      ],
    });
    expect(result.report.exhibitCount).toBe(1);
    expect(result.report.pages.filter((p) => p.role === "cover")).toHaveLength(
      1,
    );
    expect(
      result.report.pages
        .filter((p) => p.role === "evidence")
        .map((p) => p.sourcePage),
    ).toEqual([3, 1, 2]);
    expect(result.report.exhibits[0].end).toBe(result.report.pageCount);
  });
  it("restricts assistant edits to valid targets, scope and numbering contracts", () => {
    const input = {
      title: "Master",
      items: [
        { id: "a", sourceId: "s", title: "First" },
        { id: "b", sourceId: "s", title: "Second" },
      ],
      settings: DEFAULT_PACKET_SETTINGS,
    };
    expect(() =>
      planStudioAction({
        ...input,
        focusedId: "a",
        action: { kind: "set_title", targetIds: ["b"], value: "Wrong target" },
      }),
    ).toThrow("scoped");
    expect(() =>
      planStudioAction({
        ...input,
        action: { kind: "classify", targetIds: ["unknown"], value: "Language" },
      }),
    ).toThrow("unknown");
    const result = planStudioAction({
      ...input,
      action: { kind: "set_label_prefix", targetIds: [], value: "R2-R-MED" },
    });
    expect(result.settings.prefix).toBe("R2-R-MED");
    expect(input.settings.labelStyle).toBe("alpha");
  });
});
