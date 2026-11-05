# Prayer Instruction Library (V1)

This library stores reusable instructions keyed to a **canonical prayer**, independently of the service cue CSV and the virgin siddur PDF.

## Resolution

1. Resolve the cue's prayer identifier/title against `prayer_id`, `canonical_title`, then `aliases` (case-insensitive).
2. Resolve `{prayer_name}` from the canonical title or an explicit service-level display override.
3. Resolve `{page_name}` from the **verified output-service page map** (not an unverified original-PDF page number). The display name may be a printed number or an approved label.
4. Substitute named tokens only. Missing tokens block insertion and require review; never leave literal placeholders in the published PDF.
5. Do not auto-insert an instruction unless its `approval_status` is `approved` and `enabled` is true. Flag missing or ambiguous matches.
6. Place the resolved instruction in the **new service document's instruction layer**, not the source siddur. Preserve the template ID, resolved values, and source cue ID in the destination metadata for later editing.

Example template: `Please rise for the {prayer_name} on page {page_name}.`

This is the first database foundation, **not yet wired into the intake or facing-page editor**. Existing instruction sources have not been migrated or overwritten. The Amidah wording is user-supplied but marked proposed pending approval.
