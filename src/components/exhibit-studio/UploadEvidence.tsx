"use client";
import { useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  uploadFileForConversation,
  recoverPendingChatUploadAttaches,
} from "@/lib/chat/uploadClient";
import { EXHIBIT_LIMITS } from "../../../shared/exhibits";
export function UploadEvidence({
  caseId,
  onReady,
}: {
  caseId: Id<"cases">;
  onReady: (ids: Id<"exhibitSources">[], names: string[]) => void;
}) {
  const convex = useConvex(),
    importSources = useMutation(api.exhibitStudio.importSources);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <label className="block text-xs">
        Upload original evidence
        <input
          className="mt-2 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-amber-200 file:p-2 file:text-slate-900"
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          disabled={busy}
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            if (
              files.length > 10 ||
              files.some((f) => f.size > EXHIBIT_LIMITS.sourceBytes)
            ) {
              setError("Choose up to 10 files, each no larger than 30 MB.");
              return;
            }
            setBusy(true);
            setError("");
            const uploaded: Id<"uploadedFiles">[] = [];
            try {
              await recoverPendingChatUploadAttaches(convex);
              for (const [index, file] of files.entries()) {
                const result = await uploadFileForConversation({
                  convex,
                  file,
                  caseId,
                  intent: "attachment",
                  clientUploadKey: crypto.randomUUID(),
                  onProgress: (progress) =>
                    setStatus(
                      `File ${index + 1} of ${files.length}: ${progress}% uploaded`,
                    ),
                  onStatus: (state) =>
                    setStatus(
                      `File ${index + 1} of ${files.length}: ${state.replaceAll("_", " ")}`,
                    ),
                });
                uploaded.push(result.uploadedFileId as Id<"uploadedFiles">);
              }
              const sources = await importSources({
                caseId,
                fileIds: uploaded,
                timelineIds: [],
                noteIds: [],
              });
              onReady(
                sources,
                files.map((f) => f.name),
              );
              setStatus(`Added ${sources.length} sources to this draft.`);
            } catch (err) {
              setError(
                `${String(err instanceof Error ? err.message : err)} ${uploaded.length ? `${uploaded.length} completed uploads remain in case evidence. No items from this batch were added to the draft.` : ""}`,
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="text-xs text-slate-400">
        PDF, PNG, JPEG, or WhatsApp text exports. Structured message JSON can be
        saved as a .txt file. Originals use Nexproof’s existing upload and
        processing service.
      </p>
      {status && (
        <p role="status" className="text-xs">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
