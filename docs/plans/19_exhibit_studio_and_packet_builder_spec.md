# Nexproof Exhibit Studio and Professional Packet Builder

**Product and engineering specification — version 1.0**  
**Date:** September 21, 2026  
**Status:** Build specification; capabilities described here are requirements, not claims of existing functionality.  
**Baseline:** [Exhibit builder code audit](./18_exhibit_packet_builder_audit.md). Recheck integration points against the implementation branch before editing.  
**Scope:** Original evidence, timeline documents, excerpts, exhibit collections, contextual assistance, professional packet generation, and saved releases.

## 1. Product objective

Enable a user to take evidence already in Nexproof or newly uploaded, understand and select the relevant material, organize it into reusable exhibits and classified collections, and produce a complete, professionally presented PDF packet with reliable source references, indexing, labeling, and numbering.

The same system must produce a master exhibit packet, a shorter independent exhibit, a collection-specific packet, or a group of exhibits selected from an existing packet. A user must be able to complete the workflow through direct controls, conversation with the assistant, or a combination of both.

“Executive-level professionalism” means accurate and complete evidence, disciplined organization, readable document design, precise navigation, consistent terminology, visible revision status, and reliable delivery. A polished cover cannot compensate for missing or misrepresented source material.

### 1.1 Required outcomes

| ID | Requirement |
|---|---|
| OBJ-01 | Assemble actual source pages and images rather than replacing evidence with generated prose. |
| OBJ-02 | Turn complete or selected recorded timelines into downloadable PDFs that can also become exhibits. |
| OBJ-03 | Select messages, conversations, pages, and image regions as traceable excerpts. |
| OBJ-04 | Provide packet cover letters, exhibit cover sheets, excerpt summaries, and source selections as distinct artifacts. |
| OBJ-05 | Organize by dates, conversations, classifications, issues, witnesses, sources, or manual order. |
| OBJ-06 | Add one or many evidence pieces to a new or existing collection from every relevant evidence surface. |
| OBJ-07 | Support master packets and independent subsets without altering previously finalized packets. |
| OBJ-08 | Support configurable labels, including `A1`, `A-1`, and segmented forms such as `R2-R-MED-1`. |
| OBJ-09 | Generate indexes, actual page ranges, Bates identifiers, links, and bookmarks from final physical pages. |
| OBJ-10 | Provide a contextual Exhibit Studio assistant that can perform authorized, reversible workflow actions. |
| OBJ-11 | Save drafts, revisions, review decisions, source provenance, and immutable finalized artifacts. |
| OBJ-12 | Validate the exact downloadable artifact and make missing or unsupported evidence explicit. |

### 1.2 Scope boundaries

This release does not automatically file documents, send packets to recipients, determine admissibility, authenticate a source's truth, or certify compliance with every court. A “filing” template is a formatting choice with a specific supported profile, not a general legal certification.

Typed assistant conversation and direct controls are core requirements. Voice input is a follow-on capability using the same actions and review rules; core completion must not depend on a voice provider. Audio/video originals can be cataloged with explicit unsupported-to-PDF status before transcript/clip support ships. Their actual playable media must never be represented as embedded PDF evidence when only a transcript is included.

## 2. Non-negotiable system invariants

1. Originals are immutable. Excerpts, highlights, OCR, redactions, and conversions are separately identified derivatives.
2. Every excerpt identifies an exact source version and location. An AI quotation is not a source locator.
3. Every packet is assembled from a frozen, approved selection of evidence and settings.
4. A user-approved selection controls inclusion. Classification or relevance scoring cannot silently add or remove evidence.
5. Each output page has an explicit role and mapping. A generated section is not assumed to occupy one page.
6. An issued version never changes. Editing its collection or sources creates a new draft/version.
7. Summaries, classifications, timelines, and allegations remain distinguishable from original evidence.
8. Packet-wide labels, page numbering, and Bates stamping are deterministic application operations.
9. The preview approved for finalization and the downloadable final artifact have the same bytes and checksum.
10. Source and destination permissions are checked server-side for every operation, including background work and downloads.
11. A missing required source blocks the packet. No successful-looking partial output.
12. Changes to content, selection, layout, numbering, or redaction invalidate approval of the affected packet candidate.

## 3. Domain model and vocabulary

| Entity | Meaning | Example |
|---|---|---|
| Evidence source | Original uploaded file or recorded source object | Complete message-history PDF |
| Source version | Immutable bytes or immutable structured snapshot | Original PDF with recorded hash |
| Derived asset | A conversion or annotation of a pinned source version | Highlighted crop, redacted PDF, OCR layer |
| Excerpt | Exact selection of source material | Messages 41–46, source pages 18–19 |
| Exhibit | Named, ordered bundle of sources/excerpts with an optional cover | March 12 appointment conversation |
| Classification | User-defined or suggested category with supporting evidence | Disparaging, profane, or hostile language |
| Collection | Ordered membership of reusable evidence/exhibits for a purpose | Medical communications |
| Packet draft | Editable output composition and settings | Master packet draft |
| Packet version | Immutable published artifact and manifest snapshot | Master packet, version 3 |
| Manifest | Machine-readable inventory, source references, and assembly instructions | Exhibit order, selected pages, settings, hashes |
| Page map | Final mapping between physical pages and source/exhibit locations | PDF page 9 → Exhibit A-2 → source page 19 |

### 3.1 Identity versus labels

Each source, excerpt, exhibit, and collection has a permanent internal ID. Human-readable exhibit labels belong to a packet composition. An exhibit can be `A-2` in the master packet and `MED-1` in an independent medical packet while retaining the same permanent exhibit ID.

For user-facing cross-references, retain the master packet label and version when deriving a subset. Never use display labels as database keys or as the only relationship between covers and source pages.

### 3.2 Membership rules

- An exhibit can contain multiple sources and excerpts in an explicit order.
- A collection can contain existing exhibits or evidence selections awaiting exhibit assembly.
- Membership references reusable entities; it does not duplicate original bytes.
- Membership-specific titles, classifications, and notes are permitted and do not overwrite the shared exhibit's default metadata.
- Editing shared exhibit metadata shows affected draft collections; changing finalized versions is prohibited.
- Initial release allows one level of collection grouping. Packet drafts can include multiple groups; arbitrary recursive collection nesting is out of scope.
- Identical excerpts in different collections are allowed. Identical memberships within one collection are deduplicated unless the user explicitly chooses a repeated occurrence.
- Two overlapping excerpts are not automatically merged; show the overlap and let the user combine or retain them.

## 4. Information architecture and Studio layout

Keep `/docuvault/exhibits` as the entry point. It becomes the Exhibit Studio home with **Evidence**, **Collections**, and **Packets** views. Proposed deep links:

