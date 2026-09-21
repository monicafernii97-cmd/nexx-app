"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useWorkspace } from "@/lib/workspace-context";
import { RegionEditor } from "./RegionEditor";
import { MessageSelector } from "./MessageSelector";
import { StudioDialog } from "./StudioDialog";
import { PdfPreview } from "./PdfPreview";
import { UploadEvidence } from "./UploadEvidence";
import { Classifications } from "./Classifications";
import {
  sourceSelections,
  classificationNames,
  compareExhibitDates,
} from "../../../shared/exhibits";
import {
  DEFAULT_PACKET_SETTINGS,
  assignLabels,
  parsePageRanges,
  parseSettings,
  type ExhibitItem,
  type PacketSettings,
} from "../../../shared/exhibits";

const control =
  "rounded-lg border border-white/20 bg-slate-900 p-2 text-sm text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400";
const button = `${control} hover:bg-slate-700`;
function useOverview(caseId: Id<"cases">) {
  return useQuery(api.exhibitStudio.overview, { caseId });
}
type Overview = NonNullable<ReturnType<typeof useOverview>>;

export default function ExhibitStudio() {
  const { activeCaseId } = useWorkspace();
  const capability = useQuery(api.exhibitStudio.capability, {});
  if (!activeCaseId)
    return (
      <p className="p-8 text-white">Select a case to open Exhibit Studio.</p>
    );
  if (!capability)
    return (
      <p role="status" className="p-8 text-white">
        Loading Exhibit Studio…
      </p>
    );
  if (!capability.enabled)
    return (
      <div className="p-8 text-white">
        <h1 className="text-2xl">Exhibit Studio</h1>
        <p className="mt-3">
          The new packet builder is being verified for this environment. Saved
          documents remain available in DocuVault.
        </p>
        <SavedPacketArchive caseId={activeCaseId} />
      </div>
    );
  return <CaseStudio key={activeCaseId} caseId={activeCaseId} />;
}
function SavedPacketArchive({ caseId }: { caseId: Id<"cases"> }) {
  const data = useOverview(caseId);
  return (
    <div className="mt-6 space-y-4">
      {data?.collections.map((c) => (
        <section key={c._id}>
          <h2>
            {c.title} · saved draft revision {c.revision}
          </h2>
          <ArchivedDownloads collectionId={c._id} />
        </section>
      ))}
    </div>
  );
}
function ArchivedDownloads({
  collectionId,
}: {
  collectionId: Id<"exhibitCollections">;
}) {
  const versions = useQuery(api.exhibitStudio.candidates, { collectionId });
  return (
    <div className="flex flex-wrap gap-3">
      {versions
        ?.filter((v) => v.url)
        .map((v) => (
          <a
            className="text-amber-300 underline"
            key={v._id}
            href={`${v.url}?download=1`}
          >
            Download {v.status === "finalized" ? "version" : "candidate"}{" "}
            {v.revision}
          </a>
        ))}
    </div>
  );
}
function CaseStudio({ caseId }: { caseId: Id<"cases"> }) {
  const data = useOverview(caseId);
  const [selected, setSelected] = useState<
    Id<"exhibitCollections"> | undefined
  >();
  const [epoch, setEpoch] = useState(0);
  const [dirty, setDirty] = useState(false);
  if (!data)
    return (
      <p role="status" className="p-8 text-white">
        Loading case evidence…
      </p>
    );
  return (
    <div className="space-y-5 p-4 text-white">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Exhibit Studio</h1>
          <p className="text-sm text-slate-400">
            Original evidence. Organized collections. Reviewed packets.
          </p>
          <p className="mt-1 text-xs text-slate-400">Up to 100 exhibits and 500 total packet pages. Originals: 30 MB each, 150 MB combined. Two generation jobs at a time.</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          <select
            aria-label="Saved collection"
            style={{ maxWidth: "100%" }}
            disabled={dirty}
            className={control}
            value={selected ?? ""}
            onChange={(e) => {
              setSelected(
                (e.target.value as Id<"exhibitCollections">) || undefined,
              );
              setEpoch((n) => n + 1);
            }}
          >
            <option value="">New collection</option>
            {data.collections.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
          <button
            className={button}
            disabled={dirty}
            onClick={() => {
              setSelected(undefined);
              setEpoch((n) => n + 1);
            }}
          >
            New collection
          </button>
        </div>
      </header>
      <CollectionEditor
        key={epoch}
        caseId={caseId}
        data={data}
        initialId={selected}
        onCreated={setSelected}
        onDirtyChange={setDirty}
        onReload={() => setEpoch((n) => n + 1)}
      />
    </div>
  );
}
function CollectionEditor({
  caseId,
  data,
  initialId,
  onCreated,
  onReload,
  onDirtyChange,
}: {
  caseId: Id<"cases">;
  data: Overview;
  initialId?: Id<"exhibitCollections">;
  onCreated: (id: Id<"exhibitCollections">) => void;
  onReload: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = data.collections.find((c) => c._id === initialId);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [items, setItems] = useState<ExhibitItem[]>(
    initial ? JSON.parse(initial.itemsJson) : [],
  );
  const [settings, setSettings] = useState<PacketSettings>(
    initial
      ? parseSettings(JSON.parse(initial.settingsJson))
      : DEFAULT_PACKET_SETTINGS,
  );
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [focused, setFocused] = useState<string>();
  const [saveState, setSaveState] = useState("Saved");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [lastOperation, setLastOperation] = useState("");
  const [importFiles, setImportFiles] = useState<string[]>([]);
  const [timelineIds, setTimelineIds] = useState<string[]>([]);
  const [subset, setSubset] = useState<ExhibitItem[] | null>(null);
  const [preserveLabels, setPreserveLabels] = useState(true);
  const [combine, setCombine] = useState(false);
  const [classificationFilter, setClassificationFilter] = useState("");
  const save = useMutation(api.exhibitStudio.saveCollection),
    add = useMutation(api.exhibitStudio.addToCollection),
    importSources = useMutation(api.exhibitStudio.importSources),
    generate = useMutation(api.exhibitStudio.generate),
    undo = useMutation(api.exhibitStudio.undo);
  const versionRef = useRef(revision);
  const saving = useRef(false);
  const saved = useRef(JSON.stringify({ title, items, settings }));
  const payload = JSON.stringify({ title, items, settings });
  const focus = items.find((i) => i.id === focused);
  const focusSource = data.sources.find((s) => s._id === focus?.sourceId);
  useEffect(() => {
    onDirtyChange(payload !== saved.current || saveState === "Saving…");
  }, [payload, saveState, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (payload !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [payload]);
  let labels: string[] = [];
  try {
    labels = assignLabels(items, settings);
  } catch {
    /* surfaced by server validation */
  }
  async function saveNow() {
    if (saving.current)
      throw new Error("Wait for the current save before generating.");
    if (payload === saved.current && initialId)
      return { id: initialId, revision: versionRef.current };
    saving.current = true;
    setSaveState("Saving…");
    try {
      const operationId = crypto.randomUUID();
      const result = await save({
        id: initialId,
        caseId,
        title,
        itemsJson: JSON.stringify(items),
        settingsJson: JSON.stringify(settings),
        expectedRevision: versionRef.current,
        operationId,
      });
      saved.current = payload;
      versionRef.current = result.revision;
      setRevision(result.revision);
      setSaveState("Saved");
      setLastOperation(operationId);
      if (!initialId) onCreated(result.id);
      return result;
    } catch (e) {
      setSaveState("Not saved");
      throw e;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (payload === saved.current || !title.trim()) return;
    const timer = setTimeout(() => {
      void saveNow().catch((e) => setError(String(e.message ?? e)));
    }, 1000);
    return () => clearTimeout(timer);
    // Serialized draft identifies the exact state to save; revisions advance after acknowledgment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, saveState]);
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function append(sourceIds: Id<"exhibitSources">[], names: string[] = []) {
    setItems((current) => [
      ...current,
      ...sourceIds.flatMap((id, index) =>
        current.some((i) => i.sourceId === id)
          ? []
          : [
              {
                id: crypto.randomUUID(),
                sourceId: id,
                title:
                  data.sources.find((s) => s._id === id)?.title ??
                  names[index] ??
                  "Evidence",
              },
            ],
      ),
    ]);
  }
  function update(id: string, patch: Partial<ExhibitItem>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function move(index: number, delta: number) {
    setItems((list) => {
      const copy = [...list];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Collection title"
          placeholder="Name this collection"
          className={`${control} min-w-64 flex-1`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span role="status" className="text-xs text-slate-400">
          {payload !== saved.current && saveState === "Saved"
            ? "Unsaved changes"
            : saveState}{" "}
          · revision {revision}
        </span>
        <button
          className={button}
          disabled={busy || !title.trim()}
          onClick={() => perform(saveNow)}
        >
          Save
        </button>
        <button
          className={button}
          disabled={!lastOperation || busy}
          onClick={() =>
            perform(async () => {
              await undo({ operationId: lastOperation });
              onReload();
            })
          }
        >
          Undo last save
        </button>
        <button
          className={`${button} border-amber-500`}
          disabled={busy || !items.length || !title.trim()}
          onClick={() =>
            perform(async () => {
              const current = await saveNow();
              await generate({
                collectionId: current.id,
                revision: current.revision,
                operationId: crypto.randomUUID(),
              });
            })
          }
        >
          Generate preview
        </button>
      </div>
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/50 p-3">
          {error}
          <button className={`${button} ml-3`} onClick={onReload}>
            Reload saved draft
          </button>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)] 2xl:grid-cols-[230px_minmax(0,1fr)_300px]">
        <aside className="space-y-4 rounded-xl border border-white/10 p-4">
          <h2 className="font-semibold">Case evidence</h2>
          <UploadEvidence caseId={caseId} onReady={append} />
          <p className="text-xs text-slate-400">
            Reuse existing files below, including chat attachments. Other
            document formats must first be converted to PDF.
          </p>
          <details open>
            <summary>Uploaded originals</summary>
            <div className="max-h-60 space-y-2 overflow-auto py-3">
              {data.files.map((f) => (
                <label key={f.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={importFiles.includes(f.id)}
                    onChange={(e) =>
                      setImportFiles((p) =>
                        e.target.checked
                          ? [...p, f.id]
                          : p.filter((id) => id !== f.id),
                      )
                    }
                  />
                  {f.title}
                </label>
              ))}
            </div>
            <button
              className={button}
              disabled={busy || !importFiles.length}
              onClick={() =>
                perform(async () => {
                  append(
                    await importSources({
                      caseId,
                      fileIds: importFiles as Id<"uploadedFiles">[],
                      timelineIds: [],
                      noteIds: [],
                    }),
                    importFiles.map(
                      (id) =>
                        data.files.find((f) => f.id === id)?.title ??
                        "Evidence",
                    ),
                  );
                  setImportFiles([]);
                })
              }
            >
              Import selected files
            </button>
          </details>
          <details>
            <summary>Recorded timeline</summary>
            <div className="max-h-60 space-y-2 overflow-auto py-3">
              {data.events.map((e) => (
                <label key={e.id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={timelineIds.includes(e.id)}
                    onChange={(ev) =>
                      setTimelineIds((p) =>
                        ev.target.checked
                          ? [...p, e.id]
                          : p.filter((id) => id !== e.id),
                      )
                    }
                  />
                  <span>
                    {e.date ?? "Undated"} · {e.title}
                  </span>
                </label>
              ))}
            </div>
            <button
              className={button}
              disabled={busy || !timelineIds.length}
              onClick={() =>
                perform(async () => {
                  append(
                    await importSources({
                      caseId,
                      fileIds: [],
                      timelineIds: timelineIds as Id<"timelineCandidates">[],
                      noteIds: [],
                    }),
                    [`Timeline (${timelineIds.length} events)`],
                  );
                  setTimelineIds([]);
                })
              }
            >
              Snapshot selected timeline
            </button>
          </details>
          <details>
            <summary>User-authored notes</summary>
            {data.notes.map((n) => (
              <button
                key={n.id}
                className={`${button} my-1 w-full text-left`}
                onClick={() =>
                  perform(async () =>
                    append(
                      await importSources({
                        caseId,
                        fileIds: [],
                        timelineIds: [],
                        noteIds: [n.id],
                      }),
                      [n.title],
                    ),
                  )
                }
              >
                {n.title}
              </button>
            ))}
          </details>
          <h3 className="border-t border-white/10 pt-3 text-sm">
            Imported sources
          </h3>
          {data.sources.map((s) => (
            <button
              key={s._id}
              className={`${button} w-full text-left`}
              onClick={() => append([s._id])}
            >
              + {s.title}
            </button>
          ))}
        </aside>
        <main className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-semibold">Exhibits ({items.length})</h2>
            <select
              aria-label="Filter classification"
              className={control}
              value={classificationFilter}
              onChange={(e) => {
                setClassificationFilter(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">All classifications</option>
              {[...new Set(items.flatMap(classificationNames))].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <button
              className={button}
              onClick={() =>
                setSelected(
                  items
                    .filter(
                      (i) =>
                        !classificationFilter ||
                        classificationNames(i).includes(classificationFilter),
                    )
                    .map((i) => i.id),
                )
              }
            >
              Select all
            </button>
            <button
              className={button}
              disabled={!selected.length}
              onClick={() => setShowAdd(true)}
            >
              Add to collection ({selected.length})
            </button>
            <select
              aria-label="Organize exhibits"
              className={control}
              defaultValue="manual"
              onChange={(e) => {
                const field = e.target.value;
                setItems((list) =>
                  [...list].sort((a, b) =>
                    field === "date"
                      ? compareExhibitDates(a, b)
                      : field === "source"
                        ? a.sourceId.localeCompare(b.sourceId)
                        : (
                            a[
                              field as
                                | "classification"
                                | "conversation"
                                | "participants"
                            ] ?? ""
                          ).localeCompare(
                            b[
                              field as
                                | "classification"
                                | "conversation"
                                | "participants"
                            ] ?? "",
                          ),
                  ),
                );
              }}
            >
              <option value="manual" disabled>
                Organize…
              </option>
              <option value="date">By date</option>
              <option value="classification">By classification</option>
              <option value="conversation">By conversation</option>
              <option value="participants">By participant / witness</option>
              <option value="source">By source</option>
            </select>
          </div>
          {!items.length && (
            <p className="rounded-xl border border-dashed border-white/20 p-10 text-center text-slate-400">
              Import evidence or select an existing source to start.
            </p>
          )}
          {items.map((item, index) => (
            <article
              key={item.id}
              hidden={
                !!classificationFilter &&
                !classificationNames(item).includes(classificationFilter)
              }
              className={`rounded-xl border p-3 ${focused === item.id ? "border-amber-500" : "border-white/10"}`}
            >
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Select ${item.title}`}
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(e) =>
                    setSelected((p) =>
                      e.target.checked
                        ? [...p, item.id]
                        : p.filter((id) => id !== item.id),
                    )
                  }
                />
                <button
                  className="flex-1 text-left"
                  onClick={() => setFocused(item.id)}
                >
                  <span className="mr-3 text-amber-300">
                    Exhibit {labels[index] ?? "?"}
                  </span>
                  {item.title}
                  <span className="block text-xs text-slate-400">
                    {item.date ?? "Date not specified"} ·{" "}
                    {classificationNames(item).join(" · ")}
                    {item.pages ? ` · pages ${item.pages.join(", ")}` : ""}
                  </span>
                </button>
                <button
                  aria-label={`Move ${item.title} up`}
                  className={button}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${item.title} down`}
                  className={button}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove ${item.title}`}
                  className={button}
                  onClick={() => {
                    setItems((p) => p.filter((i) => i.id !== item.id));
                    setSelected((p) => p.filter((id) => id !== item.id));
                  }}
                >
                  ×
                </button>
              </div>
            </article>
          ))}
          {focus && (
            <SourcePreview id={focus.sourceId as Id<"exhibitSources">} />
          )}
          {!!focus?.parts?.length && (
            <section className="space-y-2 rounded-xl border border-white/10 p-3">
              <h3>
                Combined exhibit · {1 + focus.parts.length} source selections
              </h3>
              {focus.parts.map((part, index) => (
                <SourcePreview
                  key={`${part.sourceId}-${index}`}
                  id={part.sourceId as Id<"exhibitSources">}
                />
              ))}
              <button
                className={button}
                onClick={() =>
                  setItems((current) =>
                    current.flatMap((i) =>
                      i.id === focus.id
                        ? sourceSelections([i]).map((part, index) => ({
                            ...i,
                            sourceId: part.sourceId,
                            pages: part.pages,
                            crop: part.crop,
                            redactions: part.redactions,
                            messageIds: part.messageIds,
                            id: crypto.randomUUID(),
                            title:
                              index === 0
                                ? i.title
                                : (data.sources.find(
                                    (s) => s._id === part.sourceId,
                                  )?.title ?? i.title),
                            label: undefined,
                            parts: undefined,
                          }))
                        : i,
                    ),
                  )
                }
              >
                Separate sources for individual editing
              </button>
            </section>
          )}
          {focus &&
            focusSource?.kind === "file" &&
            ["application/pdf", "image/png", "image/jpeg"].includes(
              focusSource.mimeType,
            ) && (
              <RegionEditor
                key={focus.id}
                item={focus}
                onChange={(patch) => update(focus.id, patch)}
              />
            )}
          {focus &&
            focusSource?.kind === "file" &&
            ["text/plain", "application/json"].includes(
              focusSource.mimeType,
            ) && (
              <MessageSelector
                key={focus.id}
                item={focus}
                mimeType={focusSource.mimeType}
                onChange={(patch) => update(focus.id, patch)}
              />
            )}
          {initialId && (
            <PacketVersions
              collectionId={initialId}
              revision={revision}
              onSubset={(snapshot) => {
                setSubset(snapshot);
                setSelected(snapshot.map((i) => i.id));
                setShowAdd(true);
              }}
            />
          )}
        </main>
        <aside className="space-y-4 lg:col-span-2 2xl:col-span-1">
          <section className="space-y-3 rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold">
              {focus ? "Selected exhibit" : "Select an exhibit to edit"}
            </h2>
            {focus && (
              <>
                <Field
                  label="Exhibit title"
                  value={focus.title}
                  onChange={(title) => update(focus.id, { title })}
                />
                <Field
                  label="Date or date range"
                  value={focus.date ?? ""}
                  onChange={(date) => update(focus.id, { date })}
                />
                <p className="text-xs text-slate-400">
                  Use YYYY-MM-DD at the start for chronological sorting. Undated
                  or unrecognized dates sort last.
                </p>
                <Field
                  label="Participants / witness"
                  value={focus.participants ?? ""}
                  onChange={(participants) =>
                    update(focus.id, { participants })
                  }
                />
                <Field
                  label="Conversation / thread"
                  value={focus.conversation ?? ""}
                  onChange={(conversation) =>
                    update(focus.id, { conversation })
                  }
                />
                <button
                  className={button}
                  onClick={() => {
                    const clone = {
                      ...focus,
                      id: crypto.randomUUID(),
                      label: undefined,
                      parts: undefined,
                    };
                    setItems((list) => [...list, clone]);
                    setFocused(clone.id);
                  }}
                >
                  Create another excerpt from this source
                </button>
                <Field
                  label="Primary group (optional)"
                  value={focus.classification ?? ""}
                  onChange={(classification) =>
                    update(focus.id, { classification })
                  }
                />
                <Classifications
                  key={focus.id}
                  caseId={caseId}
                  item={focus}
                  onChange={(classifications) =>
                    update(focus.id, { classifications })
                  }
                />
                <Field
                  label="Preserved label (optional)"
                  value={focus.label ?? ""}
                  onChange={(label) =>
                    update(focus.id, { label: label || undefined })
                  }
                />
                <label className="block text-xs text-slate-300">
                  Source pages (blank = all)
                  <input
                    key={focus.id}
                    className={`${control} mt-1 w-full`}
                    defaultValue={focus.pages?.join(",") ?? ""}
                    placeholder="1-3, 5"
                    onBlur={(e) => {
                      try {
                        update(focus.id, {
                          pages: parsePageRanges(e.target.value),
                        });
                        setError("");
                      } catch (err) {
                        setError(String(err));
                      }
                    }}
                  />
                </label>
                <label className="block text-xs text-slate-300">
                  Reviewed cover summary
                  <textarea
                    className={`${control} mt-1 min-h-28 w-full`}
                    value={focus.summary ?? ""}
                    onChange={(e) =>
                      update(focus.id, { summary: e.target.value })
                    }
                  />
                </label>
                <p className="text-xs text-slate-400">
                  Summaries describe the source. Original pages are included
                  separately.
                </p>
              </>
            )}
          </section>
          {initialId && (
            <StudioAssistant
              beforeSend={saveNow}
              onChanged={onReload}
              onCollectionScope={() => setFocused(undefined)}
              collectionId={initialId}
              exhibitId={focused}
              onApply={(patch) => {
                if (focused) update(focused, patch);
              }}
            />
          )}
          <section className="space-y-3 rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold">Packet settings</h2>
            {(
              [
                "titleSheet",
                "index",
                "covers",
                "summaries",
                "dividers",
                "bates",
              ] as const
            ).map((key) => (
              <label key={key} className="flex justify-between text-sm">
                {
                  {
                    titleSheet: "Title sheet",
                    index: "Exhibit index",
                    covers: "Exhibit covers",
                    summaries: "Cover summaries",
                    dividers: "Classification dividers",
                    bates: "Bates on evidence pages",
                  }[key]
                }
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, [key]: e.target.checked }))
                  }
                />
              </label>
            ))}
            <label className="block text-xs">
              Label style
              <select
                className={`${control} mt-1 w-full`}
                value={settings.labelStyle}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    labelStyle: e.target.value as PacketSettings["labelStyle"],
                  }))
                }
              >
                <option value="alpha">A, B, C</option>
                <option value="numeric">1, 2, 3</option>
                <option value="hierarchical">A-1, A-2</option>
                <option value="compact">A1, A2</option>
                <option value="custom">Custom prefix + number</option>
              </select>
            </label>
            {["hierarchical", "compact", "custom"].includes(
              settings.labelStyle,
            ) && (
              <Field
                label="Label prefix (e.g. R2-R-MED)"
                value={settings.prefix}
                onChange={(prefix) => setSettings((s) => ({ ...s, prefix }))}
              />
            )}
            {settings.bates && (
              <>
                <Field
                  label="Bates prefix"
                  value={settings.batesPrefix}
                  onChange={(batesPrefix) =>
                    setSettings((s) => ({ ...s, batesPrefix }))
                  }
                />
                <label className="block text-xs">
                  Bates start
                  <input
                    type="number"
                    min={0}
                    className={`${control} mt-1 w-full`}
                    value={settings.batesStart}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        batesStart: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block text-xs">
                  Bates digits
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className={`${control} mt-1 w-full`}
                    value={settings.batesPadding}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        batesPadding: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="block text-xs">
                  Bates placement
                  <select
                    className={`${control} w-full`}
                    value={settings.batesPlacement}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        batesPlacement: e.target.value as "left" | "right",
                      }))
                    }
                  >
                    <option value="right">Reserved bottom-right margin</option>
                    <option value="left">Reserved bottom-left margin</option>
                  </select>
                </label>
                <label className="block text-xs">
                  Bates font size
                  <input
                    className={`${control} w-full`}
                    type="number"
                    min={8}
                    max={12}
                    value={settings.batesFontSize}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        batesFontSize: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <fieldset className="space-y-2">
                  <legend className="text-xs">
                    Number these physical page types
                  </legend>
                  {(
                    [
                      "title",
                      "letter",
                      "index",
                      "divider",
                      "cover",
                      "evidence",
                    ] as const
                  ).map((role) => (
                    <label className="flex gap-2 text-xs" key={role}>
                      <input
                        type="checkbox"
                        checked={settings.batesRoles.includes(role)}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            batesRoles: e.target.checked
                              ? [...s.batesRoles, role]
                              : s.batesRoles.filter((r) => r !== role),
                          }))
                        }
                      />
                      {role}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            <label className="block text-xs">
              Cover letter (optional)
              <textarea
                className={`${control} mt-1 min-h-24 w-full`}
                value={settings.coverLetter}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, coverLetter: e.target.value }))
                }
              />
            </label>
          </section>
        </aside>
      </div>
      {showAdd && (
        <StudioDialog
          label="Add exhibits to collection"
          onClose={() => {
            setShowAdd(false);
            setSubset(null);
          }}
        >
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-slate-900 p-6">
            <h2 id="collection-dialog-title" className="text-xl">
              Add {selected.length} exhibits to a collection
            </h2>
            <div className="max-h-48 space-y-2 overflow-auto">
              {(subset ?? items).map((i) => (
                <label key={i.id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(i.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, i.id]
                          : prev.filter((id) => id !== i.id),
                      )
                    }
                  />
                  {i.label ?? ""} {i.title}
                </label>
              ))}
            </div>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={preserveLabels}
                onChange={(e) => setPreserveLabels(e.target.checked)}
              />
              Preserve source packet labels
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={combine}
                onChange={(e) => setCombine(e.target.checked)}
              />
              Combine selected items into one exhibit, in this order
            </label>
            <label className="block">
              Destination
              <select
                className={`${control} mt-2 w-full`}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">Create new collection</option>
                {data.collections.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {!destination && (
              <Field
                label="New collection name"
                value={collectionTitle}
                onChange={setCollectionTitle}
              />
            )}
            <p className="text-sm text-slate-400">
              Original evidence is reused. Existing packet versions remain
              unchanged. Duplicate selections are skipped.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className={button}
                onClick={() => {
                  setShowAdd(false);
                  setSubset(null);
                }}
              >
                Cancel
              </button>
              <button
                className={button}
                disabled={
                  busy ||
                  !selected.length ||
                  (!destination && !collectionTitle.trim())
                }
                onClick={() =>
                  perform(async () => {
                    const target = data.collections.find(
                      (c) => c._id === destination,
                    );
                    await add({
                      id: target?._id,
                      caseId,
                      title: collectionTitle,
                      itemsJson: JSON.stringify(
                        (
                          subset ??
                          items.map((i, index) => ({
                            ...i,
                            label: labels[index],
                            originPacket: `${title}, revision ${revision}`,
                          }))
                        ).filter((i) => selected.includes(i.id)),
                      ),
                      expectedRevision: target?.revision ?? 0,
                      relabel: !preserveLabels,
                      combine,
                      operationId: crypto.randomUUID(),
                    });
                    setShowAdd(false);
                    setSubset(null);
                    setSelected([]);
                  })
                }
              >
                Add selected exhibits
              </button>
            </div>
          </div>
        </StudioDialog>
      )}
    </>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-slate-300">
      {label}
      <input
        className={`${control} mt-1 w-full`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function StudioAssistant({
  collectionId,
  exhibitId,
  onApply,
  beforeSend,
  onChanged,
  onCollectionScope,
}: {
  collectionId: Id<"exhibitCollections">;
  exhibitId?: string;
  onApply: (patch: Partial<ExhibitItem>) => void;
  beforeSend: () => Promise<unknown>;
  onChanged: () => void;
  onCollectionScope: () => void;
}) {
  const history = useQuery(api.exhibitStudio.assistantHistory, {
      collectionId,
    }),
    respond = useAction(api.exhibitAssistant.respond);
  const undo = useMutation(api.exhibitStudio.undo);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4">
      <h2 className="font-semibold">Exhibit assistant</h2>
      <p className="text-xs text-amber-200">
        Scope: {exhibitId ? "selected exhibit" : "collection"}
      </p>
      {exhibitId && (
        <button className={button} onClick={onCollectionScope}>
          Work on whole collection
        </button>
      )}
      <div className="max-h-80 space-y-3 overflow-auto">
        {[...(history ?? [])]
          .reverse()
          .filter((h) => h.exhibitId === exhibitId)
          .map((h) => (
            <div key={h._id} className="rounded bg-white/5 p-2 text-sm">
              <strong>{h.role === "user" ? "You" : "Assistant"}</strong>
              <p className="whitespace-pre-wrap">{h.content}</p>
              {h.operationId && (
                <button
                  className={`${button} mt-2`}
                  onClick={async () => {
                    try {
                      await undo({ operationId: h.operationId! });
                      onChanged();
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Undo assistant change
                </button>
              )}
              {h.proposalJson && h.exhibitId === exhibitId && (
                <button
                  className={`${button} mt-2`}
                  onClick={() => onApply(JSON.parse(h.proposalJson!))}
                >
                  Apply suggested description
                </button>
              )}
            </div>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!message.trim() || busy) return;
          setBusy(true);
          setError("");
          try {
            await beforeSend();
            const result = await respond({ collectionId, exhibitId, message });
            setMessage("");
            if (result.changed) onChanged();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea
          aria-label="Message the exhibit assistant"
          className={`${control} min-h-24 w-full`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What should this exhibit highlight?"
        />
        <button className={`${button} mt-2`} disabled={busy || !message.trim()}>
          {busy ? "Reviewing source…" : "Send"}
        </button>
      </form>
    </section>
  );
}
function SourcePreview({ id }: { id: Id<"exhibitSources"> }) {
  const source = useQuery(api.exhibitStudio.sourcePreview, { id });
  if (source === undefined) return <p role="status">Loading original…</p>;
  if (source === null)
    return (
      <p role="alert">
        Original source is unavailable. Restore it or remove this selection from
        the draft.
      </p>
    );
  return (
    <section className="rounded-xl border border-white/10 p-3">
      <h3 className="mb-3 font-semibold">Original · {source.title}</h3>
      {source.url ? (
        <iframe
          title={`Original ${source.title}`}
          className="h-[600px] w-full rounded-lg bg-white"
          src={source.url}
        />
      ) : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm">
          {source.snapshot}
        </pre>
      )}
    </section>
  );
}
function PacketVersions({
  collectionId,
  revision,
  onSubset,
}: {
  collectionId: Id<"exhibitCollections">;
  revision: number;
  onSubset: (items: ExhibitItem[]) => void;
}) {
  const candidates = useQuery(api.exhibitStudio.candidates, { collectionId }),
    finalize = useMutation(api.exhibitStudio.finalize),
    cancel = useMutation(api.exhibitStudio.cancel);
  const [preview, setPreview] = useState<string>();
  const [reviewed, setReviewed] = useState(false);
  const [redactionsReviewed, setRedactionsReviewed] = useState(false);
  const [error, setError] = useState("");
  const selected = candidates?.find((c) => c._id === preview);
  async function run(fn: () => Promise<unknown>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4">
      <h2 className="font-semibold">Packet previews and saved versions</h2>
      {error && <p role="alert">{error}</p>}
      {candidates?.map((c) => (
        <div
          key={c._id}
          className="flex flex-wrap items-center gap-2 border-b border-white/10 py-2"
        >
          <span className="mr-auto text-sm">
            Revision {c.revision} · {c.status}
            {c.status === "generating" && c.stage ? ` · ${c.stage}` : ""}
            {c.revision !== revision ? " · earlier draft" : ""}
          </span>
          {c.url && (
            <button
              className={button}
              onClick={() => {
                setPreview(c._id);
                setReviewed(false);
                setRedactionsReviewed(false);
              }}
            >
              Review PDF
            </button>
          )}
          {c.url && (
            <a
              className={button}
              href={`${c.url}?download=1`}
              target="_blank"
              rel="noreferrer"
            >
              Download {c.status === "finalized" ? "version" : "draft"}
            </a>
          )}
          {c.indexUrl && (
            <a className={button} href={`${c.indexUrl}?download=1`}>
              Download index
            </a>
          )}
          {["queued", "generating"].includes(c.status) && (
            <button
              className={button}
              onClick={() => run(() => cancel({ id: c._id }))}
            >
              Cancel
            </button>
          )}
          {c.status === "finalized" && (
            <button
              className={button}
              onClick={() => {
                const snapshot = JSON.parse(c.itemsJson) as ExhibitItem[],
                  labels = assignLabels(snapshot, JSON.parse(c.settingsJson));
                onSubset(
                  snapshot.map((i, index) => ({
                    ...i,
                    label: labels[index],
                    originPacket: `${c.title}, revision ${c.revision}`,
                  })),
                );
              }}
            >
              Select for new collection
            </button>
          )}
          {c.error && (
            <p role="alert" className="w-full text-sm text-red-300">
              {c.error}
            </p>
          )}
        </div>
      ))}
      {selected?.url && (
        <>
          <PdfPreview
            key={selected._id}
            title="Generated packet preview"
            url={selected.url}
          />
          {selected.reportJson && (
            <p className="text-sm text-slate-300">
              {JSON.parse(selected.reportJson).pageCount} pages ·{" "}
              {JSON.parse(selected.reportJson).exhibitCount} exhibits ·{" "}
              {JSON.parse(selected.reportJson).evidencePageCount} evidence pages
            </p>
          )}
          {selected.reportJson &&
            (JSON.parse(selected.reportJson).warnings as string[]).map((w) => (
              <p key={w} className="text-sm text-amber-200">
                {w}
              </p>
            ))}
          {selected.status === "ready" && (
            <>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed this exact PDF, including its source pages, index,
                numbering, and warnings.
              </label>
              {sourceSelections(JSON.parse(selected.itemsJson)).some(
                (i) => i.redactions?.length,
              ) && (
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={redactionsReviewed}
                    onChange={(e) => setRedactionsReviewed(e.target.checked)}
                  />
                  I compared the redacted pages with the originals and reviewed
                  covers, summaries, and other pages for information that must
                  also be removed.
                </label>
              )}
              <button
                className={button}
                disabled={!reviewed || selected.revision !== revision}
                onClick={() =>
                  run(() =>
                    finalize({
                      id: selected._id,
                      sha256: selected.sha256!,
                      redactionsReviewed,
                    }),
                  )
                }
              >
                Finalize reviewed version
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
