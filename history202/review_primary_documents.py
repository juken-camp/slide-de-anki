#!/usr/bin/env python3
"""READ-ONLY source page viewer: no replacement and no OCR/AI-generated images.

Downloads three original public-domain historical PDFs from Wikimedia Commons,
checks the source file type and reported SHA1, and makes numbered page sheets.
A human must select/verify the exact dated passage before any app image update.
"""
from __future__ import annotations
import argparse, hashlib, io, json, time, urllib.parse, urllib.request
from pathlib import Path
import fitz
from PIL import Image, ImageDraw, ImageFont

BASE=Path(__file__).resolve().parent
OUT=BASE/'source_page_review'
MAX_BYTES=36_000_000
SOURCES={
 'konden':{'file':'NAJDA-137-0100 続日本紀15.pdf','pages':72,'passage':'743-05-27 / 天平十五年五月・墾田・任為私財'},
 'yamashiro101':{'file':'NAJDA-古027-0514イ 大乗院寺社雑事記 第101冊.pdf','pages':69,'passage':'1485-12-11 / 文明十七年十二月十一日・山城国人集会'},
 'yamashiro102':{'file':'NAJDA-古027-0514イ 大乗院寺社雑事記 第102冊.pdf','pages':68,'passage':'1486-02-13 / 文明十八年二月十三日・於平等院会合'}
}
UA='JUKENCAMP-SourceReview/1.0 (educational research; https://github.com/juken-camp/slide-de-anki)'

def get(url, limit=MAX_BYTES):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/pdf,application/json,*/*;q=0.4'})
    with urllib.request.urlopen(req,timeout=70) as resp:
        if resp.status!=200:raise ValueError('HTTP status '+str(resp.status))
        typ=resp.headers.get('Content-Type','').split(';')[0].lower()
        data=resp.read(limit+1)
        if len(data)>limit:raise ValueError('file too large')
    return data,typ

def commons_pdf(source):
    file=source['file']
    query=urllib.parse.urlencode({'action':'query','format':'json','formatversion':2,'prop':'imageinfo',
      'iiprop':'url|sha1|mime|size','titles':'File:'+file.replace(' ','_')})
    meta_bytes,_=get('https://commons.wikimedia.org/w/api.php?'+query,limit=400000)
    meta=json.loads(meta_bytes)
    pages=meta.get('query',{}).get('pages',[])
    if not pages or not pages[0].get('imageinfo'):raise ValueError('file not found on Commons')
    info=pages[0]['imageinfo'][0]
    if info.get('mime')!='application/pdf':raise ValueError('source is not PDF')
    url=info.get('url','')
    if not url.startswith('https://upload.wikimedia.org/wikipedia/commons/'):
        raise ValueError('PDF URL not the expected Wikimedia upload domain')
    if info.get('size',0)>MAX_BYTES:raise ValueError('PDF exceeds size limit')
    raw,typ=get(url)
    if not raw.startswith(b'%PDF-'):raise ValueError('PDF signature mismatch')
    if hashlib.sha1(raw).hexdigest().lower()!=info.get('sha1','').lower():
        raise ValueError('Wikimedia PDF SHA1 mismatch')
    return raw,info

def render(raw, source, dest, *, expected_pages=True):
    doc=fitz.open(stream=raw,filetype='pdf')
    if expected_pages and len(doc)!=source['pages']:
        raise ValueError(f'Unexpected PDF pages: {len(doc)} expected {source["pages"]}')
    dest.mkdir(parents=True,exist_ok=True)
    pages=[]
    for i in range(len(doc)):
        pix=doc[i].get_pixmap(matrix=fitz.Matrix(0.52,0.52),alpha=False)
        im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        im.thumbnail((580,390),Image.Resampling.LANCZOS)
        path=dest/f'page-{i+1:03d}.jpg';im.save(path,quality=76,optimize=True)
        pages.append(path)
    sheets=[]
    for start in range(0,len(pages),12):
        part=pages[start:start+12]
        im=Image.new('RGB',(4*340,3*270),'#eeeeec');dr=ImageDraw.Draw(im)
        for j,path in enumerate(part):
            pic=Image.open(path);pic.thumbnail((326,230),Image.Resampling.LANCZOS)
            x=(j%4)*340+(340-pic.width)//2;y=(j//4)*270+20
            im.paste(pic,(x,y))
            dr.text(((j%4)*340+8,(j//4)*270+3),f'PDF p.{start+j+1}',fill='#111111')
        sheet=dest/f'contact-{start//12+1:02d}.jpg';im.save(sheet,quality=83,optimize=True);sheets.append(sheet.name)
    return {'pages':len(pages),'contactSheets':sheets,'pageCount':len(pages)}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',choices=['all',*SOURCES],default='all')
    p.add_argument('--local-pdf',type=Path,help='Offline test input, requires a single --source')
    p.add_argument('--test-render',action='store_true',help='Skip expected page count for offline fixture')
    args=p.parse_args()
    names=list(SOURCES) if args.source=='all' else [args.source]
    if args.local_pdf and len(names)!=1: p.error('--local-pdf requires a single --source')
    OUT.mkdir(parents=True,exist_ok=True);results=[]
    for name in names:
        source=SOURCES[name]; dest=OUT/name
        try:
            raw=args.local_pdf.read_bytes() if args.local_pdf else commons_pdf(source)[0]
            result=render(raw,source,dest,expected_pages=not args.test_render)
            result.update({'source':name,'status':'rendered_for_manual_review','file':source['file'],
             'commonsPage':'https://commons.wikimedia.org/wiki/File:'+source['file'].replace(' ','_'),
             'sha256':hashlib.sha256(raw).hexdigest(),'neededPassage':source['passage'],
             'verifiedExactPassagePage':None,'autoPublish':False})
            results.append(result)
            print(name,result['pages'],'pages',len(result['contactSheets']),'sheets')
        except Exception as exc:
            results.append({'source':name,'status':'FAILED','error':type(exc).__name__+': '+str(exc)})
            print(name,'FAILED',exc)
    (OUT/'index.json').write_text(json.dumps({'reviewOnly':True,'results':results},ensure_ascii=False,indent=2)+'\n')
    (OUT/'README.txt').write_text('歴史史料 原文ページ確認用：実装画像は変更していません。\n'+
      'contact-*.jpg にPDFページ番号があります。指定の日付と文言が両方確認できるまでは、画像を差し替えないでください。\n'+
      '山城の国一揆：第101冊＝1485年12月11日、第102冊＝1486年2月13日。\n',encoding='utf-8')
    if any(x['status']=='FAILED' for x in results):raise SystemExit(2)

if __name__=='__main__':main()