```text
/docuvault/exhibits/evidence/:sourceId
/docuvault/exhibits/collections/:collectionId
/docuvault/exhibits/studio/:exhibitId
/docuvault/exhibits/packets/:packetId
/docuvault/exhibits/packets/:packetId/versions/:versionId
```

### 4.1 Desktop workspace

| Area | Required behavior |
|---|---|
| Persistent header | Case, current object name, draft/version status, save state, active assistant scope |
| Left organizer | Search/filter, selected count, collection/exhibit tree, reorder controls, source readiness badges |
| Center preview | Original source, excerpt composition, exhibit cover, or final packet; zoom, page navigation and selection |
| Right panel | Assistant conversation plus structured inspector tabs for metadata, selection, cover, and classification |
| Bottom/status area | Operation progress, unresolved items, undo, and source/packet page position |

Panel widths are adjustable and saved per user. Collapsing the assistant expands the preview. Selecting a source or exhibit updates the inspector without discarding unsaved edits or a pending action.

Preview tabs: **Original**, **Excerpt**, **Cover**, **Packet** where applicable. Side-by-side original/excerpt comparison is available. Packet preview must identify provisional versus final pagination.

### 4.2 Responsive and accessible behavior

On smaller screens, organizer, preview, and assistant become separate views with a persistent selection count and return path. Complex redaction and layout editing may use a focused full-screen mode, but browsing, collection membership, metadata editing, and downloading remain available.

All selection, ordering, and packet configuration must work by keyboard. Provide move up/down and move-to-position alternatives to drag-and-drop. Use labeled controls, visible focus, accessible status announcements, and sufficient contrast. Classification must not be conveyed by color alone. PDF thumbnails need useful accessible names and a searchable text alternative when available.

## 5. Evidence intake and source readiness

### 5.1 Entry points

Evidence can enter from uploads, DocuVault, a chat attachment, an existing evidence item, an exhibit/packet, or the timeline feature. Existing files must be reused by ID when authorized; do not require re-uploading a file Nexproof already stores.

Core packet formats: PDF and raster images supported by the verified conversion pipeline. Office documents require a separately tested conversion adapter. Unsupported formats remain visible with a specific explanation and conversion action; they cannot be silently omitted.

### 5.2 Required source metadata

Store original filename, media type, byte size, original-byte hash, owner/access scope, case association, upload time, source date/date range when known, source version, storage reference, page/dimension metadata, extraction/conversion status, and provenance origin.

Keep document event dates separate from upload dates. Date provenance is one of `source_recorded`, `user_entered`, `inferred`, or `unknown`. Preserve time zone and precision, including date-only and approximate dates. Do not invent midnight or a sender time zone when absent.

### 5.3 Readiness states

`uploaded → inspecting → preparing → ready`, with `needs_input`, `unsupported`, and `failed` alternatives. A source may be ready for original-page assembly while OCR remains unavailable. Distinguish **Can include original** from **Can search/select extracted text**.

Inspection includes MIME/actual file validation, page count, encryption/password condition, conversion feasibility, image orientation, and file availability. For encrypted sources, request an authorized unlocked copy or a supported secure unlock flow; never retain passwords in manifests or chat logs.

Duplicate matching uses original-byte hashes scoped to authorized data. Duplicate discovery must not reveal another user's files. Offer to reuse the known source; keep differing uploads when their provenance is meaningful.

## 6. Add to collection: single and bulk workflow

### 6.1 Availability

Show **Add to collection** on evidence cards, screenshot/document viewers, excerpt selections, timeline export results, exhibit menus, packet exhibit rows, and multi-select toolbars.

### 6.2 Action sheet

Required inputs and controls:

1. Selected items summary: count, titles, source type, and whole-source versus excerpt status.
2. Destination: **New collection** or searchable **Existing collection**, within the active case by default.
3. New collection fields: name required; description, purpose, and initial classification optional.
4. Assembly behavior: **Keep items separate** by default; **Combine as one exhibit** as an explicit option. Existing exhibits retain their composition unless regrouping is chosen.
5. Metadata: preserve source dates, references, and existing descriptions; allow collection-specific classifications.
6. On success: show added/already-present counts and **Open collection** / **Undo**.

The user can add a whole source now and select excerpts later. Unready sources become visibly pending collection members and prevent finalization only if still selected for output.

### 6.3 Batch correctness

Each request carries a client operation ID and target collection revision. Prevalidate all selected items and permissions. Default behavior is all-or-nothing; if some are invalid, explain which items need attention and let the user explicitly submit a valid subset. Never report full success after adding only some requested items.

Large batches are staged server-side and become visible as one committed membership revision after validation. Repeating the operation ID returns the same result. Undo removes memberships introduced by that operation, not memberships that existed beforehand; detect subsequent edits before undoing.

### 6.4 Selecting from existing packets

Selection references the exhibit/source versions used in that packet. Finalized source packet content is unchanged. For legacy PDFs without source manifests, treat the PDF as a new source and let the user select its pages; do not fabricate original-source relationships.

## 7. Excerpt selection and source preservation

### 7.1 Supported selection types

| Type | Selector contract | Output behavior |
|---|---|---|
| PDF pages | Ordered 1-based page ranges | Preserve actual selected pages |
| PDF/image region | Source page plus normalized rectangle and rotation transform | Render a clearly identified crop with source locator |
| Structured messages | Stable message IDs and conversation ID | Render exact messages with participants and timestamps |
| OCR/text passage | Text-generation ID, character span, source page and bounding boxes | Show matching source region; OCR is auxiliary text |
| Timeline events | Event IDs and event revisions | Generate an identified timeline snapshot document |
| Media segment, later phase | Start/end milliseconds and transcript version | Transcript/still derivative with original media reference |

Normalize rectangle coordinates to the unrotated source page, values from 0 to 1. Store the display-to-source transform so changing zoom or rotation does not move the crop. Preserve the selected region and the full source page reference.

### 7.2 Conversation handling

Import or identify participants, message ordering, timestamps, attachments, and conversation boundaries where the source supports them. Treat uncertain sender attribution and OCR timestamps as unresolved metadata, not established facts.

Conversation grouping defaults to source-provided threads. When absent, allow user-defined grouping or an explicitly labeled suggestion based on configurable gaps and participants. Do not silently use an arbitrary time-gap rule as authoritative conversation identity.

Controls must include select message(s), select conversation, date-range filter, include previous/next messages, include attachment(s), and show full context. Noncontiguous selections show visible omission separators. Reordering conversations is allowed; within-conversation message order remains chronological/source order unless a separately labeled presentation is intentionally created.

