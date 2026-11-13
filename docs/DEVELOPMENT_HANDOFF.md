# V3 development handoff — requirements reconciliation (2026-11-13)

**Status: OPEN / NOT RELEASE READY.** This is a technical mirror of the [Living Development Handoff](https://docs.google.com/document/d/1xYtXeF-MednEjia1F-H68tDt92_-plwa-avt4GGjsKc/edit), not a new source of architectural authority. Read that document and all governing specifications before changing architecture.

## Mandatory documentation gate

Inventory and **read in full** all applicable governing documents, V3 web requirements and subordinate specifications, approved master PDFs, decision logs, data schema, repo documentation and tests. Record title/version/location, authority, exact acceptance criteria and conflicts. Missing/unavailable documents are blockers, not permission to invent standards. Project Rulebook v1.5 CR-002 and CR-003 prohibit unauthorized reinterpretation or unrelated geometry changes; CR-004 and CR-007 require visual QA and correction before deliverables.

## Documents reviewed / still to locate

| Source | Status | Notes |
|---|---|---|
| Project Rulebook v1.5 (2026-08-09), attached Project DOCX | READ | Project-level locked governance; verify if a newer authoritative version exists |
| Project Reference Manual v2.1 (2026-08-09), attached Project DOCX | READ | Project-wide data/production rules, predates V3 web rebuild |
| Chat Charters and Startup Prompts v1.0 (2026-08-09), attached Project DOCX | READ | Cross-workstream authority and routing, predates V3 |
| V3 Living Development Handoff, Google Doc ID 1xYtXeF-MednEjia1F-H68tDt92_-plwa-avt4GGjsKc | READ (current text) | Includes 13-item mandatory punchlist; evolving, must re-read each session |
| V3 Version/Deployment Register, Google Doc ID 1trZdyqdaFvWYsAUvW6Ack-GL33ZOSmwpGScRhrMCVR4 | PARTIAL | Read recent entries; current production status unverified |
| V3 repository README.md | READ | Explicitly describes early prototype; not sufficient as current web specification |
| V3 current app JS/HTML, template config, tests, CI | PARTIAL | Targeted audit, not complete line-by-line implementation review |
| Approved Siddur master, `templates/pdf/Leaders_Companion_V3_Master_Template_v1.3_Outer_Lines_Only.pdf` | PARTIAL | File selected in config; PDF geometry/byte comparison and export proof pending |
| Approved cover, section-title, section-contents masters | NOT VERIFIED | Config names known; independent visual inspection pending |
| Current V3 web functional requirements, source/metadata schema, page intake, cover/section specs, decision log, document map | NOT FULLY INVENTORIED/READ | Locate authoritative versions in Drive/repository before structural decisions |
| v0.98 workbook and source assets | NOT FULLY AUDITED | Preserve permanent IDs and approved data lineage; reconcile with V3 schema |

## Active punchlist (no unverified PASS)

| ID | Task | Status | Evidence / immediate next step |
|---|---|---|---|
| P01 | Complete authoritative document inventory | PARTIAL | Located V3 Font Size Spec, current Drive Rulebook and Roadmap; current Rulebook internal v2.77 conflicts with filename v2.76 |
| P02 | Read every applicable document in full | PARTIAL | Read seven V3 specification Docs; current 225k-character Rulebook retrieved but not fully reconciled; native Sheets pending |
| P03 | Requirement-to-code traceability matrix | OPEN | Extract section-specific acceptance criteria from V3 specs |
| P04 | Audit actual main branch vs requirements | PARTIAL | Found CI did not execute canonical-editor-pipeline.test.cjs; fixed in commit f9a67169097fbfb166794438ae52d4494c21cd3b |
| P05 | Verify actual approved master PDFs | PARTIAL | Config selects Outer Lines Only; visual/geometry verification of all masters outstanding |
| P06 | One canonical PDF preview/export pipeline | UNVERIFIED | Shared renderer exists; browser round-trip proof required |
| P07 | Page metadata persistence/round-trip | UNVERIFIED | Need authoritative schema, saved state test |
| P08 | Saved-only selectable PDF proof | UNVERIFIED | V3.338 selection code exists; browser test required |
| P09 | Three-page front-matter benchmark | OPEN | Must work independently of Siddur metadata |
| P10 | Cue language and spanning highlights | UNVERIFIED | Recent code changes not end-to-end tested |
| P11 | Real PDF visual comparison | OPEN | No accepted browser/export visual test |
| P12 | Automated syntax/CI/PDF QA | PARTIAL | CI now invokes all three existing tests and triggers for template/config changes; actual run result unverified |
| P13 | Version, handoff, release gate | PARTIAL | This mirror created; release remains blocked |

## Authoritative V3 specifications located and read — 2026-11-13

The following are **approved design requirements**, not proof that the app implements them. All six Google Docs below were read in full (document text). The SH-FE Google Sheet is a separate native spreadsheet and still needs row/header audit.

| Specification | Source | Binding requirements | Implementation evidence |
|---|---|---|---|
| Siddur Intake Specification v1.0 (Nov 1, approved architectural direction) | [Google Doc](https://docs.google.com/document/d/1kUFmqXigDUMwLUTB3OFhNeywaDxA4Gc9txh96iThAlI/edit) | Each cue has permanent cueId and order; page record separately holds pageId, source/printed page, language, prayer, service, section, stock; PDF embeds ordered cues and page metadata; source DB is seed only; SH-FE first | UNVERIFIED; audit source field mapping, metadata round-trip, arbitrary cue counts |
| Section Opening Layout and Generated Contents v1.0 | [Google Doc](https://docs.google.com/document/d/1Swz0CUyRS9-hqH77wQTmCHymVQ3KKNK0xPADflMyBdk/edit) | Exact 612×792pt masters; section title RIGHT, contents LEFT for RTL binding; dynamic title only; TOC derived from intake Page Records/Cue Intake, no duplicate entries for multiple cues, continuation pages on overflow | UNVERIFIED; check actual master bytes, generated TOC derivation, overflow, duplex order |
| Master Cover Layout v1.2 | [Google Doc](https://docs.google.com/document/d/1krns5P5-c74-xgKEXB0xo4RlAb6STZXJJdIkDM16p1g/edit) | Approved monochrome bordered cover; Times 17 book ID, Times-Bold 32 service title; Helvetica 9 left metadata at x45; actual build date/version/final page count; border 27pt inset | UNVERIFIED; verify metadata populated only after final count and no master masks |
| Cue Tags, LIP and Status Indicator (Oct 31, design requirements) | [Google Doc](https://docs.google.com/document/d/1FXyNz8x_JMBRyKBBmV8MzrNRPx2GRywgZdV_LVaJC_I/edit) | Cue-associated numbered draggable tags, persisted page-specific positions, global document-wide on/off, status progress by cueId but displays tag, master/subcue hierarchy; preserve manual highlighting | FUTURE/NOT IMPLEMENTED per source; must inspect actual RH-FE master/subcue data before implementing |
| Prayer, Summary & Instruction Database Workflows (Oct 31, agreed design) | [Google Doc](https://docs.google.com/document/d/1c4sht3iDq5kPfPCTHpI36wkDWBI0BVjQkEve_eP2rs4/edit) | Stable Prayer/Summary/Instruction IDs, central canonical wording, association/default workflows with explicit confirmation, page stores selected IDs; PDF resolves readable text and remains standalone | FUTURE/NOT IMPLEMENTED per source; verify actual DB schema first |
| SH-FE Siddur Intake v1.0 | [Google Sheet](https://docs.google.com/spreadsheets/d/1GXj5jJvJ1lLAbqsnIKSnQGU4N1xyFXmN717bdSyKCcY/edit) | 63 provisional cue records, 50 provisional page records in Cue Intake/Page Records/Read Me (per intake specification); verify actual values and headers | DATA AUDIT OPEN; do not claim sheet content read via Google Docs API |

### Traceability additions (requirements are authoritative; code status requires tests)

| Req ID | Requirement / acceptance criterion | Source | Code/test focus | Status |
|---|---|---|---|---|
| V3-INT-01 | Independent permanent cue records; no fixed cue limit; edit/reorder without collisions | Intake §2 | import mapping, cue state, PDF embedded records | UNVERIFIED |
| V3-INT-02 | Separate English/Hebrew page records and cue-less pages; no duplicated page values | Intake §3 | page metadata, pageId, pageType | UNVERIFIED |
| V3-INT-03 | PDF carries authoritative per-page metadata + ordered cue records; no runtime spreadsheet dependency | Intake §§1,5 | export metadata attachment, reopen parser, round-trip tests | UNVERIFIED |
| V3-INT-04 | SH-FE ordinary 170 white spread + separate conditional neon English/Hebrew duplex insert, pairing not invented | Intake §§9–12 | conditional page records, imposition | OPEN |
| V3-TOC-01 | TOC from intake records; canonical order; printed references; no cue-driven duplicate rows; overflow pages | Section §4 | TOC derivation, overflow tests | UNVERIFIED |
| V3-TOC-02 | Section title right, contents left; 612×792 and exact specified typography | Section §§1–3,5 | master PDF copies and render test | UNVERIFIED |
| V3-COV-01 | Actual production date, running software version and complete final assembled page count | Cover §§2–3 | cover metadata after assembly | UNVERIFIED |
| V3-COV-02 | Preserve v1.2 cover master border and divider, monochrome | Cover §§1,4,6 | rendered PDF comparison | UNVERIFIED |
| V3-TAG-01 | Tags tied to cueId, independently movable and page-persistent; global toggle; status tag display | Cue Tags confirmed requirements | cue/tag metadata, UI, reload tests | FUTURE |
| V3-DB-01 | Page stores permanent IDs; central prayer/summary/instruction records and explicit association/default confirmation | Database Workflows A–F | database connectors, page metadata, modal tests | FUTURE |
| V3-HL-01 | Preserve known-good V3.38 manual Hebrew/English line/word selection | Cue Tags §8; Database Workflow F4 | manual selection regression | UNVERIFIED |

### Newly located governing sources / precedence issue

- [V3 Font Size Specification v1.0](https://docs.google.com/document/d/169SfH6evLQ8BFvM4XYi9j7tO1K_3DRYqjs4Dl1R8keE/edit) — READ IN FULL. Approved page number 18pt red, service 18pt, title 20pt, instructions 12pt max 3 lines; specific measured field rectangles; unlimited cue records, unresolved 1/2/3 cue typography; six stock codes; separate PDF index, duplex side, bound position and page type; intentional blanks on color transitions. Some early opening-page language is superseded by later cover/section specifications; reconcile by date and explicit approval, not guessing.
- [Current Drive Rulebook titled v2.76](https://docs.google.com/document/d/1AZJtYXT8zP9PJ-l_yA5sW1ic7LYusydWHYXan-di1Gw/edit) — **IMPORTANT**: internal heading reads **Version 2.77 • 2026-09-13**. This is substantially newer than the attached Project Rulebook v1.5. The earlier audit incorrectly treated v1.5 as the current rulebook. Current Drive Rulebook contains 938 paragraphs (~225k characters), retrieved but NOT YET FULLY RECONCILED. CR-006 requires consultation before structural decisions; full rule inventory and source version discrepancy are an OPEN governance gate.
- [V3 Roadmap](https://docs.google.com/spreadsheets/d/1iMm2HDZMHCpGylb3x-Tg37gl2GcVpzROQfzqZvmqY90/edit) — located; spreadsheet contents pending audit.

### Source-of-truth cautions

- Do not treat the 63 cue / 50 page counts as verified sheet contents until the native Sheet is read; they are stated in the approved intake spec.
- Do not implement the earlier speculative metadata architecture in preference to Intake §5 and Database Workflow F. Page-specific values and canonical database IDs have distinct responsibilities.
- The section specification explicitly requires TOC overflow pages; never truncate to the fixed template's initial lines.
- The approved cover and section masters are separate from the recently selected Siddur Outer Lines Only master.
- The current V3 web production/duplex/font specification mentioned in Intake §8 still needs to be located and read; no claim of completed P01/P02 yet.

## Rules for continuation

1. Read and reconcile specs; **do not ask user to repeat settled decisions**.
2. Do not claim a PDF or deployed editor is visually verified from static code inspection.
3. Preview and export must copy the same approved PDF master artwork, not redraw borders.
4. Proof scope must be inspectable and include only selected saved pages.
5. Record actual test command, SHA, PDF page count/order and visual evidence before marking any row PASS.
6. Update this file, Living Development Handoff and version register together after material work; do not increase UI version for documentation-only changes.
