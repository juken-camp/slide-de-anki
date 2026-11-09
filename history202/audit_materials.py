#!/usr/bin/env python3
"""Offline audit for all 31 chapters and 256 media records; no network calls."""
import collections
import csv
import hashlib
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent
materials = json.loads((ROOT/'real-materials.json').read_text(encoding='utf-8'))['items']
chapters = json.loads((ROOT/'chapters.json').read_text(encoding='utf-8'))['chapters']
index = json.loads((ROOT/'local-images.json').read_text(encoding='utf-8'))
review_path = ROOT/'source-review-evidence-20261109.json'
download_report_path = ROOT/'image-download-report.json'
download_report = json.loads(download_report_path.read_text(encoding='utf-8')) if download_report_path.exists() else {}
source_reviews = ({i['id']:i for i in json.loads(review_path.read_text(encoding='utf-8'))['records']}
                  if review_path.exists() else {})
all_ids = {m['id'] for c in chapters for m in c['messages']}
chapters_by_id = {c['id']:c for c in chapters}
files_seen = collections.defaultdict(list)
rows = []
for item in materials:
    path = REPO/index[item['id']] if item['id'] in index else ROOT/'authentic_images'/(item['id']+'.webp')
    local = False
    sha = ''
    actual_size = ''
    if path.is_file():
        try:
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                if image.width >= 100 and image.height >= 80:
                    local = True
                    actual_size = f'{image.width}x{image.height}'
                    sha = hashlib.sha256(path.read_bytes()).hexdigest()
                    files_seen[sha].append(item['id'])
        except (OSError, ValueError):
            pass
    chapter = chapters_by_id.get(item['chapter'], {})
    chapter_message_ids = {m['id'] for m in chapter.get('messages', [])}
    anchor_valid = item['after'] in chapter_message_ids
    license_status = item.get('licenseStatus', '')
    rows.append({
        'chapter': item['chapter'],
        'chapter_title': chapter.get('title', ''),
        'id': item['id'],
        'caption': item.get('caption', ''),
        'local_image_valid': 'YES' if local else 'NO',
        'local_file': str(path.relative_to(REPO)),
        'resolution': actual_size,
        'sha256': sha,
        'anchor_ok': 'YES' if anchor_valid else 'NO',
        'sourceUrl': item.get('sourceUrl', ''),
        'imageUrl': item.get('image', ''),
        'license': item.get('license', ''),
        'licenseStatus': license_status,
        'credit': item.get('credit', ''),
        'source_page_checked_now': 'YES' if item['id'] in source_reviews else 'NO',
        'source_page_findings': source_reviews.get(item['id'],{}).get('sourceContents',''),
        'manual_subject_review': 'NEEDED' if item['id'] not in source_reviews else 'SOURCE_PAGE_ONLY',
        'manual_license_review': 'NO' if license_status == 'confirmed' else ('PARTIAL' if license_status == 'source_page_verified' else 'YES'),
        'note': ('Saved copy verified only; subject must be visually checked' if local else ('Source page reviewed; no image bytes fetched' if item['id'] in source_reviews else 'No local copy; image URL not downloaded/tested')),
    })

summary = {
    'scope': '256-record image integrity and source-rights audit; downloaded image subjects still require human visual review',
    'chapters': len(chapters),
    'media_records': len(materials),
    'source_pages_verified_this_turn': len(source_reviews),
    'new_files_downloaded_this_turn': download_report.get('newly_saved_this_run', 0),
    'valid_local_files': sum(row['local_image_valid']=='YES' for row in rows),
    'no_valid_local_file': sum(row['local_image_valid']=='NO' for row in rows),
    'valid_anchors': sum(row['anchor_ok']=='YES' for row in rows),
    'invalid_anchors': [row['id'] for row in rows if row['anchor_ok']=='NO'],
    'different_local_image_hashes': len(files_seen),
    'byte_identical_image_groups': [ids for ids in files_seen.values() if len(ids)>1],
    'license_status_counts': dict(collections.Counter(x.get('licenseStatus','') for x in materials)),
    'license_explicitly_confirmed': sum(x.get('licenseStatus') == 'confirmed' for x in materials),
    'source_page_only_verified': sum(x.get('licenseStatus') == 'source_page_verified' for x in materials),
    'rights_not_explicitly_confirmed': sum(x.get('licenseStatus') != 'confirmed' for x in materials),
    'warning': 'File readability does not prove the correct historical subject, source link health, or permission to redistribute.',
}
with (ROOT/'image-audit-20261109.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
(ROOT/'image-audit-summary-20261109.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