### 7.3 Excerpt fidelity

- Exact quotations preserve punctuation and wording. Ellipses mark omissions rather than appearing as source text.
- OCR corrections are tracked and labeled; a transcription correction never edits the underlying image.
- Generated summaries are outside the reproduced source region.
- Highlights are non-destructive and distinguishable from original markings.
- Crops carry source filename or display title, source page/location, and excerpt date where known.
- A user can include adjacent context, a full-page companion, or the full conversation as an appendix.
- Cropped presentation must not imply it is a complete page or conversation.

## 8. Classification, grouping, and focused collections

### 8.1 Classification record

A classification has a stable ID, case scope, display name, optional short code, definition, optional color, creator, and revision. Suggested classifications additionally record rationale, supporting excerpt IDs, and status: `suggested`, `accepted`, `rejected`, or `needs_review`.

Example: name **Disparaging, profane, or hostile language**, short code **LANG**, with individual excerpt assignments supporting the category. Allow narrower subcategories as tags without forcing a deep folder hierarchy.

Multiple classifications may apply to one excerpt. AI suggestions must cite the actual relevant source selection and distinguish observed words from interpretation. Do not generate diagnoses or assert intent as an observed fact. User-authored labels remain attributed to the user.

### 8.2 Grouping modes

Manual order, date/date range, conversation, classification, witness/participant, and source. Missing dates appear in an **Undated** group, not an invented chronological position. Ties use stable source/selection order. Unknown participants receive a visible unresolved status.

Use structured participant/source fields for grouping; never parse display descriptions or internal IDs to recover grouping data. Turning off printed metadata cannot alter grouping membership.

### 8.3 Focused packet

From a classification or collection, choose **Build packet**. The draft includes exactly the selected matching items, a collection title/description, an optional cover letter, a focused index of moments with dates, and source excerpts.

If an exhibit contains several classifications, provide **Include matching excerpts only** or **Include complete exhibits**. Show which source material each choice adds. Collections are explicit saved memberships in the initial release; saved dynamic filters may suggest new matches later but cannot silently change a saved packet.

## 9. Timeline document integration

The timeline feature exposes **Download PDF**, **Add to collection**, and **Use in packet**. Users select all events, a date range, a classification, or explicit events and choose a table or narrative chronology template.

The generated document includes title, covered date range, event dates and descriptions, supporting source references, optional classifications, and a generation/version label. Distinguish user-reported events, source-supported entries, and inferred dates in a readable legend or status column.

Store a snapshot of selected event IDs, revisions, text, dates, source references, and rendering settings. Later timeline edits show **New timeline changes available** on drafts; they never mutate an issued timeline PDF.

The standalone PDF must work without a packet. When included in a packet, source references can additionally resolve to packet exhibit labels and page destinations. If no matching evidence is included, retain a plain source reference without a broken hyperlink. Detect circular references: a timeline document cannot recursively include a packet that includes that same generated document.

## 10. Cover letters, covers, and summaries

### 10.1 Separate document types

| Type | Purpose | Default content |
|---|---|---|
| Packet title sheet | Identify the overall collection | Title, case/matter display, preparer if supplied, date, version |
| Packet cover letter | Explain purpose and scope | Intended recipient if supplied, scope, date coverage, organization, enclosure summary |
| Collection introduction | Explain one group | Group title, short description, date range, exhibit count |
| Exhibit cover sheet | Identify one exhibit | Label, title, source/participants, dates, optional summary |
| Excerpt summary | Describe one selected moment | Date, concise factual summary, exact cited excerpt location |

Recipients, case details, preparer identities, and signatures are never invented. Missing optional fields are omitted cleanly; missing required template fields are shown as actionable input requests before finalization.

### 10.2 Drafting behavior

AI drafting is optional. Every document type has a usable deterministic metadata template if AI is unavailable. Turning summaries off must not turn covers off. There is no silent 20-cover limit.

User instructions such as “explain the appointment discussion” guide emphasis, but summaries must remain grounded in selected source material. Store summary claims with supporting excerpt IDs. Show AI-generated text as a draft in the Studio until reviewed. Direct quotes and paraphrases are visually distinguishable.

Generated summaries can be edited and locked. Regeneration preserves locked text. The system reports which fields would change before replacing existing user edits. Default exhibit summary target is 1–3 sentences; users can expand it, with layout overflow handled explicitly.

## 11. Labeling, page numbers, and Bates policy

### 11.1 Label schemes

Presets: alphabetic (`A`, `B`, `AA`); numeric (`1`, `2`); hierarchical (`A-1`, `A-2`); compact hierarchical (`A1`, `A2`); party/purpose prefix; and custom segmented labels.

Custom segmented example:

```text
{packetCode}-{partyCode}-{groupCode}-{sequence}
R2-R-MED-1
```

The user defines segment meanings. Do not assume what `R2` or `R` means. Required settings: prefix segments, separator, sequence start, padding, sequence scope (packet/group), and case style. No executable expressions or arbitrary code in patterns.

Validate normalized uniqueness, blank segments, collisions with preserved labels, numeric bounds, and print length. Store the raw identifier separately from the displayed `Exhibit` prefix so output cannot become `EXHIBIT EXHIBIT A`.

### 11.2 Master/subpacket policy

On creating a subset, choose **Preserve master labels** (default) or **Relabel this packet**. Preserve the origin packet version and label either way. Independent exports with relabeling include an optional crosswalk such as `MED-1 → Master v3, A-2`.

Removing an exhibit from a draft may offer renumbering. Finalized labels never renumber in place. Amendments explicitly choose continued labels, inserted suffix labels, or a new edition with a crosswalk.

### 11.3 Page identities

The page map stores five separate concepts: physical PDF page, displayed packet page label, exhibit-local page number, original source page/location, and Bates identifier. Physical pages are zero-based internally; user-visible page positions are one-based or the configured display label.

### 11.4 Bates settings

Enable/disable; prefix; start integer; zero-padding width; placement; font size; numbering scope; and inclusion of title sheet, cover letter, index, group dividers, exhibit covers, and source pages.

Default: Bates disabled until selected. When enabled, source pages are included by default; front matter/covers are excluded unless selected. Ordinary packet page numbers still cover physical pages according to the packet numbering policy. Show a sample and predicted eligible-page count.

Apply Bates only after final page composition. Never calculate it from an HTML section count. Existing source Bates markings are retained; a new packet stamp is a separate field and must not obscure them. Offer a reviewed alternate placement or margin expansion where collisions occur.

If production-wide uniqueness is enabled, reserve ranges transactionally after eligible-page counts are known. Reserved but failed/cancelled ranges are marked void and remain auditable; do not silently reuse potentially distributed identifiers. Ordinary per-packet numbering does not require global reservation.

