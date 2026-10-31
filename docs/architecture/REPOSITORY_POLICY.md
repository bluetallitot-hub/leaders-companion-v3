# V3 repository structure and synchronization policy

GitHub is authoritative for web code, approved production assets, and deployable data. Google Drive **V3 Web** is the intended mirror and review/archive workspace, not an independently authoritative code branch.

Allowed top-level directories: `app/`, `assets/`, `data/`, `templates/`, `docs/`, `scripts/`, `tests/`, `.github/`. Existing root files are **grandfathered for audit**; no new root files unless explicitly approved (e.g. README, LICENSE, package manifests, deployment configuration).

| Path | Purpose |
| --- | --- |
| app/html, app/css, app/js, app/images | Web interface |
| assets/audio, assets/siddur, assets/graphics | Production media |
| data/services, data/pages, data/roles | Structured metadata |
| templates/pdf | Production PDF templates |
| docs/master-template | Approved visual PDF master |
| docs/architecture | Architecture and policy |
| scripts | Build, verification and sync |
| tests | Automated tests |
| .github/workflows | CI, deployment and future sync |

Rules: (1) one canonical location per asset; (2) never silently overwrite or delete; (3) quarantine questionable legacy files for review; (4) preserve stable IDs; (5) review PDF master before changing generator geometry; (6) compare file hashes and record Git commit SHAs during synchronization; (7) alert on Drive edits and conflicts; (8) do not claim continuous synchronization until an authenticated workflow has run and been verified.

**Current status:** folder skeleton exists in GitHub and Drive. Automatic mirroring, conflict detection, and manifest generation are **not yet configured**. GitHub directories are tracked by README placeholders, not empty folders.
