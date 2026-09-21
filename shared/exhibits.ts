/** Shared, deterministic contracts. No browser, provider, or database dependencies. */
/** Convex storage metadata uses base64; manifests use lowercase hexadecimal. */
export function normalizeSha256(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (/^[a-fA-F0-9]{64}$/.test(value)) return value.toLowerCase();
  if (/^[A-Za-z0-9+/]{43}=$/.test(value))
    return Array.from(atob(value), (c) =>
      c.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
  throw new Error(
    "SOURCE_HASH_INVALID: The original file checksum is malformed.",
  );
}
export type Region = { x: number; y: number; width: number; height: number };
export type ExhibitPart = {
  sourceId: string;
  pages?: number[];
  crop?: Region;
  redactions?: { page: number; region: Region }[];
  messageIds?: string[];
};
export type ExhibitItem = {
  id: string;
  sourceId: string;
  title: string;
  date?: string;
  classification?: string;
  classifications?: {
    id: string;
    name: string;
    revision: number;
    definition: string;
  }[];
  participants?: string;
  conversation?: string;
  summary?: string;
  pages?: number[];
  messageIds?: string[];
  crop?: Region;
  redactions?: { page: number; region: Region }[];
  label?: string;
  originLabel?: string;
  originPacket?: string;
  parts?: ExhibitPart[];
};
export type PacketSettings = {
  titleSheet: boolean;
  index: boolean;
  covers: boolean;
  summaries: boolean;
  dividers: boolean;
  labelStyle: "alpha" | "numeric" | "hierarchical" | "compact" | "custom";
  prefix: string;
  start: number;
  bates: boolean;
  batesPrefix: string;
  batesStart: number;
  batesPadding: number;
  batesPlacement: "left" | "right";
  batesFontSize: number;
  batesRoles: (
    | "title"
    | "letter"
    | "index"
    | "divider"
    | "cover"
    | "evidence"
  )[];
  coverLetter: string;
};
export function classificationNames(item: ExhibitItem): string[] {
  const names = [
    item.classification,
    ...(item.classifications ?? []).map((c) => c.name),
  ].filter((s): s is string => !!s);
  return names.length ? [...new Set(names)] : ["Unclassified"];
}
export const DEFAULT_PACKET_SETTINGS: PacketSettings = {
  titleSheet: true,
  index: true,
  covers: true,
  summaries: true,
  dividers: false,
  labelStyle: "alpha",
  prefix: "A",
  start: 1,
  bates: false,
  batesPrefix: "NEX-",
  batesStart: 1,
  batesPadding: 5,
  batesPlacement: "right",
  batesFontSize: 9,
  batesRoles: ["evidence"],
  coverLetter: "",
};
export const EXHIBIT_LIMITS = {
  items: 100,
  pages: 500,
  sourceBytes: 30 * 1024 * 1024,
  totalBytes: 150 * 1024 * 1024,
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid exhibit configuration.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, optional = false): string {
  if (optional && value === undefined) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error("Invalid or oversized exhibit text.");
  return value.trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error("Invalid numbering or page selection.");
  return value;
}
export function parseSettings(input: unknown): PacketSettings {
  const r = record(input);
  const s = { ...DEFAULT_PACKET_SETTINGS };
  for (const key of [
    "titleSheet",
    "index",
    "covers",
    "summaries",
    "dividers",
    "bates",
  ] as const) {
    if (typeof r[key] !== "boolean") throw new Error(`Missing setting: ${key}`);
    s[key] = r[key];
  }
  if (
    !["alpha", "numeric", "hierarchical", "compact", "custom"].includes(
      String(r.labelStyle),
    )
  )
    throw new Error("Invalid label style.");
  s.labelStyle = r.labelStyle as PacketSettings["labelStyle"];
  s.prefix = text(r.prefix, 40);
  s.batesPrefix = text(r.batesPrefix, 30);
  s.coverLetter = text(r.coverLetter, 15000);
  s.start = integer(r.start, 1, 999999);
  s.batesStart = integer(r.batesStart, 0, 999999999);
  s.batesPadding = integer(r.batesPadding, 1, 10);
  s.batesFontSize = integer(r.batesFontSize ?? 9, 8, 12);
  if (
    r.batesPlacement !== undefined &&
    !["left", "right"].includes(String(r.batesPlacement))
  )
    throw new Error("Invalid Bates placement.");
  s.batesPlacement = (r.batesPlacement ?? "right") as "left" | "right";
  if (r.batesRoles !== undefined) {
    if (
      !Array.isArray(r.batesRoles) ||
      r.batesRoles.some(
        (role) =>
          ![
            "title",
            "letter",
            "index",
            "divider",
            "cover",
            "evidence",
          ].includes(String(role)),
      ) ||
      new Set(r.batesRoles).size !== r.batesRoles.length
    )
      throw new Error("Invalid Bates page selection.");
    s.batesRoles = r.batesRoles as PacketSettings["batesRoles"];
  }
  if (s.bates && !s.batesRoles.length)
    throw new Error("Choose at least one page type for Bates numbering.");
  if (["hierarchical", "compact", "custom"].includes(s.labelStyle) && !s.prefix)
    throw new Error("A label prefix is required.");
  return s;
}
export function parseItems(input: unknown): ExhibitItem[] {
  if (!Array.isArray(input) || input.length > EXHIBIT_LIMITS.items)
    throw new Error("Collections support up to 100 exhibits.");
  const ids = new Set<string>();
  const result = input.map((value) => {
    const r = record(value);
    const item: ExhibitItem = {
      id: text(r.id, 100),
      sourceId: text(r.sourceId, 100),
      title: text(r.title, 200),
    };
    if (!item.id || !item.sourceId || !item.title || ids.has(item.id))
      throw new Error(
        "Exhibits require unique identities, sources, and titles.",
      );
    ids.add(item.id);
    if (r.classifications !== undefined) {
      if (!Array.isArray(r.classifications) || r.classifications.length > 20)
        throw new Error("Choose at most 20 classifications.");
      item.classifications = r.classifications.map((value) => {
        const c = record(value);
        const id = text(c.id, 100),
          name = text(c.name, 120);
        if (!id || !name) throw new Error("Invalid classification.");
        return {
          id,
          name,
          revision: integer(c.revision, 1, 1000000),
          definition: text(c.definition, 1000),
        };
      });
      if (
        new Set(item.classifications.map((c) => c.id)).size !==
        item.classifications.length
      )
        throw new Error("Duplicate classification.");
    }
    if (r.parts !== undefined) {
      if (!Array.isArray(r.parts) || r.parts.length > 99)
        throw new Error(
          "An exhibit supports at most 100 ordered source selections.",
        );
      item.parts = r.parts.map((part, index) => {
        const p = record(part);
        if (p.parts) throw new Error("Nested exhibits are unsupported.");
        const parsed = parseItems([
          { ...p, id: `part-${index}`, title: "Source selection" },
        ])[0];
        return {
          sourceId: parsed.sourceId,
          pages: parsed.pages,
          crop: parsed.crop,
          redactions: parsed.redactions,
          messageIds: parsed.messageIds,
        };
      });
    }
    for (const key of [
      "date",
      "classification",
      "participants",
      "conversation",
      "label",
      "originLabel",
      "originPacket",
    ] as const) {
      const val = text(r[key], key === "originPacket" ? 300 : 120, true);
      if (val) item[key] = val;
    }
    const summary = text(r.summary, 5000, true);
    if (summary) item.summary = summary;
    if (r.messageIds !== undefined) {
      if (
        !Array.isArray(r.messageIds) ||
        !r.messageIds.length ||
        r.messageIds.length > 10000
      )
        throw new Error("Select 1–10,000 source messages.");
      item.messageIds = r.messageIds.map((id) => text(id, 100));
      if (
        item.messageIds.some((id) => !id) ||
        new Set(item.messageIds).size !== item.messageIds.length
      )
        throw new Error("Select each source message once.");
      if (r.pages || r.crop || r.redactions)
        throw new Error(
          "Message selection cannot be combined with page/region selection.",
        );
    }
    if (r.redactions !== undefined) {
      if (!Array.isArray(r.redactions) || r.redactions.length > 100)
        throw new Error("At most 100 redaction regions per exhibit.");
      item.redactions = r.redactions.map((value) => {
        const redaction = record(value);
        return {
          page: integer(redaction.page, 1, 10000),
          region: parseRegion(redaction.region),
        };
      });
    }
    if (r.pages !== undefined) {
      if (
        !Array.isArray(r.pages) ||
        !r.pages.length ||
        r.pages.length > EXHIBIT_LIMITS.pages
      )
        throw new Error("Select at least one valid page.");
      item.pages = r.pages.map((p) => integer(p, 1, 10000));
      if (new Set(item.pages).size !== item.pages.length)
        throw new Error(
          "Duplicate source pages must be separate, deliberate exhibits.",
        );
    }
    if (r.crop !== undefined) {
      const c = record(r.crop);
      const values = ["x", "y", "width", "height"].map((k) => c[k]);
      if (values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
        throw new Error("Invalid crop.");
      const [x, y, width, height] = values as number[];
      if (
        x < 0 ||
        y < 0 ||
        width <= 0 ||
        height <= 0 ||
        x + width > 1 ||
        y + height > 1
      )
        throw new Error("Crop must stay inside the source.");
      item.crop = { x, y, width, height };
    }
    return item;
  });
  if (
    sourceSelections(result).length > 500 ||
    JSON.stringify(result).length > 250000
  )
    throw new Error(
      "PROCESSING_LIMIT_EXCEEDED: Reduce the number of selections or description text in this collection.",
    );
  return result;
}
export function parseRegion(input: unknown): Region {
  const c = record(input),
    values = ["x", "y", "width", "height"].map((k) => c[k]);
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
    throw new Error("Invalid region.");
  const [x, y, width, height] = values as number[];
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1
  )
    throw new Error("Region must stay inside the source.");
  return { x, y, width, height };
}
export function sourceSelections(items: ExhibitItem[]): ExhibitPart[] {
  return items.flatMap((item) => [item, ...(item.parts ?? [])]);
}
export function compareExhibitDates(a: ExhibitItem, b: ExhibitItem): number {
  const key = (date?: string) =>
    date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "9999-99-99";
  return key(a.date).localeCompare(key(b.date));
}
export function combineExhibits(items: ExhibitItem[]): ExhibitItem {
  if (!items.length) throw new Error("Select at least one exhibit.");
  const selections = sourceSelections(items),
    first = items[0];
  return {
    ...first,
    parts: selections
      .slice(1)
      .map(({ sourceId, pages, crop, redactions, messageIds }) => ({
        sourceId,
        pages,
        crop,
        redactions,
        messageIds,
      })),
  };
}
export function alphaLabel(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}
export function assignLabels(
  items: ExhibitItem[],
  settings: PacketSettings,
): string[] {
  const labels = items.map(
    (item, i) =>
      item.label ||
      (settings.labelStyle === "alpha"
        ? alphaLabel(i + settings.start - 1)
        : settings.labelStyle === "numeric"
          ? String(i + settings.start)
          : `${settings.prefix}${settings.labelStyle === "compact" ? "" : "-"}${i + settings.start}`),
  );
  if (
    labels.some((l) => !l || l.length > 80 || /^exhibit\b/i.test(l)) ||
    new Set(labels.map((l) => l.toUpperCase())).size !== labels.length
  )
    throw new Error("LABEL_COLLISION: Exhibit labels must be unique.");
  return labels;
}
export function parsePageRanges(value: string): number[] | undefined {
  if (!value.trim()) return undefined;
  const pages: number[] = [];
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page ranges such as 1-3, 5.");
    const a = Number(match[1]),
      b = Number(match[2] ?? a);
    if (a < 1 || b < a || b > 10000 || b - a > EXHIBIT_LIMITS.pages)
      throw new Error("Invalid page range.");
    for (let p = a; p <= b; p++) pages.push(p);
  }
  if (
    pages.length > EXHIBIT_LIMITS.pages ||
    new Set(pages).size !== pages.length
  )
    throw new Error("Overlapping or oversized page selection.");
  return pages;
}
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJSON(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
