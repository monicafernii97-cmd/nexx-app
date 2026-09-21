"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useWorkspace } from "@/lib/workspace-context";
import Link from "next/link";
import { StudioDialog } from "./StudioDialog";

export function AddToCollection({
  fileIds = [],
  timelineIds = [],
}: {
  fileIds?: Id<"uploadedFiles">[];
  timelineIds?: Id<"timelineCandidates">[];
}) {
  const [open, setOpen] = useState(false);
  const {activeCaseId}=useWorkspace();
  return (
    <>
      <button
        type="button"
        className="rounded-lg border border-white/20 px-3 py-2 text-xs text-amber-300"
        onClick={() => setOpen(true)}
      >
        Add to collection
      </button>
      {open && (
        <Chooser
          key={activeCaseId}
          fileIds={fileIds}
          timelineIds={timelineIds}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
function Chooser({
  fileIds,
  timelineIds,
  close,
}: {
  fileIds: Id<"uploadedFiles">[];
  timelineIds: Id<"timelineCandidates">[];
  close: () => void;
}) {
  const { activeCaseId } = useWorkspace();
  const capability = useQuery(api.exhibitStudio.capability, {});
  const overview = useQuery(
    api.exhibitStudio.overview,
    activeCaseId && capability?.enabled ? { caseId: activeCaseId } : "skip",
  );
  const importSources = useMutation(api.exhibitStudio.importSources),
    add = useMutation(api.exhibitStudio.addToCollection);
  const undo=useMutation(api.exhibitStudio.undo);
  const operation=useRef<{signature:string;id:string}|null>(null);
  const [destination, setDestination] = useState(""),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [complete, setComplete] = useState(false);
  const input =
    "w-full rounded border border-white/20 bg-slate-800 p-2 text-white";
  return (
    <StudioDialog label="Add evidence to collection" onClose={close}>
      <div className="w-full max-w-md space-y-4 rounded-xl bg-slate-900 p-6 text-white">
        <h2 className="text-lg font-semibold">Add evidence to collection</h2>
        {!capability?.enabled ? (
          <p>Exhibit Studio is not enabled in this environment.</p>
        ) : complete ? (
          <>
            <p>
              Evidence added. Original files and existing packet versions are
              unchanged.
            </p>
            <Link href="/docuvault/exhibits" className="text-amber-300">
              Open Exhibit Studio
            </Link>
            <button className="block rounded border border-white/20 p-2" disabled={busy} onClick={async()=>{if(!operation.current)return;setBusy(true);try{await undo({operationId:operation.current.id});close();}catch(e){setError(String(e));}finally{setBusy(false);}}}>Undo addition</button>
          </>
        ) : (
          <>
            <label className="block">
              Destination
              <select
                className={input}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">New collection</option>
                {overview?.collections.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {!destination && (
              <label className="block">
                Collection name
                <input
                  className={input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            <p className="text-xs text-slate-400">
              Selected timeline events become one saved chronology. Uploaded
              files remain separate exhibits.
            </p>
            <button
              className={input}
              disabled={
                busy || !activeCaseId || (!destination && !title.trim())
              }
              onClick={async () => {
                if (!activeCaseId) return;
                setBusy(true);
                setError("");
                try {
                  const ids = await importSources({
                    caseId: activeCaseId,
                    fileIds,
                    timelineIds,
                    noteIds: [],
                  });
                  const row = overview?.collections.find(
                    (c) => c._id === destination,
                  );
                  const names = fileIds.map(
                    (id) =>
                      overview?.files.find((f) => f.id === id)?.title ??
                      "Evidence",
                  );
                  if (timelineIds.length) names.push("Recorded timeline");
                  const signature=JSON.stringify({destination,title,fileIds,timelineIds});
                  if(operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
                  await add({
                    id: row?._id,
                    caseId: activeCaseId,
                    title,
                    itemsJson: JSON.stringify(
                      ids.map((sourceId, i) => ({
                        id: crypto.randomUUID(),
                        sourceId,
                        title: names[i] ?? "Evidence",
                      })),
                    ),
                    expectedRevision: row?.revision ?? 0,
                    operationId: operation.current.id,
                  });
                  setComplete(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Adding…" : "Add selected evidence"}
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          onClick={close}
          className="rounded border border-white/20 px-3 py-2"
        >
          Close
        </button>
      </div>
    </StudioDialog>
  );
}
