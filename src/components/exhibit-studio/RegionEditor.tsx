"use client";
import { useState, useRef } from "react";
import type { ExhibitItem, Region } from "../../../shared/exhibits";
import { parseRegion } from "../../../shared/exhibits";

const control = "rounded border border-white/20 bg-slate-900 p-2 text-sm";
export function RegionEditor({
  item,
  onChange,
}: {
  item: ExhibitItem;
  onChange: (patch: Partial<ExhibitItem>) => void;
}) {
  const [page, setPage] = useState(item.pages?.[0] ?? 1),
    [region, setRegion] = useState<Region>({ x: 0, y: 0, width: 1, height: 1 }),
    [error, setError] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  function apply(redact: boolean) {
    try {
      const valid = parseRegion(region);
      if (redact)
        onChange({
          redactions: [...(item.redactions ?? []), { page, region: valid }],
        });
      else onChange({ pages: [page], crop: valid });
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <details className="space-y-3 rounded-xl border border-white/10 p-3">
      <summary>Crop or redact a source region</summary>
      <p className="text-xs text-slate-300">
        Select a region on the unrotated source page. Coordinates remain fixed
        when you zoom. Cropping selects only this page. Redactions replace
        pixels in the exported derivative; originals remain unchanged. Review
        the generated PDF and its summaries before finalizing.
      </p>
      <label className="block text-sm">
        Source page
        <input
          type="number"
          min={1}
          max={10000}
          value={page}
          onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
          className={control}
        />
      </label>
      <div
        className="relative touch-none select-none border border-white/20"
        onPointerDown={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          start.current = {
            x: (e.clientX - b.left) / b.width,
            y: (e.clientY - b.top) / b.height,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const b = e.currentTarget.getBoundingClientRect(),
            x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
            y = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height));
          setRegion({
            x: Math.min(x, start.current.x),
            y: Math.min(y, start.current.y),
            width: Math.abs(x - start.current.x),
            height: Math.abs(y - start.current.y),
          });
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        {/* Native image preserves source geometry without optimization or cached evidence. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`Unrotated original source page ${page}; region controls follow`}
          src={`/api/exhibits/source/${item.sourceId}?page=${page}`}
          className="block h-auto w-full"
          draggable={false}
          onError={() =>
            setError(
              "Page preview unavailable. Check the page number or use the original preview.",
            )
          }
          onLoad={() => setError("")}
        />
        <div
          className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/20"
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
          }}
        />
        {(item.redactions ?? [])
          .filter((r) => r.page === page)
          .map((r, i) => (
            <div
              key={i}
              className="pointer-events-none absolute bg-black"
              style={{
                left: `${r.region.x * 100}%`,
                top: `${r.region.y * 100}%`,
                width: `${r.region.width * 100}%`,
                height: `${r.region.height * 100}%`,
              }}
            />
          ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <label key={key} className="text-xs">
            {key} (%)
            <input
              className={`${control} w-full`}
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Math.round(region[key] * 1000) / 10}
              onChange={(e) =>
                setRegion((r) => ({
                  ...r,
                  [key]: Number(e.target.value) / 100,
                }))
              }
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={control} onClick={() => apply(false)}>
          Use region as excerpt
        </button>
        <button className={control} onClick={() => apply(true)}>
          Add redaction
        </button>
        {item.crop && (
          <button
            className={control}
            onClick={() => onChange({ crop: undefined })}
          >
            Remove crop
          </button>
        )}
        {!!item.redactions?.length && (
          <button
            className={control}
            onClick={() => onChange({ redactions: undefined })}
          >
            Clear redactions ({item.redactions.length})
          </button>
        )}
      </div>
    </details>
  );
}
