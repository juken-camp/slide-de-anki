#!/usr/bin/env python3
"""Daily news generator. The repository's existing assessment and catalog are inputs."""
import datetime as dt, email.utils, hashlib, json, os, re, sys, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
JST=dt.timezone(dt.timedelta(hours=9)); ROOT=Path(__file__).resolve().parents[1]
FIELDS={'geography':'地理','history':'歴史','civics':'公民','physics':'物理','chemistry':'化学','biology':'生物','earth':'地学'}
FEEDS=['https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja']+['https://news.google.com/rss/search?q='+urllib.parse.quote(q)+'&hl=ja&gl=JP&ceid=JP:ja' for q in ['沖縄','政治 経済','世界 地理','歴史 文化','科学 物理','化学 環境','生物 自然','気象 宇宙']]

def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'NekoponNews/1.0','Accept':'application/rss+xml, application/xml'})
 with urllib.request.urlopen(req,timeout=18) as r:
  if r.status!=200: raise ValueError('feed request failed')
  return r.read(3_000_000)

def collect(feeds,source_date):
 seen=set();items=[]
 for url in feeds:
  try: root=ET.fromstring(get(url))
  except Exception as e: print('feed unavailable:',type(e).__name__,file=sys.stderr);continue
  for item in root.findall('./channel/item'):
   headline=(item.findtext('title') or '').strip();link=(item.findtext('link') or '').strip();pub=item.findtext('pubDate') or ''
   try: date=email.utils.parsedate_to_datetime(pub).astimezone(JST).date()
   except (ValueError,TypeError,OverflowError):continue
   if date!=source_date or not headline or len(headline)>300 or not link.startswith('https://') or link in seen:continue
   source=(item.findtext('source') or '').strip();seen.add(link)
   items.append({'id':len(items),'headline':headline,'source':source,'url':link,'publishedAt':pub})
 return items[:300]

def ask(prompt,max_tokens=4096):
 key=os.environ.get('ANTHROPIC_API_KEY','')
 if not key:raise ValueError('ANTHROPIC_API_KEY が設定されていません')
 payload={'model':os.environ.get('NEWS_MODEL','claude-haiku-5-5'),'max_tokens':max_tokens,'messages':[{'role':'user','content':prompt}]}
 req=urllib.request.Request('https://api.anthropic.com/v1/messages',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},method='POST')
 with urllib.request.urlopen(req,timeout=110) as response: result=json.load(response)
 text=''.join(x.get('text','') for x in result.get('content',[]) if x.get('type')=='text').strip()
 if text.startswith('```'):text=re.sub(r'^```(?:json)?\s*|\s*```$','',text)
 return json.loads(text)

def read_inputs():
 raw=(ROOT/'catalog.js').read_text(); catalog=json.loads(re.sub(r';\s*$','',re.sub(r'^\s*window\.QUIZ_CATALOG\s*=\s*','',raw)))
 files=list((ROOT/'nekopon-data').glob('assessment-*.json'))
 if len(files)!=1:raise ValueError('採点データが一つに特定できません')
 data=json.loads(files[0].read_text());return catalog,data

def grams(text):
 text=re.sub(r'[^\w\u3040-\u30ff\u4e00-\u9fff]','',text);return set(text[i:i+2] for i in range(max(0,len(text)-1)))

def candidates(catalog,data,field,words):
 query=grams(' '.join(words));rows=[]
 for m in catalog:
  if m.get('field')!=field:continue
  for c in data.get('lessons',{}).get(m['id'],{}).get('cards',[]):
   q=str(c.get('q',''));a=str(c.get('a',''))
   if not c.get('eligible') or not q or not a or len(q)>200 or len(a)>120:continue
   if c.get('image') or re.search(r'図[のはを中]|下の図|次の図|写真|グラフ|地図|表[のをは]',q):continue
   score=len(query & grams(m.get('title','')+' '+q+' '+a))
   if score:rows.append((score,hashlib.sha256((m['id']+'/'+c['id']).encode()).hexdigest(),{'lessonId':m['id'],'cardId':c['id'],'q':q,'a':a,'title':m.get('title','')}))
 rows.sort(key=lambda x:(-x[0],x[1]));return [v for _,_,v in rows[:30]]

