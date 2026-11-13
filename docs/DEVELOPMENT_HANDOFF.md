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
| P01 | Complete authoritative document inventory | PARTIAL | Missing exact V3 web spec and document-map titles/versions |
| P02 | Read every applicable document in full | PARTIAL | Read three attached governance DOCX and living handoff; other V3 specs outstanding |
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

## Rules for continuation

1. Read and reconcile specs; **do not ask user to repeat settled decisions**.
2. Do not claim a PDF or deployed editor is visually verified from static code inspection.
3. Preview and export must copy the same approved PDF master artwork, not redraw borders.
4. Proof scope must be inspectable and include only selected saved pages.
5. Record actual test command, SHA, PDF page count/order and visual evidence before marking any row PASS.
6. Update this file, Living Development Handoff and version register together after material work; do not increase UI version for documentation-only changes.
