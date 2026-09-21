"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
export function DeliveryPanel({
  candidateId,
}: {
  candidateId: Id<"exhibitCandidates">;
}) {
  const rows = useQuery(api.exhibitDelivery.list, { candidateId }),
    request = useMutation(api.exhibitDelivery.request),
    cancel = useMutation(api.exhibitDelivery.cancel);
  const [options, setOptions] = useState({
    individual: true,
    volumes: false,
    maxPages: 100,
    allowSplit: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef<{ settings: string; id: string } | null>(null);
  return (
    <details className="w-full space-y-3 rounded border border-white/20 p-3">
      <summary>Delivery formats for this finalized version</summary>
      <p className="text-xs">
        The ZIP includes the unchanged master, index and manifest. Additional
        PDFs preserve master labels and Bates. Their opening indices provide
        local navigation.
      </p>
      <label className="block">
        <input
          type="checkbox"
          checked={options.individual}
          onChange={(e) =>
            setOptions({ ...options, individual: e.target.checked })
          }
        />{" "}
        Individual exhibit PDFs
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={options.volumes}
          onChange={(e) =>
            setOptions({ ...options, volumes: e.target.checked })
          }
        />{" "}
        Split into volumes
      </label>
      {options.volumes && (
        <>
          <label className="block">
            Maximum pages per volume{" "}
            <input
              aria-label="Maximum pages per volume"
              type="number"
              min={10}
              max={500}
              value={options.maxPages}
              onChange={(e) =>
                setOptions({ ...options, maxPages: Number(e.target.value) })
              }
              className="w-24 rounded bg-slate-900 p-2"
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={options.allowSplit}
              onChange={(e) =>
                setOptions({ ...options, allowSplit: e.target.checked })
              }
            />{" "}
            Allow an oversized exhibit to continue in another volume
          </label>
        </>
      )}
      <button
        className="rounded border p-2"
        disabled={
          busy || rows?.some((r) => ["queued", "running"].includes(r.status))
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          const settingsJson = JSON.stringify(options);
          if (operation.current?.settings !== settingsJson)
            operation.current = {
              settings: settingsJson,
              id: crypto.randomUUID(),
            };
          try {
            await request({
              candidateId,
              settingsJson,
              operationId: operation.current.id,
            });
            operation.current = null;
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Prepare delivery
      </button>
      {error && <p role="alert">{error}</p>}
      {rows?.map((r) => (
        <div key={r._id} className="space-y-2 border-t border-white/10 pt-2">
          <p role="status">
            Delivery: {r.status} {r.stage ? `· ${r.stage}` : ""}
          </p>
          {r.error && <p role="alert">{r.error}</p>}
          {["queued", "running"].includes(r.status) && (
            <button
              type="button"
              onClick={() =>
                cancel({ id: r._id }).catch((e) => setError(String(e)))
              }
            >
              Cancel delivery
            </button>
          )}
          <div className="flex max-h-64 flex-col gap-2 overflow-auto">
            {r.artifacts?.map((a) => (
              <a
                key={a.filename}
                className="text-amber-300 underline"
                href={a.url}
              >
                Download {a.filename}
              </a>
            ))}
          </div>
        </div>
      ))}
    </details>
  );
}