## 12. Master packets, subsets, and output modes

Required modes:

- **Master packet:** selected collections/exhibits with comprehensive index and optional group divisions.
- **Collection packet:** one focused group, with only the selected members.
- **Independent exhibit:** one exhibit with optional cover and source pages.
- **Custom subset:** user-selected exhibits/excerpts across authorized collections.
- **Index only:** index generated from a pinned packet candidate/version, including its actual ranges; without a built candidate, produce a clearly labeled inventory with no invented page ranges.
- **Packet without index:** same evidence assembly with index disabled.

Delivery can be a merged PDF, individual exhibit PDFs, or a ZIP of selected outputs. Separate outputs and volume splitting may ship in the scale phase, but their controls remain hidden until implemented.

Default packet order:

```text
Title sheet (optional)
Cover letter (optional)
Master index (optional, one or more pages)
Timeline chronology (optional)
Group introduction/divider (optional)
  Exhibit cover
  Excerpt note/summary (optional)
  Selected source pages/regions in approved order
  Next exhibit cover and source pages
Next group
Appendices/context documents (optional)
```

No layout layer may regroup all covers or all images after assembly. Repeated evidence in a packet requires an explicit choice: include again, include once and cross-reference, or remove duplicate. Cross-reference-only entries must identify their actual destination.

## 13. Indexes and navigation

Default index columns: exhibit label, description, date/date range, and packet page range. Optional columns: participants/source, classification, Bates range, master reference, and volume. Provide concise and detailed templates rather than squeezing every column onto one page.

Message-heavy exhibits can have an excerpt sub-index: moment/date, short summary, excerpt label, and page destination. Multi-page indexes repeat headers and preserve readable rows. Long descriptions wrap; they must not collide with page numbers.

Each index entry links to the defined exhibit start (cover if present; otherwise first evidence page). Store first evidence page separately so “Jump to source” works. Add PDF bookmarks for groups and exhibits, with optional excerpt children. Bookmark titles use approved display metadata, not database identifiers.

Navigation and displayed page ranges derive from the completed page map. Volume outputs include volume IDs and local page labels. Links in independently downloaded files must target that file's destinations; cross-file references use readable citations if a reliable link is unavailable.

## 14. Professional document design contract

Use restrained templates with consistent typography, hierarchy, margins, and page furniture. Offer an internal presentation template and separately maintained filing-oriented profiles. Branding is subtle and configurable; do not place large product branding over evidence.

Default design targets: readable 11–12 pt generated body text, clearly subordinate 9–10 pt metadata/stamps, high-contrast text, print-safe backgrounds, and sufficient margins for binding/numbering. These are product defaults, not asserted court rules. Paper size and margins remain template settings.

Preserve source aspect ratios and orientation. Never stretch images. Warn when fitting makes source text too small; offer original orientation, a full-page version, or split detail views. Reserve stamp space by adding a margin or fitting the source within a safe canvas, not painting over evidence.

Avoid stranded headings, accidental blank pages, clipped table rows, and unreadable index columns. Exhibit covers may occupy more than one page if intentionally permitted; counts and navigation must reflect this. Optional duplex blank pages are explicit page-map entries with a numbering policy.

Embed supported fonts and retain searchable source text where possible. Provide accessible generated text and document structure where the chosen PDF pipeline supports it; claim tagged-PDF accessibility only after verification, not merely because HTML was semantic.

## 15. Contextual assistant contract

### 15.1 One assistant, scoped work

Reuse the shared NEXX conversational infrastructure and authorization/tool contracts. Do not introduce a separate route-driven chatbot for every exhibit. Maintain scoped conversation references for source, exhibit, collection, and packet so users can return to prior decisions.

The scope indicator always shows the target object. A selected preview may provide context without authorizing edits to the whole packet. When a request's target is clear, act; when ambiguity would affect the wrong evidence, ask one narrow question.

### 15.2 Read versus action

The assistant can explain evidence, retrieve passages, suggest context, draft summaries, create excerpts, create/add collections, edit descriptions, propose grouping, reorder, configure labels, request previews, and start generation. The model does not directly write the database or compose final page numbers.

Every action passes a typed server tool with permissions, validated inputs, expected revision, and operation ID. Tool results include actual changes, resulting revision, warnings, and undo eligibility. The assistant reports completion only after the tool succeeds.

### 15.3 Action/review policy

| Action | Behavior |
|---|---|
| Explain/search/preview | Perform directly within authorized scope |
| Explicitly requested collection creation, membership addition, rename, or metadata edit | Apply with undo and visible result; no repeated generic confirmation |
| Suggested classification or excerpt not explicitly selected by user | Present source-linked proposal with selectable results |
| Requested bulk reorder/relabel of a draft | Show immediate change result and undo; make scope/count visible |
| Redaction | Prepare a derivative and require deliberate visual review before it is eligible for finalization |
| Original deletion, external sending, or filing | Separate explicit authorization; outside ordinary Studio assembly |
| Finalize candidate | Explicit action on the displayed validated candidate and revision |

### 15.4 Assistant context envelope

Include case/access scope, active object and revision, current selection, authorized source inventory, relevant retrieved source spans, current packet settings, unresolved readiness items, recent conversation, and compact prior decisions. Retrieve additional evidence on demand; do not send all case files on every turn.

Source documents are untrusted content, never instructions. Embedded commands in a PDF must not redirect tools or expose other evidence. Cross-case retrieval is denied unless a separate authorized cross-case feature is deliberately implemented.

### 15.5 Grounding and failure behavior

Every factual source answer links to a page/message/region. Preserve uncertainty for unreadable passages, unknown senders, and ambiguous dates. Classifications should explain what words/events support them. When AI is unavailable, manual selection, metadata covers, deterministic assembly, and downloads remain usable.

Use the shared configurable model policy rather than hard-coding new provider/model names in Studio components. Cache suggestions by source version, selection, task type, prompt version, and authorized scope. Track usage without logging raw evidence. AI must not rerun merely because the packet's page order changed.

### 15.6 Voice extension

Voice input produces a visible transcript and invokes the same typed actions. Misheard dates, labels, or names can be corrected before committing ambiguous selections. Voice is not treated as blanket approval for redaction or finalization. Do not retain audio by default without a separate product retention decision.

## 16. Review, approval, and version lifecycle

Separate the editable draft, generated candidate, and finalized version:

```text
Draft revision N
  → preflight
  → immutable generation snapshot N
  → candidate PDF + page map + validation report
  → review exact candidate
  → finalize candidate hash
  → immutable packet version
```

