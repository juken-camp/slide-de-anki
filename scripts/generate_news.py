#!/usr/bin/env python3
"""Daily news generator. The repository's existing assessment and catalog are inputs."""
import argparse, time, urllib.error, datetime as dt, email.utils, hashlib, json, os, re, sys, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
JST=dt.timezone(dt.timedelta(hours=9)); ROOT=Path(__file__).resolve().parents[1]
QUALITY_VERSION=2
FIELDS={'geography':'地理','history':'歴史','civics':'公民','physics':'物理','chemistry':'化学','biology':'生物','earth':'地学'}
FEEDS=['https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja']+['https://news.google.com/rss/search?q='+urllib.parse.quote(q)+'&hl=ja&gl=JP&ceid=JP:ja' for q in ['沖縄','政治 経済','世界 地理','歴史 文化','科学 物理','化学 環境','生物 自然','気象 宇宙']]

def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'NekoponNews/1.0','Accept':'application/rss+xml, application/xml'})
 for attempt in range(3):
  try:
   with urllib.request.urlopen(req,timeout=18) as r:
    if r.status!=200:raise ValueError('feed request failed')
    return r.read(3_000_000)
  except urllib.error.HTTPError as e:
   print('feed HTTP:',e.code,urllib.parse.urlparse(url).hostname,file=sys.stderr)
   if attempt==2 or e.code not in (429,500,502,503,504):raise
   try:delay=min(20,max(3,int(e.headers.get('Retry-After','3'))))
   except (ValueError,TypeError):delay=3
   time.sleep(delay)
  except (urllib.error.URLError,TimeoutError):
   if attempt==2:raise
   time.sleep(3)

def collect(feeds,source_date,days=30):
 seen=set();items=[]
 for url in feeds:
  try: root=ET.fromstring(get(url))
  except Exception as e: print('feed unavailable:',type(e).__name__,file=sys.stderr);continue
  for item in root.findall('./channel/item'):
   headline=(item.findtext('title') or '').strip();link=(item.findtext('link') or '').strip();pub=item.findtext('pubDate') or ''
   try: date=email.utils.parsedate_to_datetime(pub).astimezone(JST).date()
   except (ValueError,TypeError,OverflowError):continue
   if not (source_date-dt.timedelta(days=days-1)<=date<=source_date) or not headline or len(headline)>300 or not link.startswith('https://') or link in seen:continue
   source=(item.findtext('source') or '').strip();seen.add(link)
   items.append({'id':len(items),'headline':headline,'source':source,'url':link,'publishedAt':pub})
 items.sort(key=lambda item:email.utils.parsedate_to_datetime(item['publishedAt']).timestamp(),reverse=True)
 return items[:500]

def ask(prompt,max_tokens=4096):
 key=os.environ.get('ANTHROPIC_API_KEY','')
 if not key:raise ValueError('ANTHROPIC_API_KEY が設定されていません')
 for attempt in range(3):
  limit=min(max_tokens*(attempt+2),24000)
  payload={'model':os.environ.get('NEWS_MODEL','claude-haiku-5-5'),'max_tokens':limit,'messages':[{'role':'user','content':prompt}]}
  req=urllib.request.Request('https://api.anthropic.com/v1/messages',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},method='POST')
  with urllib.request.urlopen(req,timeout=110) as response: result=json.load(response)
  text=''.join(x.get('text','') for x in result.get('content',[]) if x.get('type')=='text').strip()
  if text.startswith('```'):text=re.sub(r'^```(?:json)?\s*|\s*```$','',text)
  try:
   if result.get('stop_reason')=='max_tokens':raise ValueError('返答が途中で切れました')
   parsed=json.loads(text)
   if not isinstance(parsed,dict):raise ValueError('返答の形式が正しくありません')
   return parsed
  except (ValueError,TypeError):
   print('AIの返答を読み取れません。再試行:',attempt+1,file=sys.stderr)
 raise ValueError('AIの返答を読み取れませんでした')

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
   score=len(query & grams(m.get('title','')+' '+q+' '+a))+sum(12 for word in words if word and word in a)
   if score:rows.append((score,hashlib.sha256((m['id']+'/'+c['id']).encode()).hexdigest(),{'lessonId':m['id'],'cardId':c['id'],'q':q,'a':a,'title':m.get('title','')}))
 rows.sort(key=lambda x:(-x[0],x[1]));return [v for _,_,v in rows[:30]]

