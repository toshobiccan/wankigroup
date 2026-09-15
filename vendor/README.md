# Vendored libraries

Third-party code loaded by the browser at runtime. Kept in the repo (instead of a CDN) so the app works offline and inside the iOS/Windows packages. Do not edit these files; replace them with a new pinned version and update this table.

| File | Library | Version | Licence | Source |
| --- | --- | --- | --- | --- |
| `jszip.min.js` | JSZip | 3.10.1 | MIT | https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js |
| `sql-wasm.js`, `sql-wasm.wasm` | sql.js (SQLite compiled to WebAssembly) | 1.10.3 | MIT (SQLite itself is public domain) | https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/ |
| `fzstd.umd.js` | fzstd (zstd decompression) | 0.1.1 | MIT | https://cdn.jsdelivr.net/npm/fzstd@0.1.1/umd/index.js |

None of these are AGPL. No code from the Anki project itself is used.
