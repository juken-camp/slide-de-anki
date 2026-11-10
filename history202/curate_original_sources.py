#!/usr/bin/env python3
"""Curate a vetted batch of real history images from Wikimedia Commons.

The checked-out CURRENT manifest remains authoritative. Only source images that
pass Commons metadata/rights and raster validation replace existing assets.
Other materials, bubbles, design files and already stored images remain intact.
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import os
from pathlib import Path
import random
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'authentic_images'
MANIFEST = ROOT / 'real-materials.json'
LOCAL = ROOT / 'local-images.json'
# Default is unchanged. A separate workflow can select an independently reviewed PDF-page batch.
_SOURCE_NAME = os.environ.get('HISTORY202_SOURCE_MANIFEST', 'curated_sources.json')
SOURCES = Path(_SOURCE_NAME) if Path(_SOURCE_NAME).is_absolute() else ROOT / _SOURCE_NAME
REPORT = ROOT / 'curation-batch-result.json'
EXPORT = ROOT / 'curation-export'
MAX_BYTES = 16_000_000
USER_AGENT = 'JukenCampHistory202Curation/2.0 (school history sources; github.com/juken-camp/slide-de-anki)'


def get_bytes(url, *, expect_json=False, max_bytes=MAX_BYTES):
    req = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'application/json' if expect_json else 'image/jpeg,image/png,image/webp,image/*;q=0.8',
        'Referer': 'https://commons.wikimedia.org/'
    })
    with urllib.request.urlopen(req, timeout=45) as resp:
        typ = resp.headers.get('Content-Type','').split(';')[0].strip().lower()
        if expect_json:
            if not (typ == 'application/json' or typ.endswith('+json') or typ == 'text/plain'):
                raise ValueError('unexpected metadata content-type '+typ)
        elif not typ.startswith('image/'):
            raise ValueError('not a raster image: '+typ)
        raw = resp.read(max_bytes+1)
        if len(raw)>max_bytes: raise ValueError('source image too large')
        return raw


def plain_html(value):
    return html.unescape(re.sub(r'<[^>]+>','',str(value or ''))).strip()


def field(meta, name):
    return plain_html((meta.get(name) or {}).get('value',''))


def fetch_commons_metadata(source):
    filename=source['commonsFile'].replace(' ','_')
    url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({
        'action':'query','format':'json','formatversion':2,'redirects':1,
        'prop':'imageinfo','iiprop':'url|extmetadata|sha1|mime', 'iiurlwidth':1000,
        'titles':'File:'+filename})
    payload=json.loads(get_bytes(url,expect_json=True).decode('utf-8'))
    pages=payload.get('query',{}).get('pages') or []
    if not pages or not pages[0].get('imageinfo'):raise ValueError('Commons file has no imageinfo: '+filename)
    info=pages[0]['imageinfo'][0]
    meta=info.get('extmetadata') or {}
    license_name=field(meta,'LicenseShortName')
    license_url=field(meta,'LicenseUrl')
    restrictions=field(meta,'Restrictions')
    lowered=license_name.casefold()
    allowed=('public domain' in lowered or 'cc0' in lowered or 'cc by ' in lowered
             or 'cc by-sa' in lowered or 'creative commons zero' in lowered
             or lowered in ('pd','pdm','cc-zero','cc-by','cc-by-sa'))
    # The government photograph of the Reiwa announcement has a specific
    # Government of Japan Terms of Use 2.0 license on the Commons file page.
    if not allowed and source.get('governmentReuse'):
        allowed=('government of japan standard terms of use' in lowered or 'gjstu' in lowered)
    if not allowed: raise ValueError('Commons reuse license was not confirmed: '+(license_name or 'missing license'))
    if re.search(r'noncommercial|non-commercial|no.?derivative|no.?redistribution',restrictions,re.I):
        raise ValueError('Commons metadata contains rights restriction: '+restrictions[:110])
    # For PDF documents, Commons' preview is a raster rendering of its first page.
    # Never use the PDF itself as the in-app image or claim the preview is a specific legal clause.
    mimetype=str(info.get('mime','')).lower()
    is_pdf=filename.casefold().endswith('.pdf') or mimetype=='application/pdf'
    src=(info.get('thumburl') if is_pdf else (info.get('thumburl') or info.get('url')))
    if not src or not src.startswith('https://'): raise ValueError('Commons did not provide a HTTPS raster thumbnail')
    preview_page=1 if is_pdf else None
    if source.get('pdfPage') is not None:
        if not is_pdf: raise ValueError('pdfPage was given for a non-PDF source')
        if source.get('pageImageVerified') is not True or not source.get('pageEvidence'):
            raise ValueError('Non-first PDF page requires a manually documented exact-page visual check')
        requested_page=source['pdfPage']
        if type(requested_page) is not int or not 1<=requested_page<=300:
            raise ValueError('pdfPage must be a positive verified 1-based PDF page number')
        if not re.search(r'/page\d+-\d+px-', src):
            raise ValueError('Commons thumbnail URL did not expose a safe PDF page segment')
        src=re.sub(r'/page\d+-(\d+)px-',
                   lambda m: f'/page{requested_page}-{m.group(1)}px-', src, count=1)
        preview_page=requested_page
    canonical=info.get('descriptionurl') or ('https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(filename))
    expected=source.get('expectedOriginalSha1')
    if expected and info.get('sha1') and info['sha1'].lower()!=expected.lower():
        raise ValueError('original Commons file SHA1 changed since previous manual identification')
    return {'url':src,'full_url':(None if is_pdf else info.get('url')),'page':canonical,'source_mime':mimetype,
            'preview_page':preview_page,
            'license':license_name,'license_url':license_url,
            'restrictions':restrictions,'sha1':info.get('sha1',''),
            'artist':field(meta,'Artist'),'credit':field(meta,'Credit')}


def webp_bytes(raw):
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        if im.width<200 or im.height<120 or im.width*im.height>120_000_000:
            raise ValueError('source image dimensions invalid')
        im=ImageOps.exif_transpose(im)
        im.thumbnail((1400,1400), Image.Resampling.LANCZOS)
        if im.mode not in ('RGB','RGBA'): im=im.convert('RGB')
        out=io.BytesIO()
        im.save(out,format='WEBP',quality=84,method=5)
        data=out.getvalue()
    with Image.open(io.BytesIO(data)) as check:
        check.verify()
    return data


def download(source):
    meta=fetch_commons_metadata(source)
    urls=list(dict.fromkeys(x for x in [meta['url'],meta['full_url']] if x))
    errors=[]
    for url in urls:
        for attempt in range(2):
            try:
                raw=get_bytes(url)
                if len(raw)<1500:raise ValueError('image body too small')
                return webp_bytes(raw),meta
            except Exception as exc:
                errors.append(type(exc).__name__+': '+str(exc)[:125])
                if isinstance(exc,urllib.error.HTTPError) and exc.code in (400,403,404):break
                time.sleep(2+attempt*3)
    raise RuntimeError(' / '.join(errors[-4:]))


def atomic_write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    part=path.with_name(path.name+'.part')
    try:
        part.write_bytes(data)
        part.replace(path)
    finally:
        if part.exists():part.unlink()


def run():
    ASSETS.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    local=json.loads(LOCAL.read_text(encoding='utf-8'))
    source_data=json.loads(SOURCES.read_text(encoding='utf-8'))
    targets=source_data['items']
    items={x['id']:x for x in manifest['items']}
    assert len(manifest['items'])==256 and len(items)==256, 'This is not the expected 256-item material manifest'
    assert len({x['id'] for x in targets})==len(targets), 'Duplicate candidate IDs'
    assert all(t['id'] in items for t in targets),'Missing candidate in CURRENT app manifest'
    results=[];changed_paths=[];changed_count=0
    for count, source in enumerate(targets,1):
        item_id=source['id']
        current=items[item_id]
        previous_caption=current.get('caption','')
        try:
            data,meta=download(source)
            dest=ASSETS/(item_id+'.webp')
            atomic_write(dest,data)
            for key in ('caption','explanation','type','coverageOf'):
                current[key]=source[key]
            current['image']=meta['url']  # Always a displayable raster preview (never a PDF URL)
            current['sourceUrl']=meta['page']
            current['credit']=('Wikimedia Commons／'+source['commonsFile']+
                               ('／'+meta['artist'] if meta['artist'] else ''))
            current['license']=meta['license']
            current['licenseUrl']=meta['license_url']
            current['licenseStatus']='source_page_verified'
            current['imageSelection']=('verified-pdf-page-20261110' if source.get('pdfPage') is not None
                                       else 'curated-source-20261109')
            current['localImage']=True
            current['review']=('所蔵情報・資料名を出典で確認。Commons APIのライセンス表示と画像ファイルを照合して保存。'
                                + (f'PDF第{meta["preview_page"]}ページは事前に資料本文を目視確認。'
                                   + source['pageEvidence']
                                   if source.get('pdfPage') is not None
                                   else 'PDFは先頭ページのプレビュー。条文掲載ページの確認が必要。'))
            if source.get('pdfPage') is not None:
                current['verifiedPdfPage']=meta['preview_page']
                current['pageEvidence']=source['pageEvidence']
                current['pageImageVerified']=True
                current.pop('qualityCropVersion',None)
                current.pop('imageProcessing',None)
                current['educationalReviewStatus']='document_page_checked_pending_device_review'
            local[item_id]='history202/authentic_images/'+item_id+'.webp'
            rel='history202/authentic_images/'+item_id+'.webp'
            changed_paths.append(rel)
            # Only changed raster files are included in the optional artifact.
            staged=EXPORT/rel
            atomic_write(staged,data)
            changed_count+=1
            results.append({'id':item_id,'status':'replaced','source':meta['page'],
                            'pdf_page':meta['preview_page'],'page_evidence':source.get('pageEvidence'),
                            'old_caption':previous_caption,'new_caption':source['caption'],
                            'file':rel,'bytes':len(data),'license':meta['license'],
                            'license_url':meta['license_url'],'commons_sha1':meta['sha1'],
                            'notice':meta['restrictions'][:280]})
        except Exception as exc:
            results.append({'id':item_id,'status':'kept_existing_or_missing',
                            'reason':type(exc).__name__+': '+str(exc)[:400]})
        print(f'{count}/{len(targets)} {item_id}: {results[-1]["status"]}',flush=True)
        time.sleep(1.7)
    if changed_count:
        out=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8')+b'\n'
        idx=json.dumps(local,ensure_ascii=False,indent=2).encode('utf-8')+b'\n'
        atomic_write(MANIFEST,out)
        atomic_write(LOCAL,idx)
        atomic_write(EXPORT/'history202/real-materials.json',out)
        atomic_write(EXPORT/'history202/local-images.json',idx)
    report={'targeted':len(targets),'replaced':changed_count,'retained':len(targets)-changed_count,
            'total_materials':len(items),'local_images_indexed':len(local),
            'changed_image_paths':changed_paths,
            'note':'Default PDF preview is page 1. A manually verified positive pdfPage explicitly fetches that exact Commons PDF page. Metadata and raster validation are checked; all unverified pages keep their old images. Re-check on an actual phone after deployment.',
            'results':results}
    summary=(json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    atomic_write(REPORT,summary)
    atomic_write(EXPORT/'history202/curation-batch-result.json',summary)
    print('Curated:',changed_count,'/',len(targets),'Local index:',len(local),flush=True)
    return 0 if changed_count else 2

if __name__=='__main__':sys.exit(run())