Generation uses a frozen revision while subsequent edits may create N+1. Show **Preview is for revision N; draft has newer changes**. Do not replace the candidate beneath the reviewer.

Approval records candidate hash, manifest hash, actor, time, and acknowledged review items. Finalization promotes the existing candidate bytes rather than rendering again. Downloads of a candidate before finalization are clearly identified in the UI/file name as drafts; do not add or remove a watermark after review without generating another candidate.

Finalized versions show title, version, generation date, exhibit/page counts, and validation status. **Edit as new version** creates a new draft. **Create collection from selection** reuses its pinned evidence references. Source changes trigger draft notices, never background edits to finalized versions.

## 17. Manifest and page-map specification

### 17.1 Frozen input manifest

Required fields: schema version; case and access scope; packet ID and draft revision; selected source/exhibit/collection revisions; explicit ordered groups/exhibits; complete selectors; metadata/cover text snapshots; classification assignments; layout/label/Bates settings; source and derivative hashes; template/renderer/conversion versions; timeline snapshot references; review requirements; and deterministic manifest hash.

Storage references are server-only. Do not place signed URLs, secrets, document passwords, or raw internal identifiers in visible PDFs. Hash canonical serialized inputs with stable key ordering; exclude transient timestamps/URLs from the generation identity unless they intentionally affect rendered content.

Example conceptual entry:

```json
{
  "exhibitId": "stable-exhibit-id",
  "exhibitRevision": 4,
  "label": "A-2",
  "title": "March 12 appointment conversation",
  "groupId": "medical-communications",
  "sources": [{
    "sourceVersionId": "immutable-source-version",
    "selection": { "kind": "pdf_pages", "pages": [18, 19] },
    "includeContext": false
  }],
  "cover": { "enabled": true, "summaryStatus": "reviewed" }
}
```

Example IDs are descriptive placeholders, not database formats. Exact production schemas must reject invalid unions and unknown executable fields.

### 17.2 Output page map

Each physical page records output artifact/volume ID, zero-based PDF page index, displayed page label, role, exhibit ID, group ID where applicable, exhibit-local page number, zero or more source mappings, Bates value if assigned, and bookmark/destination keys. A generated cover has no original source page; a composite excerpt page can map to several source regions.

Also store per-exhibit cover start, evidence start, last page, evidence-page count, full exhibit range, and Bates range(s). Multiple ranges are supported where policy or duplication prevents a single continuous range.

### 17.3 Reproducibility

Frozen manifest and pinned processors must reproduce the same ordered content and page mapping. Do not promise byte-identical regeneration across different PDF libraries/runtime versions. The issued artifact itself is stored immutably and verified by hash. A changed renderer creates a new candidate and requires review.

## 18. Persistence model

Proposed tables below may be adapted to repository conventions, but their responsibilities and relationships are mandatory. Reuse existing uploaded-file storage and document-memory extraction; do not fork those systems.

| Table/entity | Required fields and responsibilities |
|---|---|
| `evidenceSources` | Owner/org scope, caseId, origin type, uploadedFile/timeline reference, current source version, display metadata, archived status |
| `evidenceSourceVersions` | Immutable source reference/hash, MIME/bytes/pages, date provenance, readiness, extraction generation references |
| `evidenceDerivatives` | Source version, selector/transform hash, transform type, output storage/hash, processor version, redaction review status |
| `evidenceExcerpts` | Source version(s), selector, context policy, exact quotation/transcription reference, title, revision |
| `exhibits` + revision records | Title/default metadata, ordered source/excerpt references, reviewed summaries, revision |
| `evidenceClassifications` | Case, name, code, definition, provenance, revision |
| `classificationAssignments` | Target ID/version, classification ID, suggested/accepted status, supporting selectors, rationale |
| `exhibitCollections` | Case, name, purpose, description, revision, archive status |
| `exhibitCollectionItems` | Collection, member type/ID/revision policy, order key, membership overrides, operation origin |
| `exhibitPacketDrafts` | Case, title, explicit composition, settings, revision, source version policy, last candidate |
| `exhibitPacketCandidates` | Frozen manifest/hash, job, artifact(s), page-map reference, validation report, review state |
| `exhibitPacketVersions` | Immutable candidate reference, version number, finalized actor/time, artifact hashes |
| `exhibitPacketPageMaps` | Chunked/indexed output mappings and destination data |
| `evidenceOperations` | Operation ID, actor, target, expected/result revision, structured diff, inverse/undo state |
| `batesReservations` | Scope/prefix/range, candidate/job, reserved/issued/void status |
| Existing conversation records + scope links | Assistant history and structured decisions by authorized Studio object |

Every mutable entity includes created/updated timestamps and a revision. Index by access scope/case and by parent relation; avoid reading an entire user's case history to list one collection. Store large manifests/page maps in immutable storage or bounded chunks rather than unbounded database rows.

Use a normalized access helper across legacy clerk-user, user, and org ownership fields. Do not accept owner IDs from callers as authority. Server-side joins must validate that every source belongs to the permitted scope and case relationship.

### 18.1 Draft saves and concurrent edits

Local typing remains responsive. Debounce metadata saves with a target of one second after inactivity; persist discrete structural operations immediately. Show **Saving**, **Saved**, **Offline changes**, or **Conflict**. Never show **Saved** before server acknowledgment.

Writes require `expectedRevision`. On conflict, reload and offer merge for disjoint text fields or replay the intended operation against the new revision. Do not silently overwrite someone else's ordering/selection. Avoid storing raw evidence or signed URLs in browser local storage. Server-acknowledged edits recover after refresh; offline recovery buffers contain only the minimum necessary draft metadata and follow the application's privacy policy.

## 19. Service and assistant tool contracts

Use existing Convex mutations/queries for durable state and server actions/workers for heavy processing. Names below describe contracts, not a requirement to expose each as a public HTTP route.

All write operations require authenticated actor, authorized target, operation ID, and expected revision where mutable. Responses use `{ status, operationId, resultingRevision, changedIds, warnings, undoToken? }` or a typed error.