def generate(items,catalog,data,source_date,wanted=None,edition_date=None,excluded=()):
 items=[x for x in items if x['url'] not in set(excluded)]
 if not items:return {'items':[]}
 edition_date=edition_date or source_date+dt.timedelta(days=1)
 wanted=list(wanted or FIELDS)
 choices=[{'id':x['id'],'headline':x['headline'],'source':x['source'],'publishedAt':x['publishedAt'],'kind':x.get('kind','news')} for x in items]
 selection=ask('中学生向け。直近30日間のニュースの見出しから、地理・歴史・公民・物理・化学・生物・地学の7分野につながる話題をそれぞれ選ぶ。見出しにない事実は想像しない。適切なものがない場合はnull。同じ記事を複数分野で使わない。同じ出来事の別記事も選ばない。各分野で既存の中学教材を検索する具体的な語を5個まで提案。JSONのみ。形式 {"geography":{"id":0,"keywords":["地震"]},"history":null,"civics":null,"physics":null,"chemistry":null,"biology":null,"earth":null}。新しい記事を優先しつつ、指定された分野を必ず探す。分野: '+json.dumps(wanted,ensure_ascii=False)+' ニュース一覧: '+json.dumps(choices,ensure_ascii=False))
 proposed={};chosen_urls=set(excluded);byid={x['id']:x for x in items}
 for field in wanted:
  a=selection.get(field)
  if not isinstance(a,dict) or a.get('id') not in byid or not isinstance(a.get('keywords'),list):continue
  words=[x for x in a['keywords'] if isinstance(x,str) and len(x)<=30][:5]
  news=byid[a['id']]
  if news['url'] in chosen_urls:continue
  cs=candidates(catalog,data,field,[news['headline']]+words)
  if cs:
   news_context=dict(news)
   chosen_urls.add(news['url'])
   news_context['publicationDateJST']=email.utils.parsedate_to_datetime(news['publishedAt']).astimezone(JST).date().isoformat() if news.get('publishedAt') else None
   proposed[field]={'news':news_context,'candidates':cs}
 if not proposed:return {'version':1,'date':edition_date.isoformat(),'sourceDate':source_date.isoformat(),'generatedAt':dt.datetime.now(JST).isoformat(),'items':[]}
 prompt='''あなたは中学生向けの塾講師。ニュースと問題の関連を教える。分野ごとに候補問題から厳密に1つ選び、無理に結びつけず、関連が弱ければ省略する。報道の見出しから確実に分かる事実以外は書かない。記事本文は未取得、背景・数字・理由を推測しない。見出しだけから重要性や比較が不明なら断定しない。
次の品質基準を必ず守る。ニュースの要約だけで終わらず、子どもに『結局どういう話？』の答えをあげる。articleは2〜3文、80〜160字目安で、出来事→暮らしへの意味・争点を示す。neko/cyberは2〜3文、70〜150字目安で、身近な例や原因→結果→問題の答えへの橋渡しを説明する。articleと解説で同じ説明を繰り返さない。単に『答えと同じ言葉』『セットで覚えよう』『しっかり覚えよう』で埋めない。ニュースの当事者の意図・数字は推測せず、一般的な仕組みは教材の知識として説明してよい。
例：法人税を上げる案なら『国がお金を集めるため、会社への税金を増やす案が出たんだぜ。増税すると会社の手元に残るお金は減る。国に必要なお金を、誰がどれだけ負担するかがポイントだぜ。』解説は『売り上げが100万円でも、仕入れなどに80万円使えば、もうけは20万円。このもうけにかかる税金が法人税だぜ。売り上げ全部への税金とは区別しようぜ。』のように具体化する。ただし税額そのものの単純計算はしない。
省庁名、拠点、就航、検討、共生などは不可欠でない限り簡単な言葉に言い換える。覚える用語以外の難しい補足を増やさない。両口調とも自然な日本語で。『報じられただぜ』『報じられていただぜ』『ありましただぜ』は禁止。『報じられたんだぜ』『報じられていたんだぜ』を使う。すべての文末に機械的に『だぜ』『にゃ』を足さない。出力前に文法を見直す。
kind=themeの入力は最近も関わりのある学習テーマであり、新しい出来事ではない。『今日のテーマは〜』『〜の仕組みを見てみよう』などと書き、発表・報道日や『最近決まった』などを作らない。入力のheadlineは参考資料の要点。ニュースがなければこのテーマを使い、適切な教材と結びつく場合は省略しない。
このページの掲載日（日本時間）は '''+edition_date.isoformat()+'''。各記事の publicationDateJST はニュースが報道された日であり、出来事が起こった日ではない。古い予報や予定を現在の予報・今後の予定として書かない。台風や天気、警報、災害、選挙、催し、公開予定など時間に敏感な記事は、日付が過ぎた可能性が少しでもあるなら「○月○日のニュースでは、〜と予想されていた」「〜と報じられていた」のように報道当時の話だと明示し、現在も続いている・これから起こるとは書かない。見出しが予報なら実際に起きたと断定しない。報道日以降に状況が変わったかは見出しだけでは分からない。古い記事の「今日」「明日」「まもなく」などを掲載日時点の言葉として使わない。年月日のあいまいな箇所は推測しない。過去日付の掲載分も後日読まれるので、予報・予定には必ず報道日を添えた過去の伝聞表現を使う。記事見出し・articleNeko・articleCyber・neko・cyberすべてで守る。例：掲載日2026-10-27、10月20日の「台風が23日接近見込み」なら「10月20日のニュースでは、台風が沖縄に近づくと予想されていた」と書く。生徒向け文章に制作上の説明は書かない。
文章は偏差値40程度の中学生が読みやすい短い日本語にする。覚えるべき単語以外の専門用語を使わない。「何が起きた」「どういうこと」「問題の答えとの関係」を短く示し、考え方の答えを教える。テーマは普通の言葉で。文体はNekopon=にゃ、Yorupon=だぜ。JSONだけ返す。形式 {"items":[{"field":"geography","lessonId":"候補と一致","cardId":"候補と一致","title":"短い見出し","articleNeko":"ニュースと意味","articleCyber":"同内容の別口調","neko":"問題の答えとのつながり","cyber":"同内容の別口調"}]}。候補: '''+json.dumps(proposed,ensure_ascii=False)
 result=ask(prompt,7000);output=[];used=set()
 for row in result.get('items',[]):
  f=row.get('field'); block=proposed.get(f)
  if not block or f in used:continue
  c=next((x for x in block['candidates'] if x['lessonId']==row.get('lessonId') and x['cardId']==row.get('cardId')),None)
  if not c:continue
  if any(not isinstance(row.get(k),str) or not 1<=len(row[k].strip())<=400 for k in ['title','articleNeko','articleCyber','neko','cyber']):continue
  news=block['news'];output.append({k:row[k].strip() for k in ['field','lessonId','cardId','title','articleNeko','articleCyber','neko','cyber']}|{'label':FIELDS[f],'url':news['url'],'source':news['source'],'sourceHeadline':news['headline'],'publishedAt':news['publishedAt'],'kind':news.get('kind','news')});used.add(f)

 return {'version':1,'temporalRules':1,'date':edition_date.isoformat(),'sourceDate':source_date.isoformat(),'generatedAt':dt.datetime.now(JST).isoformat(),'items':output}

