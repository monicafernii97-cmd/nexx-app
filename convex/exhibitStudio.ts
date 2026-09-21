import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getAuthenticatedUser, validateCaseOwnership } from "./lib/auth";
import {
  DEFAULT_PACKET_SETTINGS,
  parseItems,
  parseSettings,
  assignLabels,
  canonicalJSON,
  sourceSelections,
  combineExhibits,
  normalizeSha256,
} from "../shared/exhibits";

function enabled() {
  if (process.env.EXHIBIT_STUDIO_ENABLED !== "true")
    throw new Error("Exhibit Studio is not enabled on this deployment.");
}
async function access(ctx: QueryCtx | MutationCtx, caseId: Id<"cases">) {
  const user = await getAuthenticatedUser(ctx);
  await validateCaseOwnership(ctx, caseId, user._id);
  return user;
}
async function collection(
  ctx: QueryCtx | MutationCtx,
  id: Id<"exhibitCollections">,
) {
  const row = await ctx.db.get(id);
  if (!row) throw new Error("Collection not found.");
  const user = await access(ctx, row.caseId);
  if (row.userId !== user._id) throw new Error("Collection not found.");
  return row;
}
async function checkSources(
  ctx: QueryCtx | MutationCtx,
  caseId: Id<"cases">,
  userId: Id<"users">,
  items: ReturnType<typeof parseItems>,
) {
  const owner = await ctx.db.get(userId);
  for (const item of items)
    for (const ref of item.classifications ?? []) {
      const id = ctx.db.normalizeId("exhibitClassifications", ref.id);
      const row = id ? await ctx.db.get(id) : null;
      if (
        !row ||
        row.caseId !== caseId ||
        row.userId !== userId ||
        ref.revision > row.revision
      )
        throw new Error("Classification is unavailable in this case.");
    }
  for (const id of new Set(sourceSelections(items).map((i) => i.sourceId))) {
    const normalized = ctx.db.normalizeId("exhibitSources", id);
    const source = normalized ? await ctx.db.get(normalized) : null;
    if (!source || source.caseId !== caseId || source.userId !== userId)
      throw new Error(
        "SOURCE_UNAVAILABLE: One of the selected sources is not available in this case.",
      );
    if (source.kind === "file") {
      const originalId = ctx.db.normalizeId("uploadedFiles", source.originId);
      const original = originalId ? await ctx.db.get(originalId) : null;
      if (
        !original ||
        original.caseId !== caseId ||
        original.clerkUserId !== owner?.clerkId ||
        original.deletedAt ||
        ["deleted", "quarantined", "failed"].includes(original.status) ||
        original.storageId !== source.storageId
      )
        throw new Error(
          "SOURCE_UNAVAILABLE: Restore the original file or remove it from this draft.",
        );
    }
  }
}
export const capability = query({
  args: {},
  handler: async () => ({
    enabled: process.env.EXHIBIT_STUDIO_ENABLED === "true",
  }),
});
export const assistantHistory = query({
  args: { collectionId: v.id("exhibitCollections") },
  handler: async (ctx, { collectionId }) => {
    await collection(ctx, collectionId);
    return ctx.db
      .query("exhibitMessages")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .order("desc")
      .take(40);
  },
});
export const assistantContext = query({
  args: {
    collectionId: v.id("exhibitCollections"),
    exhibitId: v.optional(v.string()),
  },
  handler: async (ctx, { collectionId, exhibitId }) => {
    const row = await collection(ctx, collectionId);
    const items = parseItems(JSON.parse(row.itemsJson));
    const focused = exhibitId
      ? items.find((i) => i.id === exhibitId)
      : undefined;
    if (exhibitId && !focused)
      throw new Error("Exhibit is no longer in this collection.");
    const source = focused
      ? await ctx.db.get(
          ctx.db.normalizeId("exhibitSources", focused.sourceId)!,
        )
      : null;
    await checkSources(
      ctx,
      row.caseId,
      row.userId,
      focused ? [focused] : items,
    );
    const history = await ctx.db
      .query("exhibitMessages")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .order("desc")
      .take(10);
    return { collection: row, focused, source, history: history.reverse() };
  },
});
export const recordAssistantRequest = mutation({
  args: {
    collectionId: v.id("exhibitCollections"),
    exhibitId: v.optional(v.string()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await collection(ctx, args.collectionId);
    if (!args.content.trim() || args.content.length > 4000)
      throw new Error("Ask a question of up to 4,000 characters.");
    const recent = await ctx.db
      .query("exhibitMessages")
      .withIndex("by_user_time", (q) =>
        q.eq("userId", row.userId).gte("createdAt", Date.now() - 86400000),
      )
      .take(201);
    if (recent.filter((m) => m.role === "user").length >= 40)
      throw new Error(
        "The Studio assistant daily limit has been reached. Manual packet tools remain available.",
      );
    if (
      recent.some((m) => m.role === "user" && m.createdAt > Date.now() - 5000)
    )
      throw new Error("Please wait a moment before the next request.");
    return ctx.db.insert("exhibitMessages", {
      ...args,
      userId: row.userId,
      role: "user",
      createdAt: Date.now(),
    });
  },
});
export const recordAssistantResponse = internalMutation({
  args: {
    requestId: v.id("exhibitMessages"),
    content: v.string(),
    proposalJson: v.optional(v.string()),
    operationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Assistant request not found.");
    return ctx.db.insert("exhibitMessages", {
      userId: request.userId,
      collectionId: request.collectionId,
      exhibitId: request.exhibitId,
      role: "assistant",
      content: args.content.slice(0, 12000),
      proposalJson: args.proposalJson,
      operationId: args.operationId,
      createdAt: Date.now(),
    });
  },
});
export const overview = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    const user = await access(ctx, caseId);
    const [collections, sources, files, events, pins] = await Promise.all([
      ctx.db
        .query("exhibitCollections")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
      ctx.db
        .query("exhibitSources")
        .withIndex("by_case", (q) => q.eq("caseId", caseId))
        .collect(),
      ctx.db
        .query("uploadedFiles")
        .withIndex("by_clerk_case", (q) =>
          q.eq("clerkUserId", user.clerkId!).eq("caseId", caseId),
        )
        .collect(),
      ctx.db
        .query("timelineCandidates")
        .withIndex("by_userId_caseId", (q) =>
          q.eq("userId", user._id).eq("caseId", caseId),
        )
        .collect(),
      ctx.db
        .query("casePins")
        .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
        .collect(),
    ]);
    return {
      collections: collections.filter((r) => r.userId === user._id),
      sources: sources
        .filter((r) => r.userId === user._id)
        .map((r) => ({
          _id: r._id,
          title: r.title,
          kind: r.kind,
          mimeType: r.mimeType,
          createdAt: r.createdAt,
        })),
      files: files
        .filter(
          (r) =>
            r.storageId &&
            !r.deletedAt &&
            !["deleted", "quarantined", "failed"].includes(r.status),
        )
        .map((r) => ({
          id: r._id,
          title: r.displayFileName || r.filename,
          mimeType: r.mimeType,
        })),
      events: events.map((r) => ({
        id: r._id,
        title: r.title,
        date: r.eventDate,
        status: r.status,
      })),
      notes: pins
        .filter((r) => r.userId === user._id)
        .map((r) => ({ id: r._id, title: r.title })),
    };
  },
});
export const importSources = mutation({
  args: {
    caseId: v.id("cases"),
    fileIds: v.array(v.id("uploadedFiles")),
    timelineIds: v.array(v.id("timelineCandidates")),
    noteIds: v.array(v.id("casePins")),
  },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.caseId);
    const result: Id<"exhibitSources">[] = [];
    if (
      args.fileIds.length + args.timelineIds.length + args.noteIds.length >
      100
    )
      throw new Error("Select at most 100 sources.");
    for (const fileId of new Set(args.fileIds)) {
      const file = await ctx.db.get(fileId);
      if (
        !file ||
        file.clerkUserId !== user.clerkId ||
        file.caseId !== args.caseId ||
        !file.storageId ||
        file.deletedAt ||
        ["deleted", "quarantined", "failed"].includes(file.status)
      )
        throw new Error("Source unavailable in this case.");
      if (
        ![
          "application/pdf",
          "image/png",
          "image/jpeg",
          "text/plain",
          "application/json",
        ].includes(file.mimeType)
      )
        throw new Error(
          "Supported originals: PDF, PNG, JPEG, WhatsApp text exports, and structured message JSON. Convert other sources first.",
        );
      const prior = await ctx.db
        .query("exhibitSources")
        .withIndex("by_user_origin", (q) =>
          q.eq("userId", user._id).eq("originId", fileId),
        )
        .first();
      if (prior && prior.storageId === file.storageId) {
        result.push(prior._id);
        continue;
      }
      result.push(
        await ctx.db.insert("exhibitSources", {
          userId: user._id,
          caseId: args.caseId,
          title: file.displayFileName || file.filename,
          kind: "file",
          originId: fileId,
          storageId: file.storageId,
          sha256: normalizeSha256(file.storageSha256 ?? file.sha256Hash),
          mimeType: file.mimeType,
          createdAt: Date.now(),
        }),
      );
    }
    if (args.timelineIds.length) {
      const events = [];
      for (const id of new Set(args.timelineIds)) {
        const e = await ctx.db.get(id);
        if (!e || e.userId !== user._id || e.caseId !== args.caseId)
          throw new Error("Timeline source unavailable.");
        events.push({
          id: e._id,
          date: e.eventDate ?? "Undated",
          title: e.title,
          description: e.description,
          status: e.status,
          revisionAt: e.updatedAt,
          tags: e.tags ?? [],
          sourceMessageId: e.sourceMessageId,
          sourceConversationId: e.sourceConversationId,
          linkedIncidentId: e.linkedIncidentId,
        });
      }
      events.sort((a, b) => a.date.localeCompare(b.date));
      const snapshot = canonicalJSON(events);
      result.push(
        await ctx.db.insert("exhibitSources", {
          userId: user._id,
          caseId: args.caseId,
          title: `Timeline (${events.length} events)`,
          kind: "timeline",
          originId: `timeline:${Date.now()}`,
          mimeType: "text/plain",
          snapshot,
          createdAt: Date.now(),
        }),
      );
    }
    for (const id of new Set(args.noteIds)) {
      const note = await ctx.db.get(id);
      if (!note || note.userId !== user._id || note.caseId !== args.caseId)
        throw new Error("Note unavailable.");
      result.push(
        await ctx.db.insert("exhibitSources", {
          userId: user._id,
          caseId: args.caseId,
          title: note.title,
          kind: "note",
          originId: id,
          mimeType: "text/plain",
          snapshot: note.content,
          createdAt: Date.now(),
        }),
      );
    }
    return result;
  },
});
export const saveCollection = mutation({
  args: {
    id: v.optional(v.id("exhibitCollections")),
    caseId: v.id("cases"),
    title: v.string(),
    itemsJson: v.string(),
    settingsJson: v.string(),
    expectedRevision: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.caseId);
    if (!args.operationId || args.operationId.length > 100)
      throw new Error("Invalid operation ID.");
    const previous = await ctx.db
      .query("exhibitOperations")
      .withIndex("by_user_operation", (q) =>
        q.eq("userId", user._id).eq("operationId", args.operationId),
      )
      .first();
    if (previous)
      return { id: previous.collectionId, revision: previous.resultRevision };
    if (!args.title.trim() || args.title.length > 200)
      throw new Error("Enter a collection title of 1–200 characters.");
    const items = parseItems(JSON.parse(args.itemsJson)),
      settings = parseSettings(JSON.parse(args.settingsJson));
    assignLabels(items, settings);
    await checkSources(ctx, args.caseId, user._id, items);
    const old = args.id ? await collection(ctx, args.id) : null;
    if (
      old &&
      (old.caseId !== args.caseId || old.revision !== args.expectedRevision)
    )
      throw new Error(
        "DRAFT_REVISION_CONFLICT: Reload this collection before saving.",
      );
    if (!old && args.expectedRevision !== 0)
      throw new Error("Invalid initial revision.");
    const revision = (old?.revision ?? 0) + 1,
      now = Date.now();
    const data = {
      title: args.title.trim(),
      itemsJson: JSON.stringify(items),
      settingsJson: JSON.stringify(settings),
      revision,
      updatedAt: now,
    };
    const id = old
      ? old._id
      : await ctx.db.insert("exhibitCollections", {
          ...data,
          userId: user._id,
          caseId: args.caseId,
          createdAt: now,
        });
    if (old) await ctx.db.patch(old._id, data);
    await ctx.db.insert("exhibitOperations", {
      userId: user._id,
      operationId: args.operationId,
      collectionId: id,
      beforeJson: old
        ? JSON.stringify({
            title: old.title,
            itemsJson: old.itemsJson,
            settingsJson: old.settingsJson,
          })
        : undefined,
      resultRevision: revision,
      createdAt: now,
    });
    return { id, revision };
  },
});
export const addToCollection = mutation({
  args: {
    combine: v.optional(v.boolean()),
    relabel: v.optional(v.boolean()),
    id: v.optional(v.id("exhibitCollections")),
    caseId: v.id("cases"),
    title: v.string(),
    itemsJson: v.string(),
    expectedRevision: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await access(ctx, args.caseId);
    if (!args.operationId || args.operationId.length > 100)
      throw new Error("Invalid operation ID.");
    const prior = await ctx.db
      .query("exhibitOperations")
      .withIndex("by_user_operation", (q) =>
        q.eq("userId", user._id).eq("operationId", args.operationId),
      )
      .first();
    if (prior)
      return { id: prior.collectionId, revision: prior.resultRevision };
    const old = args.id ? await collection(ctx, args.id) : null;
    if (
      old &&
      (old.caseId !== args.caseId || old.revision !== args.expectedRevision)
    )
      throw new Error("DRAFT_REVISION_CONFLICT");
    const selected = parseItems(JSON.parse(args.itemsJson));
    const incoming = args.combine
      ? parseItems([combineExhibits(selected)])
      : selected;
    await checkSources(ctx, args.caseId, user._id, incoming);
    const items = old ? parseItems(JSON.parse(old.itemsJson)) : [];
    const key = (i: (typeof items)[number]) =>
      canonicalJSON({
        sourceId: i.sourceId,
        pages: i.pages,
        crop: i.crop,
        redactions: i.redactions,
        messageIds: i.messageIds,
        parts: i.parts,
      });
    const existing = new Set(items.map(key));
    for (const item of incoming)
      if (!existing.has(key(item))) {
        items.push({
          ...item,
          label: args.relabel ? undefined : item.label,
          originLabel: item.label ?? item.originLabel,
        });
        existing.add(key(item));
      }
    parseItems(items);
    assignLabels(
      items,
      parseSettings(
        JSON.parse(
          old?.settingsJson ?? JSON.stringify(DEFAULT_PACKET_SETTINGS),
        ),
      ),
    );
    const title = old?.title ?? args.title.trim();
    if (!title || title.length > 200)
      throw new Error("Enter a collection title.");
    const revision = (old?.revision ?? 0) + 1,
      now = Date.now();
    const data = {
      title,
      itemsJson: JSON.stringify(items),
      settingsJson:
        old?.settingsJson ?? JSON.stringify(DEFAULT_PACKET_SETTINGS),
      revision,
      updatedAt: now,
    };
    const id = old
      ? old._id
      : await ctx.db.insert("exhibitCollections", {
          ...data,
          userId: user._id,
          caseId: args.caseId,
          createdAt: now,
        });
    if (old) await ctx.db.patch(id, data);
    await ctx.db.insert("exhibitOperations", {
      userId: user._id,
      operationId: args.operationId,
      collectionId: id,
      resultRevision: revision,
      beforeJson: old
        ? JSON.stringify({
            title: old.title,
            itemsJson: old.itemsJson,
            settingsJson: old.settingsJson,
          })
        : undefined,
      createdAt: now,
    });
    return { id, revision };
  },
});
export const undo = mutation({
  args: { operationId: v.string() },
  handler: async (ctx, { operationId }) => {
    const user = await getAuthenticatedUser(ctx);
    enabled();
    const op = await ctx.db
      .query("exhibitOperations")
      .withIndex("by_user_operation", (q) =>
        q.eq("userId", user._id).eq("operationId", operationId),
      )
      .first();
    if (!op) throw new Error("This operation cannot be undone.");
    const current = await collection(ctx, op.collectionId);
    if (current.revision !== op.resultRevision)
      throw new Error("Newer edits exist; undo would overwrite them.");
    const previous = (
      op.beforeJson
        ? JSON.parse(op.beforeJson)
        : {
            title: current.title,
            itemsJson: "[]",
            settingsJson: current.settingsJson,
          }
    ) as {
      title: string;
      itemsJson: string;
      settingsJson: string;
    };
    await ctx.db.patch(current._id, {
      ...previous,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    });
  },
});
export const sourcePreview = query({
  args: { id: v.id("exhibitSources") },
  handler: async (ctx, { id }) => {
    const source = await ctx.db.get(id);
    if (!source) return null;
    const user = await access(ctx, source.caseId);
    if (user._id !== source.userId) throw new Error("Source not found.");
    try {
      await checkSources(ctx, source.caseId, user._id, [
        { id: "preview", sourceId: id, title: source.title },
      ]);
    } catch {
      return null;
    }
    return {
      title: source.title,
      mimeType: source.mimeType,
      snapshot: source.snapshot,
      url: source.storageId ? `/api/exhibits/source/${source._id}` : null,
    };
  },
});
export const downloadAccess = query({
  args: {
    id: v.string(),
    kind: v.union(v.literal("source"), v.literal("packet"), v.literal("index")),
  },
  handler: async (ctx, { id, kind }) => {
    if (kind === "source") {
      const sourceId = ctx.db.normalizeId("exhibitSources", id);
      const row = sourceId ? await ctx.db.get(sourceId) : null;
      if (!row) throw new Error("Not found.");
      const user = await access(ctx, row.caseId);
      if (row.userId !== user._id) throw new Error("Not found.");
      await checkSources(ctx, row.caseId, user._id, [
        { id: "download", sourceId: id, title: row.title },
      ]);
      return {
        url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
        title: row.title,
        mimeType: row.mimeType,
        sha256: row.sha256,
      };
    }
    const packetId = ctx.db.normalizeId("exhibitCandidates", id);
    const row = packetId ? await ctx.db.get(packetId) : null;
    if (!row) throw new Error("Not found.");
    await collection(ctx, row.collectionId);
    if (kind === "index")
      return {
        url: row.indexStorageId
          ? await ctx.storage.getUrl(row.indexStorageId)
          : null,
        title: `${row.title}-index-revision-${row.revision}.pdf`,
        mimeType: "application/pdf",
        sha256: row.indexSha256,
      };
    return {
      url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
      title: `${row.title}-${row.status === "finalized" ? "version" : "draft"}-${row.revision}.pdf`,
      mimeType: "application/pdf",
      sha256: row.sha256,
    };
  },
});
export const generate = mutation({
  args: {
    collectionId: v.id("exhibitCollections"),
    revision: v.number(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    enabled();
    const row = await collection(ctx, args.collectionId);
    if (!args.operationId || args.operationId.length > 100)
      throw new Error("Invalid operation ID.");
    const prior = await ctx.db
      .query("exhibitCandidates")
      .withIndex("by_user_operation", (q) =>
        q.eq("userId", row.userId).eq("operationId", args.operationId),
      )
      .first();
    if (prior) return prior._id;
    if (row.revision !== args.revision)
      throw new Error("DRAFT_REVISION_CONFLICT");
    const items = parseItems(JSON.parse(row.itemsJson));
    if (!items.length) throw new Error("Select at least one exhibit.");
    await checkSources(ctx, row.caseId, row.userId, items);
    assignLabels(items, parseSettings(JSON.parse(row.settingsJson)));
    const jobs = await ctx.db
      .query("exhibitCandidates")
      .withIndex("by_collection", (q) => q.eq("collectionId", row._id))
      .collect();
    if (
      jobs.some(
        (j) =>
          ["queued", "generating"].includes(j.status) &&
          Date.now() - j.updatedAt < 10 * 60 * 1000,
      )
    )
      throw new Error("A packet is already generating for this collection.");
    const now = Date.now();
    const running = await Promise.all(
      ["queued", "generating"].map((status) =>
        ctx.db
          .query("exhibitCandidates")
          .withIndex("by_user_status", (q) =>
            q
              .eq("userId", row.userId)
              .eq("status", status as "queued" | "generating"),
          )
          .take(3),
      ),
    );
    if (running.flat().length >= 2)
      throw new Error(
        "Two packets are already running. Wait or cancel one before starting another.",
      );
    const id = await ctx.db.insert("exhibitCandidates", {
      userId: row.userId,
      caseId: row.caseId,
      collectionId: row._id,
      revision: row.revision,
      title: row.title,
      itemsJson: row.itemsJson,
      settingsJson: row.settingsJson,
      status: "queued",
      operationId: args.operationId,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.exhibitWorker.generate, { id });
    await ctx.scheduler.runAfter(6 * 60 * 1000, internal.exhibitStudio.expire, {
      id,
    });
    return id;
  },
});
export const candidates = query({
  args: { collectionId: v.id("exhibitCollections") },
  handler: async (ctx, { collectionId }) => {
    await collection(ctx, collectionId);
    const rows = await ctx.db
      .query("exhibitCandidates")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .order("desc")
      .take(30);
    return rows.map((r) => ({
      ...r,
      storageId: undefined,
      indexStorageId: undefined,
      indexUrl: r.indexStorageId ? `/api/exhibits/index/${r._id}` : null,
      url: r.storageId ? `/api/exhibits/packet/${r._id}` : null,
    }));
  },
});
export const cancel = mutation({
  args: { id: v.id("exhibitCandidates") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (!r) throw new Error("Packet not found.");
    await collection(ctx, r.collectionId);
    if (!["queued", "generating"].includes(r.status))
      throw new Error("Packet is no longer running.");
    await ctx.db.patch(id, { status: "cancelled", updatedAt: Date.now() });
  },
});
export const finalize = mutation({
  args: {
    id: v.id("exhibitCandidates"),
    sha256: v.string(),
    redactionsReviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, sha256, redactionsReviewed }) => {
    enabled();
    const r = await ctx.db.get(id);
    if (!r) throw new Error("Packet not found.");
    const current = await collection(ctx, r.collectionId);
    if (r.status === "finalized" && r.sha256 === sha256) return id;
    if (r.status !== "ready" || !r.storageId || r.sha256 !== sha256)
      throw new Error("Review the validated candidate before finalizing.");
    if (current.revision !== r.revision)
      throw new Error(
        "The draft changed. Generate and review the current revision.",
      );
    if (!(await ctx.db.system.get(r.storageId)))
      throw new Error(
        "PACKET_UNAVAILABLE: Generate a new candidate before finalization.",
      );
    await checkSources(
      ctx,
      r.caseId,
      r.userId,
      parseItems(JSON.parse(r.itemsJson)),
    );
    if (
      sourceSelections(parseItems(JSON.parse(r.itemsJson))).some(
        (i) => i.redactions?.length,
      ) &&
      !redactionsReviewed
    )
      throw new Error(
        "REDACTION_REVIEW_REQUIRED: Review the exact redacted PDF before finalizing.",
      );
    await ctx.db.patch(id, {
      status: "finalized",
      redactionsReviewed,
      finalizedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  },
});
export const workerInput = internalQuery({
  args: { id: v.id("exhibitCandidates") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || !["queued", "generating"].includes(job.status)) return null;
    await validateCaseOwnership(ctx, job.caseId, job.userId);
    const items = parseItems(JSON.parse(job.itemsJson));
    await checkSources(ctx, job.caseId, job.userId, items);
    const sources = [];
    for (const sourceId of new Set(
      sourceSelections(items).map((i) => i.sourceId),
    )) {
      const id = ctx.db.normalizeId("exhibitSources", sourceId)!;
      sources.push((await ctx.db.get(id))!);
    }
    return { job, sources };
  },
});
/** Read the publication pointer and delete only unreferenced attempt outputs in one transaction. */
export const cleanupOutput = internalMutation({
  args: {
    id: v.id("exhibitCandidates"),
    storageId: v.optional(v.id("_storage")),
    indexStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (args.storageId && job?.storageId !== args.storageId)
      await ctx.storage.delete(args.storageId);
    if (args.indexStorageId && job?.indexStorageId !== args.indexStorageId)
      await ctx.storage.delete(args.indexStorageId);
  },
});
export const claim = internalMutation({
  args: { id: v.id("exhibitCandidates") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (!r || r.status !== "queued") return null;
    const leaseUntil = Date.now() + 6 * 60 * 1000;
    await ctx.db.patch(id, {
      status: "generating",
      attempts: r.attempts + 1,
      leaseUntil,
      stage: "Resolving sources",
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(6 * 60 * 1000, internal.exhibitStudio.expire, {
      id,
    });
    return r.attempts + 1;
  },
});
export const heartbeat = internalMutation({
  args: {
    id: v.id("exhibitCandidates"),
    attempt: v.number(),
    stage: v.string(),
  },
  handler: async (ctx, { id, attempt, stage }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "generating" || job.attempts !== attempt)
      return false;
    await ctx.db.patch(id, {
      stage: stage.slice(0, 100),
      leaseUntil: Date.now() + 6 * 60 * 1000,
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("exhibitCandidates"),
    attempt: v.number(),
    storageId: v.id("_storage"),
    sha256: v.string(),
    manifestHash: v.string(),
    manifestJson: v.string(),
    indexStorageId: v.id("_storage"),
    indexSha256: v.string(),
    reportJson: v.string(),
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.id);
    if (!r || r.status !== "generating" || r.attempts !== args.attempt)
      return false;
    await validateCaseOwnership(ctx, r.caseId, r.userId);
    await checkSources(
      ctx,
      r.caseId,
      r.userId,
      parseItems(JSON.parse(r.itemsJson)),
    );
    const report = JSON.parse(args.reportJson) as {
      sources: { id: string; sha256: string }[];
    };
    const expected = new Set(
      sourceSelections(parseItems(JSON.parse(r.itemsJson))).map(
        (s) => s.sourceId,
      ),
    );
    if (
      report.sources.length !== expected.size ||
      report.sources.some(
        (s) => !expected.has(s.id) || !/^[a-f0-9]{64}$/.test(s.sha256),
      )
    )
      throw new Error("PACKET_INVENTORY_MISMATCH");
    for (const entry of report.sources) {
      const sourceId = ctx.db.normalizeId("exhibitSources", entry.id)!;
      const source = await ctx.db.get(sourceId);
      if (!source) throw new Error("SOURCE_UNAVAILABLE");
      if (source.sha256 && normalizeSha256(source.sha256) !== entry.sha256)
        throw new Error("SOURCE_VERSION_CHANGED");
      if (!source.sha256)
        await ctx.db.patch(sourceId, { sha256: entry.sha256 });
    }
    const { id, attempt: _, ...data } = args;
    await ctx.db.patch(id, {
      ...data,
      status: "ready",
      stage: "Ready for review",
      leaseUntil: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const fail = internalMutation({
  args: {
    id: v.id("exhibitCandidates"),
    attempt: v.number(),
    message: v.string(),
    retryable: v.boolean(),
  },
  handler: async (ctx, { id, attempt, message, retryable }) => {
    const r = await ctx.db.get(id);
    if (!r || r.status !== "generating" || r.attempts !== attempt) return;
    const retry = retryable && r.attempts < 3;
    await ctx.db.patch(id, {
      status: retry ? "queued" : "failed",
      stage: retry ? "Retry scheduled" : "Failed",
      leaseUntil: undefined,
      error: message.slice(0, 600),
      updatedAt: Date.now(),
    });
    if (retry)
      await ctx.scheduler.runAfter(
        5000 * r.attempts,
        internal.exhibitWorker.generate,
        { id },
      );
  },
});
export const expire = internalMutation({
  args: { id: v.id("exhibitCandidates") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (!r || !["queued", "generating"].includes(r.status)) return;
    const expiry = r.leaseUntil ?? r.updatedAt + 6 * 60 * 1000;
    if (expiry > Date.now()) {
      await ctx.scheduler.runAfter(
        expiry - Date.now(),
        internal.exhibitStudio.expire,
        { id },
      );
      return;
    }
    const retry = r.attempts < 3;
    await ctx.db.patch(id, {
      status: retry ? "queued" : "failed",
      leaseUntil: undefined,
      stage: retry ? "Recovering interrupted worker" : "Failed",
      error: retry
        ? undefined
        : "Generation timed out after three attempts. Your draft is intact.",
      updatedAt: Date.now(),
    });
    if (retry)
      await ctx.scheduler.runAfter(0, internal.exhibitWorker.generate, { id });
  },
});
