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
| P01 | Complete authoritative document inventory | PARTIAL | Located V3 specs, Rulebook, SH-FE native Sheet and Roadmap; rulebook title/header version conflict remains |
| P02 | Read every applicable document in full | PARTIAL | Seven V3 specs and both native Sheets read; 938-paragraph current Rulebook retrieved and selectively inspected, full reconciliation pending |
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

## Current Rulebook and native SH-FE data audit — 2026-11-13

### Governance

- Located [Google Drive Rulebook titled v2.76](https://docs.google.com/document/d/1AZJtYXT8zP9PJ-l_yA5sW1ic7LYusydWHYXan-di1Gw/edit), whose internal heading says **Version 2.77 (2026-09-13)**. Retrieved all 938 text paragraphs (~224,801 characters); searched and inspected 194 paragraphs matching V3/PDF/Siddur/metadata/duplex/template and related terms. This is **not** a completed comprehensive rule-by-rule reconciliation. Treat this later rulebook as higher-priority than the attached v1.5 unless the authority chain shows otherwise. Resolve filename/header discrepancy through version register before editing the Rulebook.
- CR-006 explicitly requires consulting the current Rulebook and applicable subordinate spec before structural, architectural, layout, naming, asset-generation, or generator-behavior decisions. V2-specific production rules may not be blindly transferred to the newer V3 web app; identify scope and explicit supersession.
- The [V3 Roadmap](https://docs.google.com/spreadsheets/d/1iMm2HDZMHCpGylb3x-Tg37gl2GcVpzROQfzqZvmqY90/edit) was read as a native Sheet: 23 populated candidate rows (V3-001 through V3-023), each with status **CANDIDATE**. These are proposals, **not approved implementation requirements**. In particular V3-002 says a context-aware instruction system is a candidate and does **not** preapprove a many-to-many Instruction ID junction architecture. The separately approved Oct 31 Prayer/Summary/Instruction workflow specification describes many-to-many relationships; record scope/approval precedence before implementing either design.

### SH-FE native intake sheet — inspected actual rows

Source: [SH-FE Siddur Intake v1.0](https://docs.google.com/spreadsheets/d/1GXj5jJvJ1lLAbqsnIKSnQGU4N1xyFXmN717bdSyKCcY/edit).

- Tabs: **Cue Intake**, **Page Records**, **Read Me**. Read the entire populated A:U cue area (64 rows incl. header), A:L page area (51 rows incl. header), and Read Me. **63 actual cue records and 50 actual page records**; counts in approved Intake §9 confirmed.
- Cue header: Cue ID, Page ID, Sequence, Source ID, Source Page, Page Label, Language, Prayer Name, Service Name, Section ID, Paper Color, Condition, Begin Cue, End Cue, Leader Role, Performance Style, Instruction ID, Summary ID, Leader Notes, Source Unit ID, Review Status.
- Page header: Page ID, Source ID, Source Page, Page Label, Language, Prayer Name (initial), Service Name, Section ID, Paper Color, Condition, Page Type, Review Status.
- Basic referential checks on actual rows: **zero duplicate Cue IDs**, **zero duplicate Page IDs**, **zero cue→missing-page references**, **zero page records without cue** in this seed dataset (the architecture must nonetheless support cue-less pages). Eight page IDs have multiple cue records, with five on `DSP-SH|157H|H`; implementation cannot assume one cue per page.
- All 63 cues and 50 page records are **Imported — review**; no approval inferred. Page colors: 49 W, 1 N. Page languages: 22 E, 26 H, 1 H/L, 1 L. Exactly one conditional cue, `SH-FE-C057`, on neon page `DSP-SH|170E|E`, Condition Rosh Chodesh. Ordinary `SH-FE-C038` remains on white page `DSP-SH|170-171E|E`. **The matching Hebrew neon insert page is not established by this sheet**; physical pairing remains blocked as Intake §10 says.
- This validates seed integrity only, **not** page-title reconciliation, canonical source-image existence, physical duplex assembly, runtime import integration, PDF metadata embedding or actual PDF export.

### Additional acceptance gates

| ID | Acceptance | Evidence / status |
|---|---|---|
| V3-DATA-01 | Import all 63 cue IDs and 50 page IDs without collisions or missing links | Seed sheet PASS on basic IDs; app import UNVERIFIED |
| V3-DATA-02 | Preserve multiple cues on a page, e.g. five on 157H, in order and in PDF metadata | UNVERIFIED |
| V3-DATA-03 | Preserve 170E neon conditional cue and 170–171E ordinary white record separately | Seed sheet PASS; output UNVERIFIED; Hebrew neon pairing OPEN |
| V3-DATA-04 | Do not treat Roadmap CANDIDATE ideas as approved schema changes | Documentation requirement RECORDED; future code audit OPEN |
| V3-GOV-01 | Resolve Rulebook filename/header discrepancy and audit all applicable current locked rules | PARTIAL; current Rulebook read selectively, not comprehensively reconciled |

## Rules for continuation

1. Read and reconcile specs; **do not ask user to repeat settled decisions**.
2. Do not claim a PDF or deployed editor is visually verified from static code inspection.
3. Preview and export must copy the same approved PDF master artwork, not redraw borders.
4. Proof scope must be inspectable and include only selected saved pages.
5. Record actual test command, SHA, PDF page count/order and visual evidence before marking any row PASS.
6. Update this file, Living Development Handoff and version register together after material work; do not increase UI version for documentation-only changes.
