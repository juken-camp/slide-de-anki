#!/usr/bin/env python3
"""Make a phone-friendly, read-only gallery for original document page review artifacts."""
from __future__ import annotations
import json,html
from pathlib import Path
ROOT=Path(__file__).resolve().parent/'source_page_review'
TARGETS={'konden':'743年5月27日／墾田・私財・永年','yamashiro101':'1485年12月11日／山城国人・集会','yamashiro102':'1486年2月13日／平等院・会合'}

def create(root=ROOT):
    report=json.loads((root/'index.json').read_text(encoding='utf-8'))
    cards=[];toc=[];total=0
    for item in report.get('results',[]):
        name=item.get('source','')
        if name not in TARGETS or item.get('status')!='rendered_for_manual_review':continue
        files=sorted((root/name).glob('page-*.jpg'))
        if not files:continue
        total+=len(files)
        toc.append(f'<a href="#{name}">{html.escape(name)}（{len(files)}ページ）</a>')
        cards.append(f'<section id="{name}"><h2>{html.escape(name)}</h2><p>{html.escape(TARGETS[name])}</p><div class="pages">')
        for path in files:
            label=path.stem.split('-')[-1]
            src=f'{name}/{path.name}'
            cards.append(f'<a href="{html.escape(src)}" target="_blank" class="page"><img loading="lazy" src="{html.escape(src)}" alt="{html.escape(name)} PDF p.{label}"><span>PDF p.{int(label)}</span></a>')
        cards.append('</div></section>')
    output='''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>History 202 史料原本ページ確認</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;margin:0;background:#f7f8fa;color:#182333}
header{position:sticky;top:0;background:#fff;padding:14px 16px;border-bottom:1px solid #ccc;z-index:2}h1{margin:0 0 7px;font-size:19px}.note{font-size:13px;line-height:1.5}
nav{display:flex;gap:10px;overflow:auto;margin-top:9px}nav a{white-space:nowrap;color:#005bd3;text-decoration:none;font-size:13px}main{padding:8px 12px}h2{margin:20px 2px 4px}
p{font-size:14px}.pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.page{background:white;border:1px solid #d9e0e5;border-radius:8px;overflow:hidden;text-decoration:none;color:#172b42}
.page img{display:block;width:100%;height:125px;object-fit:contain}.page span{display:block;padding:4px 8px;font-size:13px;font-weight:600}
@media(min-width:700px){.pages{grid-template-columns:repeat(4,minmax(0,1fr))}.page img{height:190px}}@media(min-width:1100px){.pages{grid-template-columns:repeat(6,minmax(0,1fr))}}
</style></head><body><header><h1>歴史の重要ワード202｜原文ページ確認</h1><div class="note">各画像をタップして拡大。対象の日付と本文の文字を目で確認し、PDFページ番号を記録してください。<strong>この画面は調査用でアプリ画像を変更しません。</strong></div><nav>'''
    output+=''.join(toc)+'</nav></header><main>'+''.join(cards)+'</main></body></html>'
    (root/'open_on_phone.html').write_text(output,encoding='utf-8')
    print(f'Built {total} linked historical document page thumbnails')
    return total

if __name__=='__main__':create()
