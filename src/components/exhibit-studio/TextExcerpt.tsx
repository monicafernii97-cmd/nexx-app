"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ExhibitItem } from "../../../shared/exhibits";
export function TextExcerpt({
  item,
  onChange,
}: {
  item: ExhibitItem;
  onChange: (patch: Partial<ExhibitItem>) => void;
}) {
  const [page, setPage] = useState(item.pages?.[0] ?? 1),
    [range, setRange] = useState<[number, number]>([0, 0]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const source = useQuery(api.exhibitText.page, {
      sourceId: item.sourceId as Id<"exhibitSources">,
      page,
    }),
    anchor = useQuery(
      api.exhibitText.anchor,
      item.textAnchorId
        ? { id: item.textAnchorId as Id<"exhibitTextAnchors"> }
        : "skip",
    ),
    pin = useMutation(api.exhibitText.pin);
  return (
    <details className="space-y-2 rounded border border-white/10 p-3 text-xs">
      <summary>Select extracted text</summary>
      <p>
        Highlight text below using the mouse or keyboard. A fixed transcription
        and the original source page will be included together. Review
        recognition errors against the original.
      </p>
      <label className="block">
        Extraction page
        <input
          type="number"
          min={1}
          max={10000}
          className="ml-2 w-20 rounded bg-slate-900 p-2"
          value={page}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isInteger(next) && next > 0) {
              setPage(next);
              setRange([0, 0]);
            }
          }}
        />
      </label>
      {source ? (
        <>
          <textarea
            aria-label="Extracted source text"
            className="h-48 w-full whitespace-pre-wrap rounded bg-slate-900 p-2"
            readOnly
            value={source.text}
            onSelect={(e) =>
              setRange([
                e.currentTarget.selectionStart,
                e.currentTarget.selectionEnd,
              ])
            }
          />
          {source.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          <button
            className="rounded border border-white/20 p-2"
            disabled={
              busy ||
              range[1] <= range[0] ||
              !!item.crop ||
              !!item.redactions?.length ||
              !!item.messageIds
            }
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const id = await pin({
                  sourceId: item.sourceId as Id<"exhibitSources">,
                  pageId: source.id,
                  generationId: source.generationId,
                  start: range[0],
                  end: range[1],
                });
                onChange({ textAnchorId: id, pages: [source.page] });
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Pin selected text ({range[1] - range[0]} characters)
          </button>
        </>
      ) : (
        <p>
          {source === undefined
            ? "Loading extraction…"
            : "No verified extraction is available for this page. Use original pages or a region selection."}
        </p>
      )}
      {anchor && (
        <div>
          <p>
            Pinned original page {anchor.page}; characters {anchor.start + 1}–
            {anchor.end}. Later OCR updates do not change this excerpt.
          </p>
          <blockquote className="my-2 whitespace-pre-wrap border-l-2 border-amber-300 pl-2">
            {anchor.text}
          </blockquote>
          <button
            className="rounded border border-white/20 p-2"
            onClick={() => onChange({ textAnchorId: undefined })}
          >
            Remove text excerpt
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
