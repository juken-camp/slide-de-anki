#!/usr/bin/env python3
"""Preview/publish an individually checked historical PDF page, without fabricating images.

Default preview is read-only. Publication is blocked unless a teacher has reviewed
an original-page contact sheet and explicitly confirms the exact PDF page.
The current checked-out 256-item manifest is always the source of truth.
"""
from __future__ import annotations
import argparse
import io
import json
import sys
from datetime import date
from pathlib import Path
from PIL import Image
from curate_original_sources import download, atomic_write

ROOT=Path(__file__).resolve().parent
REPORT_DIR=ROOT/'primary-page-results'
SOURCES={
 'konden':{
    'commonsFile':'NAJDA-137-0100 続日本紀15.pdf','expected_pages':72,
    'historical_date':'743年（天平15年）5月27日','phrase':'墾田',
    'ids':['verified-konden-743','verified-konden-ch15'],
    'caption':'墾田永年私財法を記した『続日本紀』巻15（1657年刊本の該当ページ）',
    'type':'743年の詔を記した歴史書の1657年刊本（後世の印刷資料）',
    'explanation':'743年、朝廷は新しく開いた田を、国の許可を得て永久に私有できるようにしました。これは『続日本紀』に記された当時の命令を、1657年に出版した本の画像です。743年に書かれた原本そのものではありません。',
    'coverageOf':'墾田永年私財法'},
 'yamashiro101':{
    'commonsFile':'NAJDA-古027-0514イ 大乗院寺社雑事記 第101冊.pdf','expected_pages':69,
    'historical_date':'1485年（文明17年）12月11日','phrase':'山城国人',
    'ids':['authentic-2026-continued-056'],
    'caption':'山城の国一揆を伝える尋尊の日記『大乗院寺社雑事記』（1485年12月11日の記録）',
    'type':'尋尊が記した当時の日記の原本（1485年の一揆に関する記録）',
    'explanation':'1485年、山城の地元の武士や農民が集まり、戦いを続ける二つの軍を退かせようと話し合いました。これは当時の僧・尋尊の日記です。15〜16歳の若者から60歳ほどの人まで集まったと記され、当時の様子を伝えます。',
    'coverageOf':'山城の国一揆'},
 'yamashiro102':{
    'commonsFile':'NAJDA-古027-0514イ 大乗院寺社雑事記 第102冊.pdf','expected_pages':68,
    'historical_date':'1486年（文明18年）2月13日','phrase':'平等院',
    'ids':['authentic-2026-continued-056'],
    'caption':'平等院での話し合いを伝える『大乗院寺社雑事記』（1486年2月13日の記録）',
    'type':'尋尊が記した当時の日記の原本（1486年の平等院での会合）',
    'explanation':'1485年、山城の地元の武士や農民が戦っていた軍を退かせました。翌1486年2月13日には、宇治の平等院で地域の決まりについて話し合いました。これは当時の僧・尋尊が日記に書き残した記録です。',
    'coverageOf':'山城の国一揆'},
}


def check_index():
    items=json.loads((ROOT/'real-materials.json').read_text(encoding='utf-8'))['items']
    local=json.loads((ROOT/'local-images.json').read_text(encoding='utf-8'))
    byid={x['id']:x for x in items}
    assert len(items)==len(byid)==len(local)==256, 'Not the canonical 256-item material inventory'
    assert set(local)==set(byid), 'Local image index does not match 256 material IDs'
    for item_id,path in local.items():
        if path!=f'history202/authentic_images/{item_id}.webp':
            raise ValueError(f'Unexpected asset mapping for {item_id}')
    return items,local,byid