# Stable, sourced learning themes. These are never described as newly reported events.
THEMES={
 'geography':('ハザードマップと避難場所。災害の被害や避難先を前もって確かめる地図。',['ハザードマップ','自然災害','避難'],'https://disaportal.gsi.go.jp/','国土地理院'),
 'history':('琉球王国は中国や東南アジア、日本との貿易や交流から独自の文化を育てた。',['琉球王国','尚巴志','貿易'],'https://www.bunka.go.jp/prmagazine/rensai/youkoso/youkoso_015.html','文化庁'),
 'civics':('法人税は会社の所得にかかる税金。売り上げと、費用を引いたもうけは異なる。',['法人税','税金','利益'],'https://www.mof.go.jp/tax_policy/summary/corporation/c01.htm','財務省'),
 'physics':('風力発電は風で羽根を回し、その回転で発電機を動かして電気をつくる。',['電磁誘導','発電機','エネルギー'],'https://www.chuden.co.jp/energy/renew/ren_shikumi/win_shikumi/','中部電力'),
 'chemistry':('プラスチックは種類に分けて回収し、材料として再び使う取り組みが進められている。',['プラスチック','ポリエチレン','リサイクル','密度'],'https://plastic-circulation.env.go.jp/shohisha/recycle','環境省'),
 'biology':('人の暮らしは、食料や水など自然からの恵みに支えられている。自然を守ることは暮らしを守ることにもつながる。',['生態系','食物連鎖','持続可能な社会'],'https://www.env.go.jp/nature/biodic/jbo2.html','環境省'),
 'earth':('火山ではマグマや火山ガスなどが地表に噴き出す。火山の情報は防災にも役立つ。',['噴火','マグマ','火山'],'https://www.jma.go.jp/jma/kishou/know/kazan/kazanyougo/funka.html','気象庁')}
