"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useWorkspace } from "@/lib/workspace-context";
import { DEFAULT_PACKET_SETTINGS } from "../../../shared/exhibits";
export function TimelinePDFButton({
  timelineIds,
}: {
  timelineIds: Id<"timelineCandidates">[];
}) {
  const [open, setOpen] = useState(false);
  const { activeCaseId } = useWorkspace();
  return open ? (
    <TimelinePDF key={activeCaseId} timelineIds={timelineIds} />
  ) : (
    <button
      className="rounded-lg border border-white/20 px-3 py-2 text-xs text-amber-300"
      onClick={() => setOpen(true)}
    >
      Build timeline PDF
    </button>
  );
}
function TimelinePDF({
  timelineIds,
}: {
  timelineIds: Id<"timelineCandidates">[];
}) {
  const { activeCaseId } = useWorkspace();
  const importSources = useMutation(api.exhibitStudio.importSources),
    save = useMutation(api.exhibitStudio.saveCollection),
    generate = useMutation(api.exhibitStudio.generate);
  const [id, setId] = useState<Id<"exhibitCollections">>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(
    `Recorded timeline — ${new Date().toLocaleDateString()}`,
  );
  const candidates = useQuery(
    api.exhibitStudio.candidates,
    id ? { collectionId: id } : "skip",
  );
  const candidate = candidates?.[0];
  const [layout, setLayout] = useState<"narrative" | "table">("narrative");
  return (
    <div className="space-y-2 rounded border border-white/10 p-3 text-sm">
      <p>
        Save a fixed chronology from {timelineIds.length} selected events. Later
        timeline edits create a new document.
      </p>
      {!id && (
        <label className="block text-xs">
          Timeline PDF title
          <input
            className="mt-1 w-full rounded border border-white/20 bg-slate-900 p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      )}
      {!id && (
        <button
          aria-label="Generate selected chronology"
          disabled={
            busy || !activeCaseId || !timelineIds.length || !title.trim()
          }
          onClick={async () => {
            if (!activeCaseId) return;
            setBusy(true);
            setError("");
            try {
              const [sourceId] = await importSources({
                caseId: activeCaseId,
                fileIds: [],
                timelineIds,
                noteIds: [],
              });
              const collection = await save({
                caseId: activeCaseId,
                title,
                itemsJson: JSON.stringify([
                  { id: crypto.randomUUID(), sourceId, title },
                ]),
                settingsJson: JSON.stringify({
                  ...DEFAULT_PACKET_SETTINGS,
                  timelineLayout: layout,
                  titleSheet: false,
                  index: false,
                  covers: false,
                }),
                expectedRevision: 0,
                operationId: crypto.randomUUID(),
              });
              setId(collection.id);
              await generate({
                collectionId: collection.id,
                revision: collection.revision,
                operationId: crypto.randomUUID(),
              });
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
          className="rounded border border-white/20 p-2"
        >
          {busy ? "Saving snapshot…" : "Generate selected chronology"}
        </button>
      )}
      {id && !candidate?.url && (
        <p role="status">
          {candidate?.error ?? candidate?.stage ?? "Preparing chronology…"}
        </p>
      )}
      {!id && (
        <label className="block text-xs">
          Chronology format
          <select
            aria-label="Chronology format"
            className="ml-2 rounded bg-slate-900 p-2"
            value={layout}
            onChange={(e) => setLayout(e.target.value as "narrative" | "table")}
          >
            <option value="narrative">Narrative</option>
            <option value="table">Table</option>
          </select>
        </label>
      )}
      {candidate?.url && (
        <a
          className="text-amber-300 underline"
          href={`${candidate.url}?download=1`}
        >
          Download timeline PDF
        </a>
      )}
      <a
        className="block text-xs text-slate-300 underline"
        href="/docuvault/exhibits"
      >
        Open saved chronology in Exhibit Studio
      </a>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
