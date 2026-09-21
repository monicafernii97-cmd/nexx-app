export type DeliverySettings = {
  individual: boolean;
  volumes: boolean;
  maxPages: number;
  allowSplit: boolean;
};
export function parseDeliverySettings(value: unknown): DeliverySettings {
  if (!value || typeof value !== "object")
    throw new Error("Choose delivery options.");
  const r = value as Record<string, unknown>;
  if (
    typeof r.individual !== "boolean" ||
    typeof r.volumes !== "boolean" ||
    typeof r.allowSplit !== "boolean"
  )
    throw new Error("Invalid delivery options.");
  if (
    !Number.isSafeInteger(r.maxPages) ||
    Number(r.maxPages) < 10 ||
    Number(r.maxPages) > 500
  )
    throw new Error("Volume limit must be between 10 and 500 pages.");
  return {
    individual: r.individual,
    volumes: r.volumes,
    allowSplit: r.allowSplit,
    maxPages: Number(r.maxPages),
  };
}
export function deliveryFilename(index: number, label: string) {
  const safe =
    label
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60) || "exhibit";
  return `exhibits/${String(index + 1).padStart(3, "0")}-${safe}.pdf`;
}
