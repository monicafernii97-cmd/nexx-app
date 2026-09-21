# Exhibit Studio extensions: implementation and acceptance contract

Status: implementation in progress. Baseline is production commit `6f1ce36` (PR #290). This document supplements specification 19; it does not mark unimplemented features complete.

## Implementation evidence — September 21, 2026

The first implementation increment includes working individual-exhibit PDFs, bounded volumes, ZIP and manifest delivery, authorized download routes, queued delivery jobs with cancellation/recovery, case-wide Bates series/reservations/ledger, editable voice dictation, and atomic assistant proposal acceptance/rejection with undo and stale-revision protection.

Verified in the isolated development checkout:

- 26 packet tests pass, including individual membership, complete volume coverage, local link destinations, no hidden copied page objects, parent checksum preservation, split policy and exact-count Bates allocation. Blank original PDF pages are retained.
- Seven live backend checks pass: concurrent disjoint allocations; committed reservations; retry reuse and cancelled gaps; idempotent real delivery with unchanged master; unauthorized download rejection; cancellation/expired-lease recovery/stale-worker fencing; proposal decision/undo/stale protection. Synthetic fixtures are removed afterward.
- Signed-in browser journey passes for real upload, shared-series creation, candidate review/finalization, ZIP/individual/volume downloads, transcript correction and insertion. Microphone transport is mocked for repeatable controls testing. Separately, synthetic speech generated through the existing authenticated service was transcribed by the real provider and checked for expected content.
- TypeScript and targeted ESLint pass. A rendered volume index was inspected for legible labels, continuation status and master/local page distinctions.

Production is unchanged by these development checks. Hosted preview/CI and release gates must be recorded before this increment is called production-ready.

Still outstanding after this increment: durable prepared-asset caches; typed source-citation links and validation; persistent panel/tab preferences; source-to-current-timeline navigation; broader mixed-source/concurrent performance profiling. The proposal decision lifecycle is implemented, while richer citations remain a separate task. No claim is made that the entire supplemental specification is complete.

## Scope and sequence

1. Delivery: individual exhibit PDFs, bounded volumes, ZIP bundles and a downloadable manifest.
2. Case-wide Bates series with transactional reservations, retry reuse and permanent gap accounting.
3. Voice dictation into the existing scoped assistant, with editable transcript and explicit Send.
4. Durable prepared-asset reuse, structured assistant citations and proposal decisions, saved Studio preferences and timeline navigation.

Every increment must include server authorization, actual UI controls, useful failure messages, regression tests and authenticated browser verification. Production release remains a separate gate after implementation and staging verification.

## Delivery from immutable versions

Only a finalized, accessible packet can be packaged. Delivery never re-extracts originals, reruns AI or changes finalized bytes. The master PDF remains available unchanged. Each delivery stores its parent candidate ID and SHA-256, normalized settings, artifact hashes, page mappings and renderer version.

Modes:

- **Individual exhibits:** one PDF per exhibit containing all its cover and evidence pages. Exhibit labels and Bates values remain those of the finalized master. Each PDF has a delivery index explaining master versus local pagination and links/bookmarks targeting that PDF only.
- **Volumes:** partition the complete master page sequence into PDFs with a configured physical-page limit, including each volume's generated index. Prefer exhibit boundaries. If one exhibit exceeds a volume, split only when explicitly allowed and label continuation segments. Do not silently omit front matter or evidence. All master pages occur exactly once across the volumes.
- **ZIP:** include the unchanged master, master index, selected individual/volume PDFs, `manifest.json`, and a concise README explaining labels and page coordinates. No raw unredacted originals are added implicitly. Filenames are deterministic, collision-safe, path-safe and limited in length.

The default volume limit is 100 pages; accepted range is 10–500. Delivery remains subject to existing 500-master-page and 100-exhibit limits. Reject an archive exceeding its configured byte budget before publication. A delivery request is idempotent for one user operation ID; simultaneous duplicate requests cannot create competing published results.

Delivery jobs have queued/running/ready/failed/cancelled states, persisted progress, attempt fencing, heartbeat leases and bounded transient retries. A disconnect does not cancel processing. Final publication rechecks actor/case access, parent finalized state and parent hash. Cleanup checks published artifact references before deleting storage. Downloads use authenticated no-store routes, never permanent public links.

Manifest schema: delivery version, parent packet hash and manifest hash; mode/options; artifact filename/MIME/hash/size; local page count; ordered local-page→master-page/exhibit/Bates mappings; source packet exhibit ranges; continuation status; creation time. A manifest does not independently establish authenticity or admissibility. Its purpose is inventory, reproducibility and integrity checking.

Acceptance: reconstruct all master page mappings across volumes with no gaps/duplicates; individual selection excludes other exhibits; all links resolve locally; extracted evidence text and Bates match master; long/unusual labels cannot escape ZIP paths or collide; unauthorized downloads fail; retry/cancellation cannot publish stale output; downloaded bytes match stored hashes; master hash is unchanged.

## Shared Bates series

Scope is one owner and case. “Global” means across packets in that case's selected series, not across all customers. A series has immutable prefix/padding, an initial next number, a display name, revision and an archived flag. Users choose packet-local numbering or a saved series. Existing packet-local drafts keep their behavior.

After composition has determined the exact eligible physical-page count, a single database transaction reserves `[start,end]` and advances the series counter. Reservation is unique per candidate, includes count and series configuration, and is never reused by a different candidate. Concurrent candidates must receive disjoint ranges. A retry of the same candidate reuses its reservation only if count/configuration agree; otherwise block rather than renumber silently.

Candidate generation uses the reserved start before stamping. Report and manifest record series and reservation identity. Finalization commits the reservation alongside the candidate. Cancellation or terminal failure marks the range void; it never decrements the counter. Voided gaps are visible in the series ledger. Preview regeneration creates a new candidate and a new range; the UI explains this before generation. Delivery of an existing version preserves its existing values and allocates nothing.

Acceptance: concurrent allocation; retry identity; zero eligible pages; exhaustion/unsafe integer rejection; archived/cross-case series rejection; cancellation after allocation; terminal worker failure; finalized ledger and PDF agreement; delivery does not advance series; legacy settings still parse.

## Voice input

Reuse the authenticated transcription endpoint. Voice is an alternative input method for the same Studio assistant and typed tool boundary. Request microphone permission only after a user presses Record. Show recording state, elapsed time, Stop and Cancel. Bound recordings to two minutes and 10 MB. Stop microphone tracks on stop, cancellation, scope change, unmount and errors.

The returned transcript appears in an editable review field. The user inserts or replaces assistant input explicitly, then presses Send. Transcription never sends a message or changes evidence automatically. Transcription failures preserve typed text and offer retry; unsupported browsers retain normal text input. Do not persist raw audio to evidence storage. No autoplay or spoken confirmation of sensitive exhibit content.

Acceptance: start/stop/cancel cleanup; unsupported API/permission denial; size/time limits; delayed result after scope change discarded; corrected transcript reaches existing assistant path; recording alone causes no mutation; existing review/finalization rules cannot be bypassed. Browser fixtures may mock microphone/transcription transport; distinguish those from a real provider test.

## Prepared assets and retry reuse

Cache only generated derivatives under the user/case and candidate identity. Key includes immutable source hash, typed selection, extraction anchor content, redaction/crop instructions and renderer version. Cached assets must pass stored checksum validation before reuse. Source ownership and availability are rechecked even on a hit. Raw unredacted originals must not be substituted for redacted derivatives.

Persist prepared PDF/image asset pointers as each item finishes; retries reuse completed items. Cancelled/failed job caches expire through bounded cleanup, while published artifact pointers are protected. Record hit/miss counts without source text. Tests inject interruption after the first prepared asset and verify reuse and identical evidence; changed selectors/hash/version cause misses; cross-case lookups cannot retrieve entries.

## Assistant proposals, citations and preferences

Assistant suggestions carry typed references to the selected source: original page, message ID, or pinned text anchor. Validate references against the authorized selection; unknown targets are rejected. Show “source unavailable” rather than fabricating a link. Citation navigation opens the appropriate source/selection. AI summaries remain marked commentary.

Each metadata proposal stores proposed fields, source references, base collection revision, target exhibit and pending/accepted/rejected decision. Applying checks current revision and summary lock, records an undoable operation and marks accepted atomically. Reject changes no exhibit metadata. A stale proposal must be regenerated; it cannot overwrite newer user work. Assistant history remains scoped to its collection and exhibit.

Save user preferences for visible panels and preview tab separately from packet settings. They never affect packet hashes or evidence selection. Validate preference values, provide sensible defaults and restore on refresh. Timeline snapshots retain event IDs as origin references; navigation may open the current event but must distinguish that from the frozen snapshot. Missing/deleted events do not rewrite or invalidate a finalized snapshot.

## Release gate and evidence

Use the existing packet fixtures, 100-exhibit/500-page fixture and approved synthetic robot. Add focused unit/integration tests for every contract above. Inspect rendered individual/volume covers, local indices, continuation pages and last pages. Verify real authenticated generation/download flows on a hosted preview and cleanup all synthetic records. Record any mocked provider behavior explicitly. Run TypeScript, lint, regression tests and production build before publishing. No new control ships as a placeholder.

Rollback must disable new extension generation without removing core packet download access or finalized deliveries. Never reclaim Bates reservations during rollback. Existing packet settings/manifests remain readable without migration or fabricated provenance.
