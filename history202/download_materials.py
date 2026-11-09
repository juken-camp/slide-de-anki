#!/usr/bin/env python3
"""Fetch REAL historical-source images into history202/authentic_images.

Resumable, never fabricates images, and never treats a valid local file as missing.
A successful byte download confirms file readability, NOT subject accuracy or reuse rights.
The image manifest's existing source/rights information is retained unchanged.
"""
import collections
import concurrent.futures
import hashlib
import io
import html
import re
import json
import os
import pathlib
import random
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = pathlib.Path(__file__).resolve().parent
ASSETS = ROOT / 'authentic_images'
ASSETS.mkdir(parents=True, exist_ok=True)
ITEMS = json.loads((ROOT / 'real-materials.json').read_text(encoding='utf-8'))['items']
BATCH = max(1, min(len(ITEMS), int(os.environ.get('HISTORY202_BATCH', str(len(ITEMS))))))
WORKERS = max(1, min(2, int(os.environ.get('HISTORY202_WORKERS', '1'))))
DELAY = max(4, float(os.environ.get('HISTORY202_DELAY', '6.0')))
MAX_BYTES = 20_000_000
REQUEST_TIMEOUT = 40
USER_AGENT = 'JukenCampHistoryEducation/1.1 (educational archival images; github.com/juken-camp/slide-de-anki)'

# One global request gap across parallel workers; do not hammer Commons.
_lock = threading.Lock()
_next_request = 0.0


