# History 202 — cumulative image-quality update (2026-11-10)

Source repository main commit checked: 95902ee116b1bb392f851d2e5636ec75c8acb293.

## Scope
This ZIP is the **cumulative** image-only patch for image quality step 3, verified-source step 4, and new step 5 research. It therefore replaces the need to obtain both older ZIPs, provided none of those older corrections were independently modified afterwards.

- Previously completed step 3: 39 material metadata edits; 3 locally cropped/reused image files (law-17article.webp, authentic-2026-032.webp, verified-antimonopoly-context.webp).
- Previously completed step 4: 1 updated local period-1879-conscription-cartoon.webp illustration and new PDF-page-selector code/workflow (2 pages). The PDF page downloads have **NOT** yet been run in GitHub Actions.
- New step 5: 3 archive records identified, with dates, catalog references, and remaining page/rights review; separate read-only page-contact-sheet workflow for 続日本紀 巻15 (72 pages).
- No chat content, participant data, chapter data, design, or icons changed.

## Important installation point
The GitHub UI does not unpack ZIP files automatically. Extract this ZIP, then upload the resulting files into the matching repository paths while preserving directory structure. The ZIP files listed here correspond to changes in `history202/` and `.github/workflows/`, not a complete repository checkout.

After upload:
1. Check GitHub Actions → `History 202 verified document pages` → `Run workflow`. It is supposed to fetch PDF p.3 for the 1939 printed copy of 十七条憲法, and PDF p.2 for the 1873 government edition of 徴兵令. Check **actual** run logs and inspect output images. A successful metadata update does not substitute for visual verification.
2. To locate the exact 743 entry, Actions → `History 202 review Konden original pages` → `Run workflow`; then download its artifact with contact-*.jpg and numbered page-*.jpg. This review job cannot change app images.
3. For 1485/1486 original diary see `source_review_candidates_20261110.json`: original fascicles 101 and 102 identified but the relevant entry and reproduction rights remain unverified.
4. For the 1947 Antimonopoly Law the original archive record was located, but no verified original image has been installed.

## Safety
- The PDF page review job has `contents: read` and does not write application data.
- The two-page replacement workflow checks Commons rights, image type/size and PDF page parameters; failure leaves existing WebP untouched.
- For current or future GitHub main revisions that changed `history202/real-materials.json` after the stated base commit, compare before replacing to avoid rollbacks.

## Not complete
This patch is not a certification of all 256 images. All 256 local image paths are present and readable in the supplied historical work copy; authenticity, suitability, and reproduction terms are not final for every record.