def generate(items,catalog,data,source_date):
 choices=[{'id':x['id'],'headline':x['headline'],'source':x['source']} for x in items]
 selection=ask('中学生向け。前日のニュースの見出しから、地理・歴史・公民・物理・化学・生物・地学の7分野につながる話題をそれぞれ選ぶ。見出しにない事実は想像しない。適切なものがない場合はnull。各分野で既存の中学教材を検索する具体的な語を5個まで提案。JSONのみ。形式 {"geography":{"id":0,"keywords":["地震"]},"history":null,"civics":null,"physics":null,"chemistry":null,"biology":null,"earth":null}。ニュース一覧: '+json.dumps(choices,ensure_ascii=False))
 proposed={};byid={x['id']:x for x in items}
 for field in FIELDS:
  a=selection.get(field)
  if not isinstance(a,dict) or a.get('id') not in byid or not isinstance(a.get('keywords'),list):continue
  words=[x for x in a['keywords'] if isinstance(x,str) and len(x)<=30][:5]
  news=byid[a['id']]; cs=candidates(catalog,data,field,[news['headline']]+words)
  if cs:proposed[field]={'news':news,'candidates':cs}
 if not proposed:raise ValueError('対応するニュースと問題を見つけられませんでした')
 prompt='''あなたは中学生向けの塾講師。ニュースと問題の関連を教える。分野ごとに候補問題から厳密に1つ選び、無理に結びつけず、関連が弱ければ省略する。報道の見出しから確実に分かる事実以外は書かない。記事本文は未取得、背景・数字・理由を推測しない。見出しだけから重要性や比較が不明なら断定しない。文章は偏差値40程度の中学生が読みやすい短い日本語にする。覚えるべき単語以外の専門用語を使わない。「何が起きた」「どういうこと」「問題の答えとの関係」を短く示し、考え方の答えを教える。テーマは普通の言葉で。文体はNekopon=にゃ、Yorupon=だぜ。JSONだけ返す。形式 {"items":[{"field":"geography","lessonId":"候補と一致","cardId":"候補と一致","title":"短い見出し","articleNeko":"ニュースと意味","articleCyber":"同内容の別口調","neko":"問題の答えとのつながり","cyber":"同内容の別口調"}]}。候補: '''+json.dumps(proposed,ensure_ascii=False)
 result=ask(prompt,7000);output=[];used=set()
 for row in result.get('items',[]):
  f=row.get('field'); block=proposed.get(f)
  if not block or f in used:continue
  c=next((x for x in block['candidates'] if x['lessonId']==row.get('lessonId') and x['cardId']==row.get('cardId')),None)
  if not c:continue
  if any(not isinstance(row.get(k),str) or not 1<=len(row[k].strip())<=400 for k in ['title','articleNeko','articleCyber','neko','cyber']):continue
  news=block['news'];output.append({k:row[k].strip() for k in ['field','lessonId','cardId','title','articleNeko','articleCyber','neko','cyber']}|{'label':FIELDS[f],'url':news['url'],'source':news['source'],'sourceHeadline':news['headline'],'publishedAt':news['publishedAt']});used.add(f)
 if not output:raise ValueError('検証を通った記事がありません')
 return {'version':1,'date':(source_date+dt.timedelta(days=1)).isoformat(),'sourceDate':source_date.isoformat(),'generatedAt':dt.datetime.now(JST).isoformat(),'items':output}

def main():
 source=(dt.datetime.now(JST).date()-dt.timedelta(days=1));items=collect(FEEDS,source)
 if not items:raise ValueError('前日の見出しを取得できませんでした')
 catalog,data=read_inputs();result=generate(items,catalog,data,source)
 output=ROOT/'news'/'daily';output.mkdir(parents=True,exist_ok=True)
 path=output/(result['date']+'.json');temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
 # Rebuild the history index from valid dated files; no empty overwrites on failures.
 dates=sorted([p.stem for p in output.glob('????-??-??.json')],reverse=True)
 index={'version':1,'dates':dates};temp=output/'index.tmp';temp.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n');temp.replace(output/'index.json')
 print('作成:',result['date'],len(result['items']),'件')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ニュース更新失敗:',str(e),file=sys.stderr);sys.exit(1)
