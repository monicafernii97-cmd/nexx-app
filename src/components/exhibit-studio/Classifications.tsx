"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ExhibitItem } from "../../../shared/exhibits";
export function Classifications({
  caseId,
  item,
  onChange,
}: {
  caseId: Id<"cases">;
  item: ExhibitItem;
  onChange: (values: NonNullable<ExhibitItem["classifications"]>) => void;
}) {
  const rows = useQuery(api.exhibitClassifications.list, { caseId }),
    save = useMutation(api.exhibitClassifications.save);
  const [name, setName] = useState(""),
    [definition, setDefinition] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <fieldset className="space-y-2 rounded border border-white/10 p-3 text-xs">
      <legend>Case classifications</legend>
      <p className="text-slate-400">
        Choose every applicable group. Assignments preserve the definition used
        when selected; labels describe your interpretation of the evidence.
      </p>
      {rows?.map((row) => (
        <label key={row._id} className="flex gap-2" title={row.definition}>
          <input
            type="checkbox"
            checked={!!item.classifications?.some((c) => c.id === row._id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [
                      ...(item.classifications ?? []),
                      {
                        id: row._id,
                        name: row.name,
                        definition: row.definition,
                        revision: row.revision,
                      },
                    ]
                  : (item.classifications ?? []).filter(
                      (c) => c.id !== row._id,
                    ),
              )
            }
          />
          {row.name}
          {row.code ? ` (${row.code})` : ""}
        </label>
      ))}
      <details>
        <summary>Create a classification</summary>
        <label className="block">
          Classification name
          <input
            className="my-1 w-full rounded bg-slate-900 p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          Short code
          <input
            className="my-1 w-full rounded bg-slate-900 p-2"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label className="block">
          Observable criteria
          <textarea
            className="my-1 w-full rounded bg-slate-900 p-2"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Describe the written words or observable facts included in this group."
          />
        </label>
        <button
          className="rounded border border-white/20 p-2"
          disabled={!name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await save({ caseId, name, code, definition, revision: 0 });
              setName("");
              setDefinition("");
              setCode("");
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save classification
        </button>
      </details>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
