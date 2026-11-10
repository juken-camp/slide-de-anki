# History202 – Stage 7 source-validation patch (2026-11-10)

## GitHub safety
GitHub main at start: `37780e9bef4b1f6e54cba009fa6f6baa2a453d4f`.
`history202/real-materials.json` at that time had Git blob hash `a3f03ddf1c88846ebd198f3431b4f2fc084ddc67`, identical to this patch's starting manifest.
If the file changed after that, compare newer version before replacing it. This patch never edits `chapters.json`, 202 terms, chat UI, icons, or image paths.

Stage 6's three cropped image files are already on GitHub main, as proven by exact matching Git blob hashes. Do not reupload those.

## What is genuinely new
1. Four existing image records now have researched Commons usage rights and provenance (Hokusai, current Byodoin, two uses of 1946 zaibatsu photo). The images themselves are unchanged; current photo / 1947 law are clearly distinguished. The small expansion of Yamashiro explanation explains who gathered and the 1485–1486 timeline.
2. Source candidate research documents Commons PDF volumes and correct dated entries of 743 Konden (72 PDF pages) and 1485/1486 Yamashiro Uprising (69+68 PDF pages).
3. Two new workflow files:
   - `History 202 verified document pages`: attempts two previously visually checked pages (1873 conscription, 1939 manuscript of first article), fetching and saving only successful replacements. Requires existing `history202/curate_original_sources.py` and `curated_sources_verified_pages_20261110.json` on GitHub, confirmed before patch.
   - `History 202 review primary document pages`: runs the new READ-ONLY `history202/review_primary_documents.py` to generate review thumbnails for three old primary records. This does not change published images. The exact pages of the historic legal provision and dated meetings still need selection from the generated sheets before replacements.
4. Added `step7_field_changes_20261110.json` and `step7_validation_20261110.json`.

## Recommended next step
Upload files in this ZIP **preserving paths**. Open Actions > `History 202 verified document pages` > Run workflow. Confirm output `Updated: 2/2` and inspect live images. Then Actions > `History 202 review primary document pages` > Run workflow (`all`), download the generated artifact with numbered page sheets. On the dated pages, identify the original passage from the full-size image before publishing it. If any fetch fails, the existing app image remains unchanged.

## History source dates
The record of the Yamashiro meeting at Byodo-in is **1486-02-13**, as transcribed in Waseda University's 2025 Japanese-history exam (https://www.waseda.jp/inst/admission/assets/uploads/2025/05/16_2025_ippan_nihonshi.pdf) and Niigata University's exam (https://www.niigata-u.ac.jp/wp-content/uploads/2025/08/3_r7mondai.pdf). An online study page has a conflicting paraphrase of January 13; do not adopt that typo.

These are source research and safe release workflows, **not** certification that all 256 original historical sources are perfect.
