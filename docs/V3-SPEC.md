# Leader's Companion V3 — Working Specification

## Implementation order (current priority)
1. **Layout first.** Finalize US Letter facing-page template geometry, mirrored binding/outside margins, bounding boxes, inner safe padding, minimal external gutters, page header (service name spanning to page-number region; corner block equal in height to page title plus instructions), main siddur and companion columns, and full-width bottom status bar. Verify blank template visually before proceeding.
2. **Siddur placement second.** Extract original scanned siddur prayer content without retypesetting Hebrew; exclude printed page numbers and unrelated source headings; fit and enlarge the original content proportionally inside the safe area, align to top, avoid clipping, and visually validate actual placement on facing pages.
3. **Metadata third.** Store original page number, service name, page title, instructions and related page information outside the extracted prayer PDF; renderer draws metadata into template regions.

## Deferred: role highlights and reading sequence
- Show **facing pages** in the interactive editor.
- User selects a **role from a dropdown** with **Add role**; roles are extensible, not limited to Primary/Secondary. Keep stable role IDs.
- User marks passages directly on the scanned siddur preview, with multiple highlight regions per passage, visual edit/delete/undo. Store highlights in a **separate siddur-specific data file**, not baked into extracted prayer PDFs.
- Store stable passage/highlight IDs, role IDs, source-page-relative normalized geometry, and ordering within the siddur. The renderer transforms highlights together with the prayer image; OCR and word recognition are not prerequisites.
- **Reading numbers are global across the entire siddur**, not per prayer, page or service. Calculate displayed sequence numbers from the siddur's ordered pages and passages; adding, removing, or reordering a page automatically renumbers following passages. Stable highlight IDs do not change.
- Distinguish printed original siddur page numbers (metadata) from global reading sequence numbers.
- Do not implement this deferred functionality before the layout, siddur placement, and metadata phases are completed.

## Current design cautions
- Template region dimensions and padding are proposals until validated in actual rendered PDF.
- The reference scanned page crop is calibrated manually; arbitrary-page ink segmentation and enlargement verification are not yet established.
- No claim of successful visual or live deployment testing without actual verification.

## Language orientation and bottom cues (approved design direction)
- Across **all scanned siddurim**, enforce a consistent **English-left / Hebrew-right** orientation for bilingual reading and navigation cues, regardless of the original scan's arrangement.
- This language-side convention is independent of **physical facing-page mirroring** for binding. Mirroring must not swap English and Hebrew.
- Investigate reinstating **Begin / End** reading cues in the space between the siddur-content region and the bottom status bar. Proposed geometry: one full-width cue band with internally separated English-left and Hebrew-right zones on both facing pages; dimensions and exact content remain to be approved.
- Preserve source Hebrew as scanned; do not infer that arbitrary source PDF columns can be rearranged without an explicit extraction/composition step.

### Begin/End placement (approved)
- **Begin cue always faces the outside margin; End cue always faces the binding/gutter.** This is a physical-page rule and takes precedence over any fixed left/right cue positioning.
- On the **left-hand page**: Begin at left (outside), End at right (binding).
- On the **right-hand page**: End at left (binding), Begin at right (outside).
- The English-left / Hebrew-right convention applies to language presentation, **not** to a fixed Begin/End cue location. The two rules must not be conflated.
