# Leader's Companion V3 — Recovery Specification and Runtime Handoff
**Snapshot:** 2026-11-13, after V3.368. **Status:** requirements preserved; deployment and exported-PDF proof NOT confirmed.

## Purpose and recovery priority
This file is a durable, consolidated description of the recent development decisions. It is not an assertion that the live GitHub Pages deployment has completed. Preserve the code and checkpoint data; do not revert to V2 or modify the approved master PDF geometry. Source of truth for actual code is the GitHub repository; source of truth for design is the approved V3 master and the authoritative Google Drive specifications.

## Deployment investigation at snapshot
- Both HTML entry points in GitHub contain V3.368 version strings. The Facing Page Editor references cue-layout.js?v=3.368.
- cue-layout.js on the default branch contains V3.367 joint fitting and optical shift; facing-import.js contains V3.368 one-dot page status.
- GitHub commit-status endpoint returned empty statuses and the available workflow-run wrapper returned no PR-triggered runs for selected V3.367/V3.368 commits. These results cannot prove deployment success/failure or GitHub Pages publication.
- Recovery checks: confirm GitHub Pages published SHA, Actions Pages workflow/job logs, browser network/cache behavior, JS syntax/load, then PDF export. Do not assume a version-string bump itself confirms deployment.

## Hard invariant: immutable bounding boxes
Every approved-master bounding box is locked in x/y/width/height, regardless of text length, cue count, fonts, page color, instructions, or status display. The authoritative cue specification gives outer 380.8×48 pt and usable 372.8×40 pt; existing JS uses a provisional 376×50 cue region. Audit coordinate reconciliation against actual master before claiming numeric equivalence; NEVER move/rescale the master as a workaround.

## Cue rules, V3.361–V3.367
- Up to three cues per page, using the same serif families across all cue counts: English Georgia/Times New Roman/serif; Hebrew Noto Serif Hebrew/David/Times New Roman/serif. Font availability and glyph shaping need verification.
- Provisional font sizes: 1 cue 28pt, 2 cues ~14.5pt, 3 cues 10pt. Evenly spaced cue-row centers for 2/3; common begin/end baseline per row (V3.365), arrow aligned with row.
- Begin cue preserves its initial whole words; end cue preserves its final whole words. NEVER trim characters inside a word. Canonical full text remains intact.
- V3.367 removes independent 148pt begin/end width caps. Jointly search for the pair retaining the greatest total number of whole words within existing left/right insets and 26pt arrow clearance. Arrow x is computed from actual displayed phrase gap and may move freely INSIDE the locked cue box.
- Direction comes from actual printed cue script (Hebrew RTL, English LTR). Hebrew beginning on right, ending on left.
- V3.367 adds up to 6pt optical downward offset, bounded by row slack, to both text and arrow. This is PROVISIONAL and must be validated visually; not a geometry change.
- Warnings for shortened cue text and export proof remain outstanding. Verify whether the phrase 'He who blessed' can fit at 28pt with 'say, Amen.' on actual browser fonts; do not promise it without measurement.
- Relevant code: app/js/cue-layout.js, app/js/facing-import.js. V3.367 cue layout final commit 82c53086ea192bb6ca3933a4b8397b1831ea1f46; arrow alignment da1f96f766508606f0f2164b5cecc2a339a61220.

## Status bar, V3.364–V3.368
- A single continuous light-gray status track centered vertically inside the EXISTING lower status region. Never alter its bounding box.
- Default reading progression Hebrew RTL: page status starts near RIGHT end. Explicit English/LTR starts near LEFT.
- V3.366 implemented 2pt track, 48pt identifier slot, 10pt red circular marker and reserved 38pt text region. Actual identifiers remain blank until lineage is verified.
- **V3.368 supersedes V3.364/V3.366 multi-dot behavior:** exactly ONE red status dot per PAGE, even with 2 or 3 cues.
- Once V2 tag/subtag lineage is confirmed, display the HIGHEST cue number on the page, with space for three digits plus decimal point at 10pt and padding. Do not confuse V2 Cue ID/Unit ID with tag/subtag without mapping. Do not invent values.
- Existing code's status region x=textX+2, width376, y34, height12 is provisional and must be checked against the master.
- V3.366 status track code commits 14091ce7724575aa9134b5a52fa2bce67250d069, 095448f924523e5263323932109e543ebcf57700. V3.368 one-dot commit 132a87073ef585cf0046a4d2071213fd59cc40df.

