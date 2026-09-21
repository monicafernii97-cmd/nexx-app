"use client";
import { useEffect, useState } from "react";
/** Render the stored candidate itself; review never renders from mutable draft state. */
export function PdfPreview({ url, title }: { url: string; title: string }) {
  const [page, setPage] = useState(1),
    [count, setCount] = useState(1),
    [zoom, setZoom] = useState(100),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setBusy(true);
    setError("");
    void fetch(`${url}?page=${page}`, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Page preview unavailable. You can open or download the stored PDF below.",
          );
        const blob = await r.blob();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImage(objectUrl);
        setCount(Number(r.headers.get("X-PDF-Page-Count")) || 1);
        setBusy(false);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError(String(e.message ?? e));
          setBusy(false);
        }
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, page]);
  const button =
    "rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm disabled:opacity-40";
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={button}
          disabled={page <= 1 || busy}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous page
        </button>
        <label className="text-sm">
          Page{" "}
          <input
            className={`${button} w-20`}
            type="number"
            min={1}
            max={count}
            value={page}
            onChange={(e) =>
              setPage(Math.min(count, Math.max(1, Number(e.target.value) || 1)))
            }
          />{" "}
          of {count}
        </label>
        <button
          className={button}
          disabled={page >= count || busy}
          onClick={() => setPage((n) => n + 1)}
        >
          Next page
        </button>
        <label className="text-sm">
          Zoom
          <select
            className={`${button} ml-1`}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[75, 100, 150, 200].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-amber-300 underline"
        >
          Open PDF
        </a>
      </div>
      {busy && <p role="status">Rendering stored PDF page…</p>}
      {error && <p role="alert">{error}</p>}
      <div
        className="max-h-[760px] overflow-auto rounded bg-slate-800 p-2"
        aria-busy={busy}
      >
        {image && !busy && !error && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={`${title}, page ${page} of ${count}`}
              style={{ width: `${zoom}%`, maxWidth: "none" }}
              className="h-auto bg-white"
            />
          </>
        )}
      </div>
    </section>
  );
}