| Operation | Essential inputs | Result |
|---|---|---|
| `createCollection` | caseId, name, optional initial selected references | Saved collection and committed memberships |
| `addToCollection` | collectionId, item refs/selectors, separate/combine policy | Added/already-present counts, operation diff |
| `createExcerpt` | sourceVersionId, typed selector, context policy | Excerpt revision and preview reference |
| `updateExhibit` | exhibitId, permitted field patch, expectedRevision | New revision; impacted draft IDs |
| `suggestClassifications` | selected references, taxonomy scope | Source-grounded suggestions, no accepted membership mutation |
| `applyClassifications` | targets, classification IDs, decision | Accepted assignments with undo |
| `reorderCollection` | ordered member IDs or move operation | Validated order with no lost/duplicate membership |
| `snapshotTimeline` | caseId, event IDs/revisions, template | Snapshot document source and PDF job |
| `createPacketDraft` | collection/exhibit refs, explicit composition policy | Draft with pinned selection |
| `configurePacket` | settings patch | Validated settings and stale-candidate status |
| `preflightPacket` | draftId, revision | Blockers, warnings, estimated inventory |
| `generatePacketCandidate` | draftId, revision, operationId | Job/candidate IDs and progress subscription |
| `cancelPacketJob` | jobId | Cooperative cancellation status |
| `finalizePacketCandidate` | candidateId, expected manifest/artifact hash, review acknowledgments | Immutable version |
| `createSubsetFromVersion` | versionId, selected exhibit/excerpt IDs, label policy | New draft/collection with origin crosswalk |
| `undoEvidenceOperation` | operationId/undo token, current revision | Validated inverse or conflict |

Read tools include `getSourcePages`, `searchEvidence`, `getExcerptContext`, `getCollection`, `getPacketStatus`, and `getPacketValidation`. Return bounded, authorized source spans rather than entire files by default.

## 20. Generation engine and processing stages

1. **Authorize and freeze:** validate case/source access, draft revision, explicit selection, and immutable source versions; build manifest.
2. **Preflight:** resolve all selected originals/derivatives and check page ranges, metadata requirements, labels, and reviewed redactions.
3. **Prepare assets:** fetch source bytes server-side, verify hashes, extract PDF pages, normalize images, convert supported documents, generate timeline snapshots.
4. **Render generated material:** title sheet, letter, covers, excerpt notes, and group dividers using frozen approved text.
5. **Compose ordered content:** combine actual PDF pages and generated pages in manifest order while recording page roles/source mappings.
6. **Resolve front matter:** render an index using measured page counts; repeat bounded pagination until index size and destinations stabilize.
7. **Build final page map:** incorporate all front matter, explicit blanks, source pages, and volumes.
8. **Allocate/stamp:** reserve Bates if needed; apply page labels, exhibit-local numbers, and Bates on eligible physical pages.
9. **Add navigation:** index links, group/exhibit bookmarks, optional excerpt destinations.
10. **Validate artifact:** parse every page, reconcile inventory and labels, verify links/stamps/readiness and redaction checks.
11. **Persist candidate:** store PDF(s), checksums, manifest, page map, validation report, and review requirements.
12. **Finalize on review:** promote exact candidate; never rerender during finalization.

Index convergence limit: five pagination passes initially. Failure returns `INDEX_PAGINATION_UNSTABLE` with no finalizable artifact. Render dates and content remain frozen between passes. Index-only output from an existing packet reuses that packet's page map.

HTML rendering remains appropriate for generated covers/letters/indexes. Original PDFs require a page-composition engine. Choose and pin its library/runtime after a compatibility spike covering rotation, fonts, annotations, text extraction, links, image quality, and encrypted input handling. Signed source PDFs remain preserved as originals; packet derivatives are not represented as retaining the original digital signature's validity.

### 20.1 Durable jobs

States: `queued`, `resolving_sources`, `preparing_assets`, `rendering_front_matter`, `assembling`, `paginating`, `stamping`, `validating`, `ready_for_review`, `failed`, `cancelled`.

Use durable checkpoints and per-asset results. An SSE disconnect does not own job execution or cancel it. Progress subscriptions reconnect to persisted job state. Workers use leases/heartbeats; checkpoint writes and artifact publication are idempotent. Cancellation stops at safe boundaries and prevents subsequent publication by stale workers.

Retry transient fetch/processor failures up to three attempts with bounded backoff. Invalid files, unauthorized sources, bad selections, and failed redaction verification need user action rather than automatic retries. Clean up temporary assets; retain diagnostics without raw evidence logs.

## 21. Validation and error contract

### 21.1 Blocking checks

- Every selected source/version is accessible and hash-consistent.
- Every requested page/message/region exists and remains tied to the frozen extraction/source version.
- Labels are unique and valid in the packet scope.
- Each index entry maps to the expected exhibit and actual destination.
- Every expected evidence page/region appears; extra pages are explained by explicit layout roles.
- Every eligible page has exactly one intended Bates stamp; values match reservations/settings.
- Every bookmark and link destination exists in the appropriate artifact.
- Every required template field is complete; no placeholder or internal ID leaks into visible generated content.
- Redacted derivatives passed review and verification; original hidden text/attachments cannot expose the redacted content.
- Output parses successfully, has the expected page count, and retains readable assets.

### 21.2 Warnings requiring visible review

Low OCR confidence, inferred dates, unclear sender, duplicate/overlapping excerpts, low-resolution source, missing optional context, potentially unreadable fit, and source changes available in a newer version. Warnings are specific to items and link to the affected preview.

Preflight estimates cannot mark final Bates/page/link validation as passed. Final checks run against the PDF bytes after stamping and navigation.

### 21.3 Typed error examples

| Code | User-facing behavior |
|---|---|
| `SOURCE_UNAVAILABLE` | Identify the source and offer restore/relink/remove-from-draft |
| `SOURCE_VERSION_CHANGED` | Offer keep pinned original or explicitly refresh draft |
| `SELECTION_OUT_OF_RANGE` | Open affected page/message selection |
| `EXTRACTION_ANCHOR_STALE` | Require re-anchoring to a new extraction generation |
| `LABEL_COLLISION` | Show conflicting exhibits and label settings |
| `DRAFT_REVISION_CONFLICT` | Reload/merge without overwriting changes |
| `REDACTION_REVIEW_REQUIRED` | Open redacted derivative comparison |
| `PACKET_INVENTORY_MISMATCH` | Block finalization and identify missing/extra page mappings |
| `STAMP_COLLISION` | Offer alternate placement or expanded margin |
| `INDEX_PAGINATION_UNSTABLE` | Preserve draft; offer simpler index layout and retry |
| `PROCESSING_LIMIT_EXCEEDED` | Show configured limit and suggest split/reduce |

## 22. Privacy, redaction, and retention

Redaction is a dedicated derivative operation, not a black rectangle annotation. Remove redacted information from rendered content, selectable text, OCR layers, annotations, attachments, and relevant metadata. Verify both extracted text and rendered pages. If reliable redaction is unsupported for a source, block redacted finalization and explain the supported conversion path.

Distinguish highlights, crops, and redactions in the UI. Cropping alone is not a confidentiality guarantee because a PDF may retain hidden content. Derivative export must include only intended content.

Default confidential notes remain internal and are excluded from packets. If a user explicitly includes a note, show it as authored commentary rather than original evidence. Classification and commentary inclusion are explicit settings. Generate public/confidential variants as separate candidates with separate review and hashes.

