#!/usr/bin/env python3
"""Download and validate historical source images, keeping failed URLs unchanged.
Run: python history202/download_materials.py
"""
import concurrent.futures, hashlib, io, json, pathlib, time, urllib.parse, urllib.request
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent
MANIFEST=ROOT/'real-materials.json'
ASSETS=ROOT/'authentic_images'
ASSETS.mkdir(exist_ok=True)
items=json.loads(MANIFEST.read_text(encoding='utf-8'))['items']
def candidates(item):
    urls=[item['image']]
    source=item.get('sourceUrl','')
    if source.startswith('https://commons.wikimedia.org/wiki/File:'):
        name=urllib.parse.unquote(source.split('/wiki/File:',1)[1])
        for width in (720,480,320):
            urls.append('https://commons.wikimedia.org/w/index.php?'+urllib.parse.urlencode({'title':'Special:Redirect/file/'+name,'width':width}))
            urls.append('https://commons.wikimedia.org/wiki/Special:FilePath/'+urllib.parse.quote(name)+'?width='+str(width))
    return list(dict.fromkeys(urls))
def fetch(item):
    dest=ASSETS/(item['id']+'.webp')
    if dest.exists():
        try:
            with Image.open(dest) as im: im.verify()
            return item['id'],str(dest.relative_to(ROOT.parent)),None
        except Exception: dest.unlink()
    errors=[]
    for url in candidates(item):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'JukenCampHistoryEducation/1.0 (historical image preservation; Wikimedia Commons)','Accept':'image/avif,image/webp,image/png,image/jpeg,image/*'})
            with urllib.request.urlopen(req,timeout=22) as resp:
                if int(resp.headers.get('Content-Length','0'))>18000000: raise ValueError('file too large')
                raw=resp.read(18000001)
            if len(raw)>18000000: raise ValueError('file too large')
            with Image.open(io.BytesIO(raw)) as im:
                im.load()
                if im.width<100 or im.height<80: raise ValueError('image too small')
                if im.width*im.height>70000000: raise ValueError('image too large')
                im.thumbnail((1400,1400))
                if im.mode not in ('RGB','RGBA'): im=im.convert('RGB')
                im.save(dest,'WEBP',quality=84,method=5)
            return item['id'],str(dest.relative_to(ROOT.parent)),None
        except Exception as e: errors.append(type(e).__name__+': '+str(e)[:100])
    return item['id'],None,'; '.join(errors[-2:])
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: results=list(pool.map(fetch,items))
    mapping={i:path for i,path,err in results if path}
    # Store local paths separately, preserving the original source manifest and URLs.
    (ROOT/'local-images.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    failed=[{'id':i,'error':err} for i,path,err in results if err]
    (ROOT/'image-download-report.json').write_text(json.dumps({'total':len(items),'downloaded':len(mapping),'failed':failed},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Images downloaded:',len(mapping),'/',len(items),'Failed:',len(failed))
