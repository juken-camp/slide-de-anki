#!/usr/bin/env python3
"""Download genuine historical images conservatively, preserving existing verified files."""
import io, json, os, pathlib, random, time, urllib.error, urllib.parse, urllib.request
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent
ASSETS = ROOT / 'authentic_images'
ASSETS.mkdir(exist_ok=True)
ITEMS = json.loads((ROOT / 'real-materials.json').read_text(encoding='utf-8'))['items']
BATCH = max(1, min(50, int(os.environ.get('HISTORY202_BATCH', '5'))))
DELAY = max(2.0, float(os.environ.get('HISTORY202_DELAY', '5')))

def candidates(item):
    urls = [item['image']]
    source = item.get('sourceUrl', '')
    if source.startswith('https://commons.wikimedia.org/wiki/File:'):
        name = urllib.parse.unquote(source.split('/wiki/File:', 1)[1])
        for width in (640, 400):
            urls.append('https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(name) + '?width=' + str(width))
    return list(dict.fromkeys(urls))

def valid(path):
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False

def fetch(item):
    dest = ASSETS / (item['id'] + '.webp')
    errors = []
    for url in candidates(item):
        for attempt in range(2):
            try:
                time.sleep(DELAY + random.uniform(0, 1.5))
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'JukenCampHistoryEducation/1.0 (educational historical materials; contact via github.com/juken-camp/slide-de-anki)',
                    'Accept': 'image/webp,image/png,image/jpeg,image/*'})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    if int(resp.headers.get('Content-Length', '0')) > 18000000:
                        raise ValueError('file too large')
                    raw = resp.read(18000001)
                if len(raw) > 18000000:
                    raise ValueError('file too large')
                with Image.open(io.BytesIO(raw)) as im:
                    im.load()
                    if im.width < 100 or im.height < 80:
                        raise ValueError('image too small')
                    if im.width * im.height > 70000000:
                        raise ValueError('image too large')
                    im.thumbnail((1400, 1400))
                    if im.mode not in ('RGB', 'RGBA'):
                        im = im.convert('RGB')
                    tmp = dest.with_suffix('.tmp')
                    im.save(tmp, 'WEBP', quality=84, method=5)
                    tmp.replace(dest)
                return None
            except urllib.error.HTTPError as e:
                errors.append(f'HTTP {e.code}')
                if e.code == 429:
                    retry = e.headers.get('Retry-After', '')
                    try: wait = min(120, max(30, int(retry)))
                    except ValueError: wait = 45 * (attempt + 1)
                    print(f'Rate limited; waiting {wait}s', flush=True)
                    time.sleep(wait)
                elif e.code in (403, 404):
                    break
            except Exception as e:
                errors.append(type(e).__name__ + ': ' + str(e)[:100])
    return '; '.join(errors[-3:]) or 'Unknown error'

if __name__ == '__main__':
    pending = [i for i in ITEMS if not valid(ASSETS / (i['id'] + '.webp'))]
    print(f'Already present: {len(ITEMS) - len(pending)}; pending: {len(pending)}; batch: {BATCH}', flush=True)
    attempted = {}
    for idx, item in enumerate(pending[:BATCH], 1):
        error = fetch(item)
        attempted[item['id']] = error
        print(f'{idx}/{min(BATCH,len(pending))} {item["id"]}: {"saved" if error is None else error}', flush=True)
    mapping = {i['id']: str((ASSETS / (i['id'] + '.webp')).relative_to(ROOT.parent)) for i in ITEMS if valid(ASSETS / (i['id'] + '.webp'))}
    failures = [{'id': i['id'], 'error': attempted.get(i['id']) or 'Not attempted in this batch'} for i in ITEMS if i['id'] not in mapping]
    (ROOT / 'local-images.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'image-download-report.json').write_text(json.dumps({'total': len(ITEMS), 'downloaded': len(mapping), 'failed': failures, 'attempted_this_run': len(attempted)}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Images saved: {len(mapping)}/{len(ITEMS)}; remaining: {len(failures)}', flush=True)
