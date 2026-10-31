# Leader's Companion V3

A modular, browser-based workbench for producing standardized synagogue service pages. V2 remains untouched.

## Stage 1 — one siddur page

The first goal is **one source PDF page → one standardized PDF page with a new bold red page number**.

Open `index.html` in a browser. Choose a source siddur PDF, enter the **physical PDF page** (starting at 1), and specify the new printed page number. Adjust the top, bottom, left and right crop percentages. Generate a preview, inspect it, then download the one-page PDF and its settings JSON.

- Output is US Letter by default, with an A4 option.
- The cropped original page is scaled proportionally and centered inside fixed margins.
- The new printed page number appears in the top-right header area.
- Cropping removes original content **only when the selected crop boundary excludes it**; manually verify that prayer text is preserved and the old printed number is excluded.
- Processing happens locally in the browser. The source PDF is not uploaded. pdf-lib is loaded from a CDN.

This is a prototype, **not yet browser-tested against the actual siddur**. The next improvement is a visual crop editor and a confirmed canonical output size based on a real source page.

## Later stages

Add a removable registration margin with working page IDs; role highlighting; configurable status, instruction and melody QR blocks; then book assembly with a locked service header. Each stage should save editable settings and export a testable PDF.

Publication variants will be presets of components rather than separate production engines.


## Stage 1 page-heading and language metadata (design requirement)

- Detect the source page's heading/title, preserve its exact text and source bounding box as page metadata, and remove it from the standardized content image only after confirming that it is not prayer text.
- Store detected languages as a **list**, with optional primary language and script information; support mixed Hebrew/English pages and Ladino in Hebrew or Latin script.
- Keep heading extraction, language detection, and heading removal independently reviewable in the side-by-side original/processed viewer. The reviewer can correct text, adjust removal bounds, or disable removal.
- Do not destroy source content: retain original source reference, editable settings, and confidence/review status. The heading may later be rendered as a reusable header/section block.
- Distinguish proposed metadata from verified metadata; scanned pages may require OCR and manual correction. Never treat OCR as infallible.
