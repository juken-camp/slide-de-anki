# STEP 6 applied to GitHub main (2026-11-10)

GitHub `main` read after last step-5 upload: `2fb206491e9edfd4d5676fd0e486c0a9d4a3ebe2`.
Confirmed `history202/real-materials.json` Git blob SHA was `d83afeb4f7e260172ec785a8aabc6a2b221327fc`, exactly identical to the local step-5 source. The full step-5 patch was uploaded after the previous assistant message began. Therefore this ZIP contains only NEW step-6 changes plus TWO missing workflows; no old step-3/4/5 assets are included.

## New step-6 work
- 3 changed WebP files: `term-cover-ch25-05.webp` (1915 China demands political cartoon), `h02-real-06.webp` (National Museum Haniwa), `h09-real-07.webp` (1774 Kaitai Shinsho). All are **cropped originals**, not generated historical pictures.
- The manifest has historically grounded new captions, creator and license info for the three (Luther Daniels Bradley's US-public-domain cartoon, Kakidai's 2015 CC BY-SA 4.0 haniwa photograph with crop credit, and a Japanese public-domain 1774 Kaitai Shinsho reproduction); one erroneous 'draft legal text' classification for the 1946 workers' photograph corrected.
- Five duplicate image records had rights labels reconciled with exactly identical image bytes and the same original source URLs; no unverified rights were upgraded.
- The original manuscript pages for the 743 Konden, the 1485 Yamashiro uprising, and the 1947 Antimonopoly Law remain **unverified** and therefore not replaced.

## Uploading
1. Unzip this ZIP; upload its contained files to the corresponding paths in GitHub `main` (retain `.github/workflows/`). A ZIP upload is NOT automatically unpacked by GitHub.
2. `history202/real-materials.json` is a full manifest file based on the STEP-5 GitHub blob SHA above. If GitHub updates that file in the meantime, compare before overwriting to prevent rollback.
3. `History 202 verified document pages` and `History 202 review Konden original pages` are previously written workflows **absent from GitHub main** at the last check; this ZIP contains both. The first will attempt two verified PDF page updates only when run. The second makes a read-only contact sheet of pages from the 1657 printed Shoku Nihongi Vol 15. The workflows were not executed here.
4. Existing conversation scripts, chat layout, icons, and `chapters.json` remain untouched.

## Review status
256 manifest IDs, placement anchors and local image references are intact; all 256 available local WebP images were validated. This is **not** final primary-source certification for all images.