## Instructions, titles and page color, V3.350–V3.360
- Instructions were imported from V2 into a V3 catalog; users can select multiple instructions, ordered by frequency, or add entries. The desired long-term page record stores instruction IDs, not full copied text. Review any legacy page-owned instructionEntries from V3.350 and reconcile with the later catalog-ID requirement; do not silently lose saved text.
- The five automatic page-color usage instructions are derived from pageColor and appended after manually selected instructions, not redundantly stored as page instruction IDs: N Only done on Rosh Chodesh; B Only on Shabbat; R Not on Shabbat; O First day only; G Second day only. W adds none. Reader-facing instructions do not automatically control conditional print inclusion.
- Page color codes W/N/B/R/O/G denote White/Neon/Blue/Red/Orange/Green. Header locator prints a one-letter code in very pale matching hue; W nearly white/light gray. Physical stock calibration and editable hue controls are deferred punchlist.
- Hebrew prayer titles are Unicode metadata; V3.358 avoided WinAnsi PDF encoding failure by rasterizing non-ASCII title/TOC text. RTL, niqqud and checkpoint reload require proof. Editing a prayer title must update section TOC and section cover.
- A separate deferred print-production manifest for mixed colored stock must cover page mapping, copies, tray loading, duplex pairing, inserts and collation without modifying page conditions or geometry.

## Open test/release gates
1. Diagnose Pages publication independently of commit presence. Confirm which SHA the live editor actually serves.
2. Syntax/load checks for cue-layout.js and facing-import.js; inspect console errors and network requests.
3. PDF proof for English/Hebrew 1/2/3 cues, actual baseline/arrow positioning, complete-word fitting and no overflow.
4. Verify one status marker for 1/2/3 cues, right-side Hebrew default, left-side explicit LTR, gray track vertical centering.
5. Reconcile all status/cue code coordinate constants with approved master without changing master geometry.
6. Confirm V2 tag/subtag mapping and highest-number ordering before printing IDs.
7. Verify instruction catalog persistence, page-color derived instruction, Hebrew title save and TOC rebuild, checkpoint restore.
8. Confirm GitHub Pages deployment and cache busting; physical print proof for paper color.
**Do not mark any of these complete based only on commits.**

## Key project paths
- Live editor: https://bluetallitot-hub.github.io/leaders-companion-v3/app/html/facing-import.html
- app/js/cue-layout.js; app/js/facing-import.js
- app/html/facing-import.html; app/html/siddur-intake.html
- docs/DEVELOPMENT_HANDOFF.md
- Google Drive living handoff: 1xYtXeF-MednEjia1F-H68tDt92_-plwa-avt4GGjsKc
- Google Drive development register: 1trZdyqdaFvWYsAUvW6Ack-GL33ZOSmwpGScRhrMCVR4
- Font Size Specification: 169SfH6evLQ8BFvM4XYi9j7tO1K_3DRYqjs4Dl1R8keE
- Siddur Intake Specification: 1kUFmqXigDUMwLUTB3OFhNeywaDxA4Gc9txh96iThAlI

## Handoff rule
Future runtimes should read this snapshot and the GitHub technical handoff before modifying the editor; verify current GitHub content and live deployment before claiming a fix. Append each new requirement, code commit, test outcome and open gate to both the GitHub handoff and Google Drive living records.