def paced_request(url, allow_json=False):
    global _next_request
    with _lock:
        now = time.monotonic()
        wait = max(0.0, _next_request - now)
        _next_request = max(now, _next_request) + DELAY + random.uniform(0, 0.4)
    if wait:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': ('application/json,*/*;q=0.5' if allow_json else 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'),
        'Referer': 'https://commons.wikimedia.org/',
    })
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        mime = resp.headers.get('Content-Type', '').split(';')[0].strip().lower()
        if mime.startswith('text/') or mime == 'application/pdf' or (mime == 'application/json' and not allow_json):
            raise ValueError(f'not a supported raster image: {mime}')
        length = resp.headers.get('Content-Length')
        if length and int(length) > MAX_BYTES:
            raise ValueError('image exceeds 20 MB')
        data = resp.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('image exceeds 20 MB')
        return data


def valid(path):
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            return image.width >= 100 and image.height >= 80
    except (OSError, ValueError, UnidentifiedImageError):
        return False


def commons_filename(item):
    source = item.get('sourceUrl', '')
    parsed = urllib.parse.urlparse(source)
    if parsed.hostname != 'commons.wikimedia.org':
        return None
    if '/wiki/File:' not in parsed.path:
        return None
    name = urllib.parse.unquote(parsed.path.split('/wiki/File:', 1)[1]).replace(' ', '_')
    return name if name else None


def commons_metadata(item):
    """Get the canonical Wikimedia thumbnail plus license, when available.

    A successful metadata check is NOT a guarantee that a particular caption is accurate.
    """
    name = commons_filename(item)
    if not name:
        return None
    api = ('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'formatversion': 2,
        'prop': 'imageinfo', 'iiprop': 'url|extmetadata',
        'iiurlwidth': 720, 'titles': 'File:' + name,
    }))
    try:
        raw = paced_request(api, allow_json=True)
        res = json.loads(raw)
        page = res['query']['pages'][0]
        infos = page.get('imageinfo') or []
        if not infos:
            return {'error': 'Wikimedia Commons file does not exist or lacks imageinfo'}
        info = infos[0]
        extra = info.get('extmetadata') or {}
        license_text = html.unescape(re.sub(r'<[^>]*>', '', extra.get('LicenseShortName', {}).get('value',''))).strip()
        source_url = info.get('descriptionurl', item.get('sourceUrl',''))
        return {'license': license_text, 'thumb': info.get('thumburl',''),
                'original': info.get('url',''), 'source': source_url,
                'restricted': extra.get('Restrictions', {}).get('value', '')}
    except Exception as exc:
        return {'error': type(exc).__name__ + ': ' + str(exc)[:160]}


def licensed_for_distribution(metadata, item):
    """Conservative rights gate: no unknown-license downloads in the patch."""
    if item.get('iiifManifest'):
        return (item.get('licenseStatus') in ('confirmed', 'source_page_verified')
                and item.get('license', '').casefold().startswith('cc by-sa 4.0')
                and item['iiifManifest'].startswith('https://codh.rois.ac.jp/pmjt/book/'))
    if not metadata or metadata.get('error') or metadata.get('restricted'):
        return False
    name = metadata.get('license', '').strip().casefold()
    return (name.startswith(('cc by ', 'cc by-sa ', 'cc0 ', 'public domain',
                             'pdm ', 'creative commons zero', 'cc-zero'))
            or name in ('cc0', 'cc-by', 'cc-by-sa', 'pd', 'public domain mark'))


def iiif_image_candidates(item):
    """Resolve a real scan from a known CC BY-SA source's IIIF manifest.

    Supports IIIF Presentation v2/v3. Do not scrape arbitrary third-party images.
    Canvas indexes are 0 based; title or text matching still requires manual review.
    """
    url = item['iiifManifest']
    raw = paced_request(url, allow_json=True)
    manifest = json.loads(raw)
    canvases = ((manifest.get('sequences') or [{}])[0].get('canvases') or
                manifest.get('items') or [])
    if not canvases:
        raise ValueError('IIIF manifest contains no canvas')
    pos = min(len(canvases) - 1, max(0, int(item.get('iiifPageIndex', 1))))
    canvas = canvases[pos]
    if 'images' in canvas:
        res = (canvas.get('images') or [{}])[0].get('resource') or {}
    else:
        apages = canvas.get('items') or []
        anno = apages[0].get('items', [{}])[0] if apages else {}
        res = anno.get('body') or {}
    services = res.get('service') or []
    if isinstance(services, dict):
        services = [services]
    urls = []
    for service in services:
        if not isinstance(service, dict):
            continue
        sid = service.get('@id') or service.get('id') or ''
        if sid.endswith('/info.json'):
            sid = sid[:-10]
        if sid.startswith('http://'):
            sid = 'https://' + sid[7:]
        if not sid.startswith('https://'):
            continue
        base = sid.rstrip('/')
        urls.extend([f'{base}/full/1000,/0/default.jpg',
                     f'{base}/full/800,/0/default.jpg',
                     f'{base}/full/720,720/0/default.jpg'])
    rid = res.get('@id') or res.get('id') or ''
    if rid.startswith('https://') and rid.lower().split('?')[0].endswith(('.jpg','.jpeg','.png','.webp')):
        urls.append(rid)
    if not urls:
        raise ValueError('IIIF canvas has no usable raster image service')
    return list(dict.fromkeys(urls))


def candidates(item, metadata=None):
    if item.get('iiifManifest'):
        return iiif_image_candidates(item)
    urls = []
    if metadata and not metadata.get('error'):
        urls.extend([metadata.get('thumb',''), metadata.get('original','')])
    name = commons_filename(item)
    if name:
        encoded = urllib.parse.quote(name, safe='()!$&\'*,;=:@-_.~')
        base = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encoded
        md5 = hashlib.md5(name.encode('utf-8')).hexdigest()
        thumb_base = f'https://upload.wikimedia.org/wikipedia/commons/thumb/{md5[0]}/{md5[:2]}/{encoded}/'
        if name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
            urls += [thumb_base + f'{size}px-{encoded}' for size in (720, 360)]
        urls += [f'https://upload.wikimedia.org/wikipedia/commons/{md5[0]}/{md5[:2]}/{encoded}']
        urls += [base + '?width=720', base + '?width=360']
    urls.append(item.get('image', ''))
    return list(dict.fromkeys(x for x in urls if x.startswith('https://')))


def decode_and_save(raw, target):
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        if im.width < 100 or im.height < 80:
            raise ValueError('image too small (<100x80)')
        if im.width * im.height > 80_000_000:
            raise ValueError('image dimensions too large')
        im = ImageOps.exif_transpose(im)
        im.thumbnail((1400, 1400))
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGB')
        temp = target.with_suffix('.webp.part')
        try:
            im.save(temp, format='WEBP', quality=84, method=5)
            if not valid(temp):
                raise ValueError('saved file failed integrity check')
            temp.replace(target)
        finally:
            if temp.exists():
                temp.unlink()


def fetch_unique(item):
    errors = []
    metadata = None if item.get('iiifManifest') else commons_metadata(item)
    if not licensed_for_distribution(metadata, item):
        if not item.get('iiifManifest') and not commons_filename(item):
            return None, 'No confirmed source image redistribution permission'
        if metadata and metadata.get('error'):
            return None, 'Could not check Commons license: ' + metadata['error']
        return None, 'Reuse license not confirmed or has restrictions'
    target = ASSETS / (item['id'] + '.webp')
    try:
        urls = candidates(item, metadata)
    except Exception as exc:
        return None, 'Could not resolve IIIF image: ' + str(exc)[:140]
    for url in urls:
        for retry in range(2):
            try:
                raw = paced_request(url)
                decode_and_save(raw, target)
                return (target, None)
            except urllib.error.HTTPError as exc:
                errors.append(f'HTTP {exc.code} at {urllib.parse.urlparse(url).hostname}')
                if exc.code in (429, 503):
                    wait = exc.headers.get('Retry-After')
                    try:
                        seconds = min(180, max(30, int(wait)))
                    except (TypeError, ValueError):
                        seconds = min(150, 50 * (retry + 1))
                    time.sleep(seconds)
                elif exc.code in (403, 404, 410):
                    break
                else:
                    time.sleep(3 * (retry + 1))
            except Exception as exc:
                errors.append(type(exc).__name__ + ': ' + str(exc)[:95])
                if isinstance(exc, (ValueError, UnidentifiedImageError)):
                    break
                time.sleep(2 * (retry + 1))
    return (None, '; '.join(errors[-5:]) or 'All source image URLs failed')


def audit_mapping():
    return {item['id']: f'history202/authentic_images/{item["id"]}.webp'
            for item in ITEMS if valid(ASSETS / (item['id'] + '.webp'))}


def run():
    items_by_source = collections.defaultdict(list)
    for item in ITEMS:
        if not valid(ASSETS / (item['id'] + '.webp')):
            items_by_source[item.get('sourceUrl') or item['image']].append(item)
    groups = list(items_by_source.values())
    # Start with the locally broken 令義解 family and other checked-licensed sources.
    # Otherwise a long Commons retry queue could run before the highest-priority fix.
    groups.sort(key=lambda group: (
        0 if group[0].get('iiifManifest') else 1,
        0 if group[0].get('licenseStatus') in ('confirmed', 'source_page_verified') else 1,
        group[0].get('chapter', 99),
        group[0]['id']))
    selected = []
    size = 0
    for group in groups:
        if size + len(group) > BATCH and selected:
            break
        selected.append(group)
        size += len(group)
    print(f'Already valid: {len(ITEMS)-sum(map(len, groups))}/{len(ITEMS)}; '
          f'pending: {sum(map(len, groups))}; selected: {size}; source requests: {len(selected)}', flush=True)
    failures = {}
    attempts = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        jobs = {pool.submit(fetch_unique, group[0]): group for group in selected}
        for k, future in enumerate(concurrent.futures.as_completed(jobs), 1):
            group = jobs[future]
            try:
                target, error = future.result()
            except Exception as exc:
                target, error = None, type(exc).__name__ + ': ' + str(exc)
            if target:
                for item in group[1:]:
                    dest = ASSETS / (item['id'] + '.webp')
                    shutil.copyfile(target, dest)
                for item in group:
                    attempts[item['id']] = 'saved'
            else:
                for item in group:
                    attempts[item['id']] = 'failed'
                    failures[item['id']] = error
            print(f'{k}/{len(selected)} {group[0]["id"]} ({len(group)} uses): '
                  f'{"OK" if target else error}', flush=True)

    mapping = audit_mapping()
    remaining = [item for item in ITEMS if item['id'] not in mapping]
    report = {
        'total': len(ITEMS),
        'downloaded': len(mapping),
        'missing': len(remaining),
        'newly_saved_this_run': sum(1 for k, v in attempts.items() if v == 'saved' and k in mapping),
        'attempted_this_run': len(attempts),
        'failed': [{'id': item['id'], 'chapter': item['chapter'], 'caption': item['caption'],
                    'reason': (failures.get(item['id']) or 'Not attempted in this run'),
                    'sourceUrl': item['sourceUrl']}
                   for item in remaining],
        'license_caution': 'Only Commons files with resolved Public Domain/CC BY/CC BY-SA/CC0 metadata and specifically verified CODH IIIF files are saved. Keep credits and share-alike notice.',
        'accuracy_caution': 'Image content and historical attribution require human review.',
    }
    (ROOT / 'local-images.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (ROOT / 'image-download-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Valid local: {len(mapping)}/{len(ITEMS)}, missing: {len(remaining)}', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