Use short-lived authenticated download access and server-side source fetching. Recheck permissions before publication and download; loss of access prevents new generation. Never expose storage keys in assistant prose, visible source descriptions, or analytics.

Archive/removal from a collection does not delete an original. Deletion/retention policy is separate: if originals are removed, existing packet references report that condition honestly. Final artifact availability follows account retention policy, not an unsupported promise of indefinite preservation.

## 23. Performance and operational requirements

Initial engineering targets, to be measured before release:

| Scenario | Target |
|---|---|
| Local selection/reordering feedback | Under 100 ms for ordinary interactions |
| Paginated collection view | First useful content within 2 seconds under the agreed staging load |
| Acknowledged draft save | Within 2 seconds after save dispatch under normal service conditions |
| 100-item add-to-collection operation | Complete or durable progress within 5 seconds |
| 100-page packet with prepared sources, no AI/OCR | Candidate within 60 seconds at p95 in the reference environment |
| 500-page packet with prepared sources | Candidate within 5 minutes at p95 in the reference environment |

These are acceptance targets, not current capabilities or guarantees. Record worker resources, input mix, concurrency, and network conditions with benchmarks. OCR/conversion times are reported separately.

Support must be demonstrated with at least a 100-exhibit, 500-page fixture. Enforce configurable limits for bytes, pages, source dimensions, exhibits, and concurrent jobs. Set actual production values from profiling and plan entitlements; show them before expensive work begins. Do not silently cap covers or evidence.

Measure stage duration, retries, failed source count, candidate/finalization rates, page-map mismatches, stale approvals, and AI cost by operation. Logs contain IDs/error categories and timing, not private excerpts or signed URLs.

## 24. Repository integration and migration

### 24.1 Existing code to reuse or replace deliberately

| Current location | Required integration |
|---|---|
| `src/components/pipelines/exhibits/ExhibitPacketBuilder.tsx` | Replace local-only staging and timer with persisted Studio composition and real generation |
| `src/app/(app)/docuvault/exhibits/page.tsx` | Preserve entry route; host Studio home |
| `src/components/export/ExhibitExportModal.tsx` | Consolidate supported settings into Studio; avoid two independent configuration contracts |
| `src/app/(app)/docuvault/context/ExportContext.tsx` | Route exhibit assembly to the dedicated packet contract; retain court/summary behavior |
| `src/lib/export-assembly/index.ts` | Eliminate ambiguity between explicit evidence selections and empty/all selection |
| `src/lib/export-assembly/mappers/mapToExhibits.ts` | Reuse suggestions/grouping where useful; remove source assembly dependence on AI relevance and cover caps |
| `src/lib/export-assembly/pipelineBridge.ts` | Limit exhibit AI work to summaries/metadata; do not rewrite evidence content |
| `src/lib/exports/adaptDraftedToCanonicalExport.ts` | Do not identify exhibit source content by drafting section ID |
| `src/lib/exports/renderers/renderExhibitPacketHTML.ts` | Reuse generated-page templates; replace type-batched packet assembly |
| `src/lib/exports/bates/applyBatesNumbering.ts` | Retain formatting only behind validated settings; add physical-page stamping |
| `src/lib/exports/timeline/*` | Reuse timeline presentation with versioned source snapshots and packet references |
| `src/app/api/documents/export/stream/route.ts` | Delegate exhibit work to durable packet generation; remove fixed/reset settings on this path |
| `convex/uploadedFiles.ts`, document-memory modules | Resolve authorized original bytes and pinned extraction generations |
| `convex/exportJobs.ts`, export runs/artifact storage | Extend lifecycle/idempotency integration; do not confuse admission tracking with durable processing |

### 24.2 Proposed module boundaries

```text
src/components/exhibit-studio/
  StudioShell, EvidenceLibrary, CollectionPicker, CollectionOrganizer
  SourcePreview, ExcerptEditor, ExhibitInspector, StudioAssistant
  PacketSettings, PacketPreview, ValidationPanel, VersionHistory
src/lib/exhibit-studio/
  contracts, selectors, classification, labels, permissions
  assistant-tools, operation-validation, timeline-snapshots
src/lib/exhibit-packets/
  manifest, source-resolver, asset-preparation, assembly-plan
  compose-pdf, pagination, page-map, stamp-pages, navigation
  artifact-validation, generation-job, delivery
convex/
  evidenceSources, evidenceExcerpts, exhibitCollections
  exhibitPackets, evidenceOperations, batesReservations
```

Names are illustrative; keep public contracts cohesive and avoid duplicated helpers across old/new paths. Do not make unrelated chat refactors a prerequisite; integrate through the available shared assistant boundary, allowing later kernel changes behind that interface.

### 24.3 Migration rules

Existing exhibit notes and pins migrate as descriptive/source-note candidates, not authenticated original files. Preserve their IDs/origin references. Link to original files only where an actual verified relationship exists.

Existing generated exhibit PDFs remain downloadable legacy artifacts. Label their source inventory as unavailable when no manifest exists. Offer **Use this PDF as a source** or **Rebuild from linked originals** when verified sources are available. Never backfill fabricated page provenance.

Roll out behind an exhibit-studio feature flag. Maintain existing court/summary export tests. Disable unsupported exhibit controls rather than leaving functional-looking placeholders. Rollback can disable new generation while retaining access to existing finalized artifacts and drafts.

## 25. Implementation work packages

| Package | Deliverables | Depends on | Completion gate |
|---|---|---|---|
| WP-01: contracts and source identity | Typed entities/selectors, access helpers, immutable source resolution | None | Authorized original pages resolve with verified versions |
| WP-02: collections and persistence | New/existing collection action, bulk operations, order, autosave/revision handling | WP-01 | Single/bulk adds, undo, refresh and case isolation pass |
| WP-03: source/excerpt Studio | Preview, page/region/message selectors, context controls, derivatives | WP-01–02 | Exact selected source material survives export fixtures |
| WP-04: timeline and classifications | Timeline PDF snapshots, taxonomy, grouping, source-linked suggestions | WP-01–03 | Timeline standalone/packet and focused collections work |
| WP-05: packet composition | Manifest, actual PDF page assembly, covers/letters, settings propagation | WP-01–03 | Working mixed-source packet with correct order |
| WP-06: pagination and navigation | Labels, Bates, page maps, index, bookmarks, crosswalks | WP-05 | Physical-page reconciliation and navigation tests pass |
| WP-07: assistant actions | Scoped history/context, typed tools, action results, undo integration | WP-02–06 | Natural-language workflow changes real persisted state |
| WP-08: review and versions | Exact-candidate review, redaction verification, finalization, immutable releases | WP-03, WP-05–07 | Candidate hash equals finalized/downloaded artifact |
| WP-09: scale and delivery | Durable processing, retries/cancel, separate PDFs, ZIP, volume splitting | WP-05–08 | Load/recovery/volume fixtures meet measured limits |
| WP-10: voice extension | Transcript input and correction using existing assistant tools | WP-07–08 | Voice performs equivalent scoped actions without bypassing review |

