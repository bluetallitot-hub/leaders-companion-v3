# Leader's Companion V3 WEB — Development Handoff and Requirements Gate
Updated 2026-11-13. **OPEN / NOT RELEASE READY.** Scope is **only the browser-based web application** in this repository, not the V2 production system, legacy generators, or speculative V3 migration roadmap.

## Binding scope firewall

1. **Authoritative for this work:** current V3 web Living Development Handoff, explicit user-approved web-editor decisions, current web app HTML/JS/config, approved web-app PDF master assets, and web-app-specific acceptance tests. Read these before editing.
2. **Historical reference only, never imported as requirements:** V2 Rulebook (all versions), Project Reference Manual, old Chat Charters, V2 workbook/manifest, V2 SIP/CIP/SGM/LIP/POG publication pipelines, V2 master PDFs, legacy renderer packages, and V3 transition/roadmap CANDIDATE items. They may explain provenance but **cannot prescribe architecture, typography, page geometry, data schema, file paths, UI, PDF assembly, or test acceptance** for the web app.
3. **V3-named documents are not automatically web-app authority.** The separately located Intake v1.0, Font Size v1.0, Cover v1.2, Section Opening v1.0, Cue Tags/LIP, and Prayer/Summary/Instruction workflow docs must be checked against the current web handoff and explicit web approvals, item by item. **Their requirements are NOT incorporated into this web-app checklist solely because their titles say V3.** For instance, do not impose the historical 63-cue/50-page seed, legacy section imposition rules, or LIP tag system on the current web editor without confirmed applicability.
4. No legacy code copying, legacy asset substitution, schema migration, or replacement renderer without explicit user authorization. Existing app code is not automatically approved: audit it for inherited assumptions.
5. In a conflict or gap, preserve the last verified web behavior, mark the requirement **UNRESOLVED**, and do not invent a rule or ask the user to repeat settled decisions. Track the exact web decision and source.
6. **This file and repository README are not independent authorities.** The README's Stage 1 prototype text is historical and must not override the current app/handoff.

## Web app inventory (implementation, not validation)

- Repository: `bluetallitot-hub/leaders-companion-v3`, branch `main`.
- Editor UI: `app/html/facing-import.html`; intake UI: `app/html/siddur-intake.html`.
- Current browser rendering/export code: `app/js/facing-import.js`; template config: `app/js/v3-template-config.js`; cue logic: `app/js/cue-layout.js`.
- Approved current Siddur artwork target: `templates/pdf/Leaders_Companion_V3_Master_Template_v1.3_Outer_Lines_Only.pdf` (verify actual file and visual output). Cover and section masters require independent verification.
- Existing tests: `tests/canonical-editor-pipeline.test.cjs`, `tests/cue-layout.test.cjs`, `tests/master-template-integration.test.cjs`. CI workflow: `.github/workflows/facing-editor-tests.yml`.
- Current tracked app version: V3.339; actual deployment and browser end-to-end output **UNVERIFIED**.

## Web-only requirements and acceptance punchlist

| ID | Web-specific task | Status | Required evidence |
|---|---|---|---|
| WEB-01 | Read and cite **current web-specific** handoff, user approvals, current repository source/tests and selected web PDF masters | PARTIAL | Source/decision inventory with dates and applicability; exclude legacy documents |
| WEB-02 | Build web-only requirements-to-code matrix | OPEN | Exact web approval/requirement → file/function → acceptance test |
| WEB-03 | Audit current web code for **legacy contamination**: old PDF masters, V2 generator calls, workbook dependencies, legacy field geometry and hidden alternate renderers | OPEN | File/line findings and removal plan; do not change functionality blindly |
| WEB-04 | Verify approved Outer Lines Only PDF master is copied without reconstructing or obscuring artwork | UNVERIFIED | Actual PDF bytes and rendered page comparison |
| WEB-05 | Confirm editor preview and export use the same canonical PDF composition path | UNVERIFIED | Browser proof and exported PDF comparison |
| WEB-06 | Verify web page metadata, editable saved state and export/reopen round-trip according to **web** decisions | UNVERIFIED | Metadata inspection, reopen test, no fabricated fields |
| WEB-07 | Confirm explicitly saved-page inventory and selected proof scope; unsaved pages do not block export | UNVERIFIED | Browser workflow and generated page count |
| WEB-08 | Verify independent three-page cover/section-title/contents proof using approved web masters | OPEN | Actual output PDF and rendered visual inspection |
| WEB-09 | Test web cue language, manual highlighting, multi-page spans and interior-page behavior | UNVERIFIED | Representative English/Hebrew/mixed cases |
| WEB-10 | Run JS/CI/browser/PDF structural and visual regression tests | PARTIAL | Actual run results, SHA, PDF pages and screenshots |
| WEB-11 | Update web handoff, version/deployment register, and only web-app-specific specs after verified changes | OPEN | Links, version, commits and test evidence |

### Audit disposition of previously added legacy material

The prior handoff incorrectly labeled legacy production Rulebook and V3 migration/intake materials as governing web requirements. **That classification is withdrawn.** Their historical facts (including 63 cue records, 50 page records, color/duplex imposition, legacy font measurements, V2 method authority and proposed databases) are not web acceptance criteria. Earlier commits `be07b69`, `790a74f`, `fd3daec` added those interpretations; this revision supersedes them for the web project. Git history retains the audit trail, but active requirements must not rely on those entries.

## Development discipline

- Never describe source inspection as browser/PDF verification.
- Do not bump the app version for documentation-only edits.
- Do not ask the user to retest half-finished work; run the available tests and report blockers.
- Do not reuse outdated PDFs merely because they are present in Project attachments or Drive.
- Any newly discovered requirement must be tagged **WEB APPROVED**, **WEB PROPOSED**, **LEGACY REFERENCE**, or **UNRESOLVED** with provenance before implementation.
