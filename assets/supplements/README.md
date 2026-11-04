# Persistent Supplement Library (V3.171)

Published supplements live in `assets/supplements/`. The authoritative editable versions remain in the [Leader's Companion Google Drive Supplements folder](https://drive.google.com/drive/folders/14xM6CeA0oDHAbnWWCo6W3sCd5-R8OVq1).

## Service intake

The intake reads `library.json`, suggests candidates for each `SUP-...` reference, and requires explicit confirmation by checkbox or selection. English, Hebrew, and Ladino can share one physical page. A single `SUP-Name` refers to exactly one physical page; `SUP-Name-1`, `SUP-Name-2`, etc. are distinct one-page records. No page is silently split or duplicated.

Sermon, Remarks, and Notices are recurring replaceable positions; if no file is chosen, the generator reserves a page. Duplex spacers are generated as necessary so a replaceable supplement can be swapped independently without changing the rest of the service.

## Adding and publishing

The intake's **Save to my supplement library** stores a one-page PDF in browser IndexedDB for future local use. This is durable in that browser profile, but **not** a GitHub publication or a cloud backup. Local entries are labeled publication-pending and can be exported individually as PDFs with a pending JSON manifest. To publish across devices, commit the PDFs to this folder and add the corresponding entries to `library.json` (or ask ChatGPT to publish the files). GitHub Pages is read-only and cannot directly accept unauthenticated uploads.

## Source caveats

The source Google Drive folder contains two distinct `SUP-Remarks` Google Docs, preserved as `SUP-Remarks-A` and `SUP-Remarks-B` rather than silently choosing one. `SUP-Children.pdf` currently exports as **two pages**, so its catalog entry is flagged `needs-split` and is excluded from one-page matching until separately numbered source pages are prepared. The source files are not altered by this library.