QUERIES={'geography':'地理 観光 農業 防災','history':'歴史 文化財 発掘','civics':'経済 税金 社会','physics':'発電 エネルギー 電池','chemistry':'化学 素材 プラスチック','biology':'生物 自然 生態系','earth':'宇宙 火山 地震 気象'}

def check_complete(result):
 rows=result.get('items',[])
 if len(rows)!=7 or {x.get('field') for x in rows}!=set(FIELDS):raise ValueError('7分野がそろわないため公開しません')
 if len({x['url'] for x in rows})!=7:raise ValueError('記事が重複しているため公開しません')
 for row in rows:
  for k in ['articleNeko','articleCyber','neko','cyber']:
   row[k]=re.sub(r'(報じられ(?:てい)?た)だぜ',r'\1んだぜ',row[k])
   if re.search(r'(?:ました|だった|された)だぜ',row[k]):raise ValueError('不自然な語尾が残っています')
 result['qualityVersion']=QUALITY_VERSION

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--date',type=dt.date.fromisoformat);parser.add_argument('--skip-existing',action='store_true');args=parser.parse_args()
 edition=args.date or dt.datetime.now(JST).date();source=edition-dt.timedelta(days=1)
 if edition>dt.datetime.now(JST).date():raise ValueError('未来の日付は指定できません')
 output=ROOT/'news'/'daily';path=output/(edition.isoformat()+'.json')
 if args.skip_existing and path.exists():
  previous=json.loads(path.read_text())
  if previous.get('qualityVersion')==QUALITY_VERSION:
   try:check_complete(previous)
   except ValueError:pass
   else:print('完成済み:',edition);return
 items=collect(FEEDS,source,days=30)
 catalog,data=read_inputs()
 result=generate(items,catalog,data,source,edition_date=edition) if items else {'items':[]}
 # Separate searches for missing fields, then a truthful sourced learning theme.
 for field in FIELDS:
  if any(x['field']==field for x in result['items']):continue
  used=[x['url'] for x in result['items']]
  query=QUERIES[field]+' after:'+(source-dt.timedelta(days=90)).isoformat()+' before:'+(source+dt.timedelta(days=1)).isoformat()
  feed='https://news.google.com/rss/search?q='+urllib.parse.quote(query)+'&hl=ja&gl=JP&ceid=JP:ja'
  more=collect([feed],source,days=90)
  extra=generate(more,catalog,data,source,[field],edition_date=edition,excluded=used) if more else {'items':[]}
  if not extra['items']:
   headline,keywords,url,publisher=THEMES[field]
   fallback=[{'id':0,'headline':headline,'source':publisher,'url':url,'publishedAt':'','kind':'theme'}]
   extra=generate(fallback,catalog,data,source,[field],edition_date=edition,excluded=used)
  result['items'].extend(extra['items'])
 # Have the model inspect all seven for the same event under different headlines.
 review=ask('以下の7話題で同じ出来事を二重に使っている場合、後の分野だけをJSONのreplaceFields配列で返す。関連する広いテーマでも出来事が別なら重複ではない。形式 {"replaceFields":[]}。'+json.dumps([{'field':x['field'],'headline':x.get('sourceHeadline'),'title':x['title']} for x in result['items']],ensure_ascii=False),1000)
 for field in review.get('replaceFields',[]):
  if field not in FIELDS:continue
  headline,keywords,url,publisher=THEMES[field];others=[x for x in result['items'] if x['field']!=field]
  extra=generate([{'id':0,'headline':headline,'source':publisher,'url':url,'publishedAt':'','kind':'theme'}],catalog,data,source,[field],edition_date=edition,excluded=[x['url'] for x in others])
  result['items']=others+extra['items']
 result.update(version=1,temporalRules=1,date=edition.isoformat(),sourceDate=source.isoformat(),generatedAt=dt.datetime.now(JST).isoformat())
 check_complete(result)
 order={field:i for i,field in enumerate(FIELDS)};result['items'].sort(key=lambda x:order[x['field']])
 output.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
 dates=sorted([p.stem for p in output.glob('????-??-??.json')],reverse=True)
 temp=output/'index.tmp';temp.write_text(json.dumps({'version':1,'dates':dates},ensure_ascii=False,indent=2)+'\n');temp.replace(output/'index.json')
 print('作成:',edition,'7分野（学習テーマ',sum(x.get('kind')=='theme' for x in result['items']),'件）')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ニュース更新失敗:',str(e),file=sys.stderr);sys.exit(1)
