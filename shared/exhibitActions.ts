import {
  parseItems,
  parseSettings,
  assignLabels,
  compareExhibitDates,
  type ExhibitItem,
  type PacketSettings,
} from "./exhibits";
export const STUDIO_ACTIONS = [
  "rename_collection",
  "set_title",
  "set_summary",
  "classify",
  "group_by_date",
  "group_by_classification",
  "set_label_prefix",
  "create_collection",
  "generate_preview",
] as const;
export type StudioAction = {
  kind: (typeof STUDIO_ACTIONS)[number];
  targetIds: string[];
  value: string;
};
export function assertRequestedStudioAction(
  action: StudioAction,
  request: string,
) {
  const verbs: Record<StudioAction["kind"], RegExp> = {
    rename_collection: /\b(rename|name|call)\b/i,
    set_title: /\b(rename|retitle|set|change|update|apply)\b/i,
    set_summary: /\b(set|replace|update|apply|save|change)\b/i,
    classify: /\b(classify|categorize|tag|apply|assign)\b/i,
    group_by_date: /\b(sort|order|reorder|group|organize|arrange)\b/i,
    group_by_classification: /\b(sort|order|reorder|group|organize|arrange)\b/i,
    set_label_prefix: /\b(set|change|relabel|label|number|apply|use)\b/i,
    create_collection: /\b(create|make|add|save|put|collect)\b/i,
    generate_preview: /\b(generate|build|create|make|render|preview)\b/i,
  };
  if (
    !verbs[action.kind]?.test(request) ||
    /\b(do not|don't|never)\s+(?:\w+\s+){0,2}(rename|change|apply|create|generate|relabel|add|save|set)\b/i.test(
      request,
    )
  )
    throw new Error(
      "No edit was applied. The current request did not explicitly authorize this operation.",
    );
}
/** Shared tool boundary: the model chooses a permitted operation; application code computes the edit. */
export function planStudioAction(input: {
  action: StudioAction;
  title: string;
  items: ExhibitItem[];
  settings: PacketSettings;
  focusedId?: string;
}) {
  const { action } = input;
  if (
    !STUDIO_ACTIONS.includes(action.kind) ||
    typeof action.value !== "string" ||
    !Array.isArray(action.targetIds)
  )
    throw new Error("Unsupported Studio action.");
  const ids = new Set(action.targetIds);
  if (
    ids.size !== action.targetIds.length ||
    action.targetIds.some((id) => !input.items.some((i) => i.id === id))
  )
    throw new Error("Action contains an unknown exhibit.");
  if (input.focusedId && action.targetIds.some((id) => id !== input.focusedId))
    throw new Error(
      "The assistant is scoped to the selected exhibit. Switch to collection scope for this action.",
    );
  if (
    input.focusedId &&
    [
      "rename_collection",
      "group_by_date",
      "group_by_classification",
      "set_label_prefix",
      "generate_preview",
    ].includes(action.kind)
  )
    throw new Error("Switch to collection scope to change the whole packet.");
  let title = input.title,
    items = parseItems(input.items),
    settings = parseSettings(input.settings);
  if (["set_title", "set_summary", "classify"].includes(action.kind)) {
    if (!ids.size) throw new Error("Select the exhibits to change.");
    if (
      action.kind === "set_summary" &&
      items.some((i) => ids.has(i.id) && i.summaryLocked)
    )
      throw new Error(
        "Unlock the reviewed summary in the inspector before replacing it.",
      );
    const field =
      action.kind === "set_title"
        ? "title"
        : action.kind === "set_summary"
          ? "summary"
          : "classification";
    items = items.map((i) =>
      ids.has(i.id) ? { ...i, [field]: action.value } : i,
    );
  } else if (action.kind === "rename_collection") title = action.value.trim();
  else if (action.kind === "group_by_date") items.sort(compareExhibitDates);
  else if (action.kind === "group_by_classification")
    items.sort((a, b) =>
      (a.classification || "Unclassified").localeCompare(
        b.classification || "Unclassified",
      ),
    );
  else if (action.kind === "set_label_prefix")
    settings = {
      ...settings,
      labelStyle: "custom",
      prefix: action.value.trim(),
    };
  else if (action.kind === "create_collection") {
    if (!ids.size)
      throw new Error("Choose at least one exhibit for the new collection.");
    items = items.filter((i) => ids.has(i.id));
    title = action.value.trim();
  }
  if (!title || title.length > 200)
    throw new Error("Collection titles require 1–200 characters.");
  items = parseItems(items);
  settings = parseSettings(settings);
  assignLabels(items, settings);
  return { title, items, settings };
}
