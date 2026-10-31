# Leader's Companion V3

Browser-based, modular workbench for preparing synagogue service PDFs. V2 remains untouched.

## Stage 1 — service extraction (prototype)

Open `index.html` in a browser. Choose a siddur PDF, enter the service name and code, then enter physical PDF page numbers (for example `4-9, 13, 12`). Generate an extracted service PDF and download its JSON page manifest.

All processing occurs locally in the browser; the PDF is not uploaded. The app loads pdf-lib from a CDN, so an internet connection is required. This is an untested prototype: review exported pages before relying on it.

The page manifest assigns a stable working ID to each output page and records its original physical PDF page. Printed siddur page numbers are not mapped yet.

## Architecture

1. Extract pages into a service PDF.
2. Standardize page geometry, add a removable registration margin and visible working identifiers.
3. Edit and save role highlights.
4. Place reusable blocks: status, Rabbi/Lay instructions, melody QR codes.
5. Assemble a finished book with a fixed header (service name and original siddur page number), removing production marks.

Each stage will retain its editable configuration and export a testable PDF. Publication variants are saved presets, not separate engines. Avoid cumulative flattening and keep all coordinates in a standardized page reference system.

## Limitations

Stage 1 does not yet add a visible page identifier or registration marks. Physical PDF page numbering starts at 1. Encrypted or very large PDFs may fail in the browser. No original PDFs or recordings are stored in this repository.