def save_report(obj):
    REPORT_DIR.mkdir(parents=True,exist_ok=True)
    (REPORT_DIR/'result.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def process(source_key,page,mode,evidence,fixture):
    spec=SOURCES[source_key]
    if not (1<=page<=spec['expected_pages']):
        raise ValueError(f'Page must be 1..{spec["expected_pages"]} for {source_key}')
    if mode=='publish':
        if evidence != f'CONFIRMED:{source_key}:{page}':
            raise ValueError('Publication requires evidence CONFIRMED:<source>:<page> after VISUAL review of the specific passage')
    items,local,byid=check_index()
    assert all(i in byid for i in spec['ids']), 'Expected material ID missing in current manifest'
    source={'id':spec['ids'][0],'commonsFile':spec['commonsFile'],'pdfPage':page,
            'pageImageVerified':True,
            'pageEvidence':f'{spec["historical_date"]} {spec["phrase"]} | Human visual review required; PDF page {page}'}
    if fixture:
        if mode!='preview':raise ValueError('Offline fixture never permits publication')
        data=fixture.read_bytes()
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        meta={'url':'offline-test','page':'offline-test','license':'offline fixture','license_url':'',
              'artist':'','sha1':'','restrictions':'','preview_page':page}
    else:
        data,meta=download(source)
        if meta['preview_page']!=page or not meta['page'].startswith('https://commons.wikimedia.org/'):
            raise ValueError('Fetched image does not correspond to selected Commons PDF page')
    with Image.open(io.BytesIO(data)) as im:
        im.verify()
    REPORT_DIR.mkdir(parents=True,exist_ok=True)
    filename=f'{source_key}-pdfpage-{page:03d}.webp'
    atomic_write(REPORT_DIR/filename,data)
    report={'source':source_key,'pdfPage1Based':page,'historicalDate':spec['historical_date'],
       'expectedTextKeyword':spec['phrase'],'status':'preview_only' if mode=='preview' else 'published_to_checkout',
       'replacedIds':[] if mode=='preview' else spec['ids'],
       'candidateIds':spec['ids'],'commonsPage':meta['page'],'license':meta['license'],
       'sourcePdf':spec['commonsFile'],'previewFile':filename,
       'humanSourceReviewRequired':mode=='preview',
       'note':'No AI images. This code cannot read the Japanese manuscript automatically. A human must visually confirm the dated source passage on the preview image before switching mode to publish.'}
    if mode=='preview':
        save_report(report)
        return report
    # All downloads and checks finished before any replacement on disk.
    manifest={'version':None}
    manifest=json.loads((ROOT/'real-materials.json').read_text(encoding='utf-8'))
    content_byid={x['id']:x for x in manifest['items']}
    for item_id in spec['ids']:
        item=content_byid[item_id]
        item.update({k:spec[k] for k in ('caption','type','explanation','coverageOf')})
        item['sourceUrl']=meta['page']
        item['image']=meta['url']
        item['credit']=f'国立公文書館所蔵／Wikimedia Commons公開：{spec["commonsFile"]}'
        item['license']=meta['license']
        item['licenseUrl']=meta['license_url']
        item['licenseStatus']='source_page_verified'
        item['imageSelection']='human-confirmed-pdf-page'
        item['verifiedPdfPage']=page
        item['pageImageVerified']=True
        item['pageEvidence']=f'{spec["historical_date"]}の日付と本文中の「{spec["phrase"]}」を目視で確認したPDF第{page}ページ（手動承認）。'
        item['educationalReviewStatus']='historical_page_verified_device_review_pending'
        item['review']=f'史料の該当日付と文言はPDF第{page}ページを目視確認して採用。原本・後世刊本の区別を明記。iPhone実機の表示確認は別途必要。'
        rel=f'history202/authentic_images/{item_id}.webp'
        atomic_write(ROOT/'authentic_images'/f'{item_id}.webp',data)
        local[item_id]=rel
    atomic_write(ROOT/'real-materials.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    atomic_write(ROOT/'local-images.json',(json.dumps(local,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    save_report(report)
    return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',choices=sorted(SOURCES),required=True)
    p.add_argument('--page',type=int,required=True,help='1-based PDF page number read from the contact sheet')
    p.add_argument('--mode',choices=('preview','publish'),default='preview')
    p.add_argument('--evidence',default='',help='Publish: CONFIRMED:<source>:<page> after HUMAN visual check')
    p.add_argument('--fixture-webp',type=Path,help='Offline test only. Never publishes')
    args=p.parse_args()
    try:
        out=process(args.source,args.page,args.mode,args.evidence,args.fixture_webp)
        print(json.dumps(out,ensure_ascii=False,indent=2))
    except Exception as e:
        save_report({'source':args.source,'page':args.page,'status':'failed_kept_existing','reason':type(e).__name__+': '+str(e)})
        raise

if __name__=='__main__':main()
