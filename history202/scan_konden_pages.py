#!/usr/bin/env python3
"""REVIEW ONLY: render pages of a documented historical source.

This script NEVER changes history202/real-materials.json or any image served by the app.
It creates contact sheets and per-page JPEGs for human verification of the
743-05-27 entry from Shoku Nihongi volume 15.

Usage: python history202/scan_konden_pages.py
       python history202/scan_konden_pages.py --pdf /tmp/source.pdf
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request
import urllib.parse

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent
REVIEW=ROOT/'source_page_review'
# 1657 printed edition, NATIONAL ARCHIVES OF JAPAN 137-0100 (public domain scan)
TITLE='NAJDA-137-0100 続日本紀15.pdf'
CANONICAL='https://commons.wikimedia.org/wiki/File:'+TITLE.replace(' ','_')
# Wikimedia Commons actual file path (backed by the source file's indexed file record)
PDF_URL=('https://upload.wikimedia.org/wikipedia/commons/f/fc/'
         +urllib.parse.quote(TITLE.replace(' ','_')))
MAX_PDF_BYTES=35_000_000


def get_file():
    request=urllib.request.Request(PDF_URL,headers={'User-Agent':'JUKENCAMP-SourcePageReview/1.0 (educational, research-only; https://github.com/juken-camp/slide-de-anki)'})
    with urllib.request.urlopen(request,timeout=90) as resp:
        mime=resp.headers.get('Content-Type','').split(';',1)[0]
        if mime not in ('application/pdf','application/octet-stream'):
            raise ValueError('Expected PDF, got '+mime)
        raw=resp.read(MAX_PDF_BYTES+1)
        if len(raw)>MAX_PDF_BYTES:raise ValueError('PDF over byte limit')
        if not raw.startswith(b'%PDF-'):raise ValueError('Not a PDF file')
    return raw


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--pdf',type=Path,help='Use predownloaded source PDF for offline testing')
    args=parser.parse_args()
    raw=args.pdf.read_bytes() if args.pdf else get_file()
    REVIEW.mkdir(parents=True,exist_ok=True)
    doc=fitz.open(stream=raw,filetype='pdf')
    if not 45<=len(doc)<=90:raise ValueError(f'Unexpected page count: {len(doc)}')
    font=ImageFont.load_default()
    contacts=[];page_rows=[]
    for i in range(len(doc)):
        page=doc.load_page(i)
        pix=page.get_pixmap(matrix=fitz.Matrix(0.48,0.48),alpha=False)
        im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
        im.thumbnail((680,570),Image.Resampling.LANCZOS)
        page_path=REVIEW/f'page-{i+1:03d}.jpg'
        im.save(page_path,quality=79,optimize=True)
        page_rows.append({'pdfPage':i+1,'file':page_path.name,'width':im.width,'height':im.height})
    for s in range(0,len(page_rows),12):
        part=page_rows[s:s+12]
        sheet=Image.new('RGB',(4*390,3*340),(242,243,242));draw=ImageDraw.Draw(sheet)
        for j,p in enumerate(part):
            src=Image.open(REVIEW/p['file']);src.thumbnail((372,307),Image.Resampling.LANCZOS)
            x=j%4*390+(390-src.width)//2; y=j//4*340+23
            sheet.paste(src,(x,y))
            draw.text((j%4*390+12,j//4*340+6),f"PDF p.{p['pdfPage']}",fill=(0,0,0),font=font)
        path=REVIEW/f'contact-{s//12+1:02d}.jpg'
        sheet.save(path,quality=82,optimize=True)
        contacts.append(path.name)
    info={'title':TITLE,'source':CANONICAL,'pdfUrl':PDF_URL,'sha256':hashlib.sha256(raw).hexdigest(),
          'pdfPages':len(doc),'pages':page_rows,'contactSheets':contacts,
          'neededPassage':'天平十五年五月乙丑／五月二十七日「今より以後、任に私財と為し」',
          'reviewStatus':'NOT VERIFIED: must visually select exact page before any replacement',
          'autoPublish':False}
    (REVIEW/'index.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (REVIEW/'README.txt').write_text('続日本紀・巻15 史料確認用\n全ページの一覧画像（contact-*.jpg）を開き、743年5月27日の該当ページを探してください。\n該当ページが確定するまで、アプリの画像や説明は変更しません。\nこの成果物は「史料の下調べ」であり、自動更新ではありません。\n',encoding='utf-8')
    print(f'Rendered {len(doc)} pages, {len(contacts)} contact sheets; no app files touched')

if __name__=='__main__': main()