Core professional release requires WP-01 through WP-08 plus durable generation from WP-09. Optional ZIP/volumes and voice can follow. A phase demo is not permission to claim the full workflow complete. Ship only controls backed by complete behavior.

## 26. Acceptance tests and release gates

Use deterministic fixtures and inspect actual PDFs, not just HTML strings. Keep unit tests for pure labels/selectors, integration tests for state/access/job operations, and end-to-end tests for Studio-to-download behavior.

| ID | Scenario | Required result |
|---|---|---|
| AT-01 | Select one screenshot → new collection | Saved collection contains referenced source; undo works |
| AT-02 | Select 30 mixed items → same collection | Exactly requested items committed once; retry does not duplicate |
| AT-03 | Batch includes unauthorized/missing source | No silent partial success; invalid items explained |
| AT-04 | Select exhibits from finalized packet | New collection preserves pinned source refs; original packet unchanged |
| AT-05 | Refresh or switch cases mid-work | Server-saved draft restores; no cross-case queue contamination |
| AT-06 | Concurrent edits to collection | Revision conflict handled without lost membership/order |
| AT-07 | PDF pages 2–4 plus two images | Exactly five evidence pages in approved order before optional generated pages |
| AT-08 | Crop rotated/zoomed source | Exported crop matches preview and correct source coordinates |
| AT-09 | Select noncontiguous messages | Exact text, timestamps, sender, order and omission indicators preserved |
| AT-10 | Add two preceding messages as context | Correct additional messages and updated provenance/page counts |
| AT-11 | OCR generation replaced | Existing excerpt stays pinned or requires explicit re-anchor; no shifted selection |
| AT-12 | Classification-focused subset | Only approved matching excerpts, or explicit full exhibits, included |
| AT-13 | Timeline PDF then edit timeline | Saved PDF remains unchanged; newer snapshot is optional |
| AT-14 | Summaries disabled, 35 covers requested | All 35 covers present without summary-dependent omissions |
| AT-15 | Mixed text/image/PDF exhibits | Each cover immediately precedes its own evidence |
| AT-16 | More than 26 labels; custom segmented format | Correct sequence, no collision or duplicated Exhibit prefix |
| AT-17 | Preserve master labels versus relabel subset | Correct selected policy and origin crosswalk |
| AT-18 | Multi-page index shifts evidence pages | Ranges/bookmarks/links agree with final PDF pages |
| AT-19 | Long source spans many pages | Bates assigned per eligible physical page, no missing/duplicate values |
| AT-20 | Existing source stamp near new stamp | No obscured evidence; reviewed alternate placement works |
| AT-21 | Index-only and packet-without-index | Correct mode behavior; no false no-content failure or unwanted index |
| AT-22 | AI unavailable | Manual workflow and metadata covers still produce complete packet |
| AT-23 | Assistant asked to add/group/relabel | Typed action succeeds, persisted result is visible, undo available |
| AT-24 | Document contains tool/prompt instructions | Source text cannot redirect assistant actions or scope |
| AT-25 | Redacted candidate | Removed content absent from rendered pixels, text layers and embedded artifacts |
| AT-26 | Edit after candidate generation | Old candidate clearly stale; approval cannot finalize different bytes |
| AT-27 | Finalize and download | Exact reviewed hash matches stored/downloaded artifact |
| AT-28 | Disconnect/retry/cancel worker | Durable state resumes; no duplicate publication or continued cancelled job |
| AT-29 | Concurrent global Bates reservation | Nonoverlapping ranges; cancelled reservations tracked |
| AT-30 | Source removed/access revoked during generation | Finalization blocked and source-specific error returned |
| AT-31 | 100 exhibits/500 pages | Complete, readable, indexed output under measured resource limits |
| AT-32 | Keyboard/mobile workflows | Selection, add-to-collection, ordering alternative, review and download usable |
| AT-33 | Source appears in two groups | Explicit duplicate/cross-reference policy reflected in inventory and index |
| AT-34 | Individual PDFs/volumes | Correct local links, labels, volume/page references and inventory |
| AT-35 | Legacy packet without provenance | Imported as PDF source; no invented original-source mapping |

Visual review fixtures must include dense message screenshots, portrait and landscape PDFs, long titles, low-resolution scans, long cover summaries, multiple index pages, more than 20 covers, tables near page boundaries, and stamp-placement collisions. Save approved reference renders for regression comparison.

## 27. Requirements-to-audit traceability

| Audit finding | Primary resolution |
|---|---|
| F01 generation placeholder | WP-05, WP-09; AT-07, AT-27 |
| F02 source evidence absent | WP-01, WP-03, WP-05; AT-07–11 |
| F03 evidence selection ignored | Explicit manifest selection; AT-02, AT-03, AT-12 |
| F04 ordering/identity mismatch | Stable exhibit IDs and ordered page composition; AT-15 |
| F05 Bates not wired/page-accurate | Physical page map and stamping; AT-19, AT-29 |
| F06 basic index only | Pagination/navigation; AT-18, AT-34 |
| F07 disconnected settings | One contract and artifact assertions; AT-16, AT-17, AT-21 |
| F08 local draft/no reorder | Persisted revisions and accessible ordering; AT-05, AT-06, AT-32 |
| F09 cover caps/truncated sources | Source fidelity and independent cover policy; AT-09, AT-14 |
| F10 weak validation | Final-artifact checks; AT-18–21, AT-25–27 |
| F11 confidentiality gaps | Reviewed redacted derivatives and exclusion settings; AT-25 |
| F12 execution/versioning gaps | Durable jobs and immutable releases; AT-26–30 |
| F13 basic presentation | Design contract and actual PDF visual regression fixtures |

## 28. Definition of done

A user can select original evidence or a timeline, create precise excerpts with context, add one or many items to a saved collection, discuss and edit their purpose in the Studio, build master or focused packets, configure labels and numbering, inspect an accurate index and preview, and download the exact reviewed packet.

The packet contains all approved evidence, preserves source identity, makes derived commentary distinguishable, has correct physical-page mappings, applies numbering consistently, supports navigation, and remains available as an immutable version. Every visible capability has a working server contract, an observable result, failure handling, and an acceptance test.
