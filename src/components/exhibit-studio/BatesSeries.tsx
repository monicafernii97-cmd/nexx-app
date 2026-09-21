"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
export function BatesSeries({
  caseId,
  value,
  onChange,
}: {
  caseId: Id<"cases">;
  value?: string;
  onChange: (id: string | undefined) => void;
}) {
  const series = useQuery(api.exhibitBates.list, { caseId }),
    create = useMutation(api.exhibitBates.create),
    archive = useMutation(api.exhibitBates.archive);
  const ledger = useQuery(
    api.exhibitBates.ledger,
    value ? { seriesId: value as Id<"exhibitBatesSeries"> } : "skip",
  );
  const [name, setName] = useState(""),
    [prefix, setPrefix] = useState("CASE-"),
    [start, setStart] = useState(1),
    [padding, setPadding] = useState(6),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = series?.find((s) => s._id === value);
  return (
    <div className="space-y-2 text-xs">
      <label className="block">
        Bates numbering scope
        <select
          aria-label="Bates numbering scope"
          className="mt-1 w-full rounded bg-slate-900 p-2"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">This packet only</option>
          {series?.map((s) => (
            <option disabled={s.archived} value={s._id} key={s._id}>
              {s.name}
              {s.archived
                ? " (archived)"
                : ` · next ${s.prefix}${String(s.next).padStart(s.padding, "0")}`}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <p>
          Each new preview reserves a permanent range. Failed or cancelled
          ranges remain gaps; retries reuse their range. Shared numbering
          applies within this case.
        </p>
      )}
      <details>
        <summary>Create a shared Bates series</summary>
        <div className="space-y-2 p-2">
          <label className="block">
            Series name
            <input
              aria-label="Series name"
              className="w-full rounded bg-slate-900 p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            Series prefix
            <input
              aria-label="Series prefix"
              className="w-full rounded bg-slate-900 p-2"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </label>
          <label className="block">
            First number
            <input
              type="number"
              min={0}
              max={999999999}
              aria-label="Series first number"
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="w-full rounded bg-slate-900 p-2"
            />
          </label>
          <label className="block">
            Minimum digits
            <input
              type="number"
              min={1}
              max={10}
              aria-label="Series minimum digits"
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="w-full rounded bg-slate-900 p-2"
            />
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                onChange(
                  await create({ caseId, name, prefix, start, padding }),
                );
                setName("");
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Create Bates series
          </button>
        </div>
      </details>
      {selected && (
        <details>
          <summary>Reservation ledger</summary>
          <p>Most recent 100 ranges. Reserved ranges are not reused.</p>
          {ledger?.map((r) => (
            <p key={r._id}>
              {r.prefix}
              {String(r.start).padStart(r.padding, "0")}–{r.prefix}
              {String(r.end).padStart(r.padding, "0")} · {r.status}
            </p>
          ))}
          {!selected.archived && (
            <button
              type="button"
              onClick={() =>
                archive({ seriesId: selected._id, revision: selected.revision })
                  .then(() => onChange(undefined))
                  .catch((e) => setError(String(e)))
              }
            >
              Archive series for future packets
            </button>
          )}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
