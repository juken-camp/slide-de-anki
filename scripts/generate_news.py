#!/usr/bin/env python3
"""Daily news generator. The repository's existing assessment and catalog are inputs."""
import argparse, time, urllib.error, datetime as dt, email.utils, hashlib, json, os, re, sys, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
JST=dt.timezone(dt.timedelta(hours=9)); ROOT=Path(__file__).resolve().parents[1]
QUALITY_VERSION=4
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

def response_schema(kind,wanted=None):
 if kind=='selection':
  choice={'anyOf':[{'type':'null'},{'type':'object','properties':{'id':{'type':'integer'},'keywords':{'type':'array','items':{'type':'string'},'maxItems':5}},'required':['id','keywords'],'additionalProperties':False}]}
  return {'type':'object','properties':{f:choice for f in wanted},'required':list(wanted),'additionalProperties':False}
 if kind=='review':return {'type':'object','properties':{'replaceFields':{'type':'array','items':{'type':'string','enum':list(FIELDS)}}},'required':['replaceFields'],'additionalProperties':False}
 properties={k:{'type':'string','minLength':1} for k in ['field','lessonId','cardId','title','articleNeko','articleCyber','neko','cyber']};properties['field']['enum']=list(FIELDS)
 return {'type':'object','properties':{'items':{'type':'array','items':{'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}}},'required':['items'],'additionalProperties':False}

def validate_response(value,schema,path='result'):
 if 'anyOf' in schema:
  for option in schema['anyOf']:
   try:validate_response(value,option,path);return
   except ValueError:pass
  raise ValueError(path+': 指定形式と一致しません')
 kind=schema.get('type')
 valid={'object':isinstance(value,dict),'array':isinstance(value,list),'string':isinstance(value,str),'integer':type(value) is int,'null':value is None}
 if kind and not valid.get(kind,False):raise ValueError(path+': '+kind+'型が必要です')
 if 'enum' in schema and value not in schema['enum']:raise ValueError(path+': 指定外の値です')
 if kind=='object':
  props=schema.get('properties',{})
  if any(k not in value for k in schema.get('required',[])):raise ValueError(path+': 必須項目がありません')
  if schema.get('additionalProperties') is False and set(value)-set(props):raise ValueError(path+': 指定外の項目があります')
  for key,item in value.items():
   if key in props:validate_response(item,props[key],path+'.'+key)
 if kind=='array':
  if len(value)>schema.get('maxItems',float('inf')):raise ValueError(path+': 項目が多すぎます')
  for i,item in enumerate(value):validate_response(item,schema['items'],path+'['+str(i)+']')
 if kind=='string' and len(value)<schema.get('minLength',0):raise ValueError(path+': 空の文章です')

def parse_result(result,schema=None):
 if not isinstance(result,dict):raise ValueError('AI応答がオブジェクトではありません')
 if result.get('stop_reason')=='max_tokens':raise ValueError('返答が途中で切れました')
 content=result.get('content')
 if not isinstance(content,list):raise ValueError('AI応答のcontentが配列ではありません')
 blocks=[b for b in content if isinstance(b,dict) and b.get('type')=='tool_use' and b.get('name')=='submit_news_result']
 if len(blocks)!=1 or not isinstance(blocks[0].get('input'),dict):raise ValueError('指定した形式のデータがありません')
 value=blocks[0]['input']
 if schema is not None:validate_response(value,schema)
 return value

def ask(prompt,max_tokens=4096,schema=None):
 key=os.environ.get('ANTHROPIC_API_KEY','')
 if not key:raise ValueError('ANTHROPIC_API_KEY が設定されていません')
 if schema is None:raise ValueError('AI返答の形式が指定されていません')
 for attempt in range(3):
  payload={'model':os.environ.get('NEWS_MODEL','claude-haiku-5-5'),'max_tokens':min(max_tokens*(attempt+2),24000),'messages':[{'role':'user','content':prompt+'\n回答はsubmit_news_resultへ入力して提出してください。'}],'tools':[{'name':'submit_news_result','description':'Submit the selected news data in the requested schema. This tool only returns data and performs no external action.','input_schema':schema}],'tool_choice':{'type':'tool','name':'submit_news_result','disable_parallel_tool_use':True}}
  req=urllib.request.Request('https://api.anthropic.com/v1/messages',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},method='POST')
  try:
   with urllib.request.urlopen(req,timeout=110) as response:result=json.load(response)
  except urllib.error.HTTPError as e:
   print('AI API HTTP:',e.code,'試行:',attempt+1,file=sys.stderr)
   if e.code not in (429,500,502,503,504,529) or attempt==2:raise
   time.sleep(3*(attempt+1));continue
  except (urllib.error.URLError,TimeoutError):
   print('AI API通信待ち失敗。試行:',attempt+1,file=sys.stderr)
   if attempt==2:raise
   time.sleep(3);continue
  try:return parse_result(result,schema)
  except (ValueError,TypeError) as e:
   print('AIデータ受取失敗:',str(e),'段階:',','.join(schema['properties']),'stop_reason:',(result.get('stop_reason') if isinstance(result,dict) else None),'response_id:',(result.get('id') if isinstance(result,dict) else None),'試行:',attempt+1,file=sys.stderr)
 raise ValueError('AIから指定形式のデータを受け取れませんでした。上の段階別ログを確認してください')

def read_inputs():
 raw=(ROOT/'catalog.js').read_text(); catalog=json.loads(re.sub(r';\s*$','',re.sub(r'^\s*window\.QUIZ_CATALOG\s*=\s*','',raw)))
 files=list((ROOT/'nekopon-data').glob('assessment-*.json'))
 if len(files)!=1:raise ValueError('採点データが一つに特定できません')
 data=json.loads(files[0].read_text());return catalog,data

def grams(text):
 text=re.sub(r'[^\w\u3040-\u30ff\u4e00-\u9fff]','',text);return set(text[i:i+2] for i in range(max(0,len(text)-1)))

# Historical exclusion is based on the edition date, never the wall clock.
RECENT=[]
SUBTOPICS={
 'earth':{'天体':['天体','月','太陽','惑星','星座','宇宙','日食'],'地震':['地震','震源','震度','断層','津波'],'火山':['火山','噴火','マグマ','溶岩'],'地層':['地層','化石','堆積','岩石'],'天気':['台風','前線','低気圧','気圧','湿度','雲','天気']},
 'physics':{'電気':['電流','電圧','電気','電池','磁界','発電'],'光':['光','レンズ','反射','屈折'],'音':['音','振動'],'力':['力','圧力','浮力','重力'],'エネルギー':['仕事','エネルギー','運動']},
 'chemistry':{'物質':['物質','密度','プラスチック','金属'],'気体':['気体','酸素','二酸化炭素','水素'],'状態変化':['融点','沸点','蒸留','状態変化'],'化学変化':['化学変化','酸化','還元','燃焼'],'イオン':['イオン','酸性','アルカリ','中和','電気分解']},
 'biology':{'植物':['植物','光合成','葉','根','花'],'動物':['動物','消化','血液','呼吸','神経'],'細胞と遺伝':['細胞','遺伝','生殖','染色体'],'生態系':['生態系','食物連鎖','自然','持続可能','生物多様性']},
 'geography':{'産業':['産業','農業','工業','漁業','貿易'],'人口と地域':['人口','都市','観光','交通'],'環境と防災':['災害','地震','台風','環境','ハザード'],'世界':['大陸','国','世界','緯度','経度']},
 'history':{'古代':['縄文','弥生','古墳','飛鳥','奈良','平安'],'中世':['鎌倉','室町','琉球','武士'],'近世':['江戸','徳川','戦国','織田','豊臣'],'近現代':['明治','大正','昭和','革命','世界大戦','憲法']},
 'civics':{'政治':['国会','選挙','内閣','裁判','地方自治'],'人権':['人権','憲法','自由','平等'],'経済':['税','金融','銀行','需要','供給','価格','会社'],'国際と福祉':['国際','国連','社会保障','福祉','環境']}}

def norm(value):
 value=re.sub(r'（[^）]*）|\([^)]*\)','',str(value))
 return re.sub(r'[^\w\u3040-\u30ff\u4e00-\u9fff]','',value).casefold()

def answer_keys(card):
 value=str(card.get('a','')).strip()
 # Choice letters and bare numbers do not identify a learning concept.
 if re.fullmatch(r'[0-9０-９\s.．＋+−-]+',value) or re.fullmatch(r'[A-Da-dア-オ](?:[\s・/／,，、]+[A-Da-dア-オ])*',value):return set()
 return {norm(x) for x in re.split(r'[／/\n]',value) if norm(x)}

def topic(field,text):
 scores={name:sum(len(word) for word in words if word in text) for name,words in SUBTOPICS.get(field,{}).items()}
 return max(scores,key=scores.get) if scores and max(scores.values()) else 'その他'

def card_for(data,lid,cid):
 return next((c for c in data.get('lessons',{}).get(lid,{}).get('cards',[]) if c.get('id')==cid),None)

def load_recent(data,edition):
 rows=[]
 for path in sorted((ROOT/'news'/'daily').glob('????-??-??.json')):
  day=dt.date.fromisoformat(path.stem)
  if not edition-dt.timedelta(days=7)<=day<edition:continue
  previous=json.loads(path.read_text())
  if previous.get('date')!=path.stem or not isinstance(previous.get('items'),list):raise ValueError('過去のニュース履歴の形式が不正です: '+path.name)
  for row in previous['items']:
   field=row.get('field');c=card_for(data,row.get('lessonId'),row.get('cardId'))
   rows.append({'field':field,'day':day,'key':(row.get('lessonId'),row.get('cardId')),'answers':answer_keys(c or {}),'question':norm((c or {}).get('q','')),'topic':topic(field,str((c or {}).get('q',''))+' '+str((c or {}).get('a',''))),'url':row.get('url'),'title':row.get('title','')})
 return rows

def recently_used(field,lid,c):
 return any(r['field']==field and (r['key']==(lid,c['id']) or (r['question'] and r['question']==norm(c.get('q',''))) or bool(r['answers']&answer_keys(c))) for r in RECENT)

def topic_penalty(field,c):
 bucket=topic(field,str(c.get('q',''))+' '+str(c.get('a','')))
 return sum(1 for r in RECENT if r['field']==field and r['topic']==bucket)

def candidates(catalog,data,field,words):
 query=grams(' '.join(words));rows=[]
 for m in catalog:
  if m.get('field')!=field:continue
  for c in data.get('lessons',{}).get(m['id'],{}).get('cards',[]):
   q=str(c.get('q',''));a=str(c.get('a',''))
   if recently_used(field,m['id'],c):continue
   if not c.get('eligible') or not q or not a or len(q)>200 or len(a)>120:continue
   if c.get('image') or re.search(r'図[のはを中]|下の図|次の図|写真|グラフ|地図|表[のをは]',q):continue
   score=len(query & grams(m.get('title','')+' '+q+' '+a))+sum(12 for word in words if word and word in a)
   if score:rows.append((topic_penalty(field,c),score,hashlib.sha256((m['id']+'/'+c['id']).encode()).hexdigest(),{'lessonId':m['id'],'cardId':c['id'],'q':q,'a':a,'title':m.get('title','')}))
 rows.sort(key=lambda x:(x[0],-x[1],x[2]));return [v for _,_,_,v in rows[:30]]

def has_editorial_commentary(text):
 return bool(re.search(r'見出し|記事本文|本文.{0,10}(?:未取得|取得していない)|(?:中身|詳細).{0,12}(?:分から|わから)|情報が(?:足り|不足)|制作(?:上|側)|候補問題|生成(?:過程|側)',text))

def generate(items,catalog,data,source_date,wanted=None,edition_date=None,excluded=()):
 blocked=set(excluded)|{r['url'] for r in RECENT}
 items=[x for x in items if x['url'] not in blocked or x.get('kind')=='theme']
 if not items:return {'items':[]}
 edition_date=edition_date or source_date+dt.timedelta(days=1)
 wanted=list(wanted or FIELDS)
 choices=[{'id':x['id'],'headline':x['headline'],'source':x['source'],'publishedAt':x['publishedAt'],'kind':x.get('kind','news')} for x in items]
 history_hint=json.dumps([{'field':r['field'],'topic':r['topic'],'title':r['title']} for r in RECENT],ensure_ascii=False)
 selection=ask('直近7日間の出題履歴は '+history_hint+'。同じ出来事・同じ小分野への偏りを避ける。地学は天気だけでなく天体・地震・火山・地層も探す。中学生向け。直近30日間のニュースの見出しから、地理・歴史・公民・物理・化学・生物・地学の7分野につながる話題をそれぞれ選ぶ。見出しにない事実は想像しない。適切なものがない場合はnull。同じ記事を複数分野で使わない。同じ出来事の別記事も選ばない。各分野で既存の中学教材を検索する具体的な語を5個まで提案。JSONのみ。形式 {"geography":{"id":0,"keywords":["地震"]},"history":null,"civics":null,"physics":null,"chemistry":null,"biology":null,"earth":null}。新しい記事を優先しつつ、指定された分野を必ず探す。分野: '+json.dumps(wanted,ensure_ascii=False)+' ニュース一覧: '+json.dumps(choices,ensure_ascii=False),schema=response_schema('selection',wanted))
 proposed={};chosen_urls=set(excluded);byid={x['id']:x for x in items}
 for field in wanted:
  a=selection.get(field)
  if not isinstance(a,dict) or a.get('id') not in byid or not isinstance(a.get('keywords'),list):continue
  words=[x for x in a['keywords'] if isinstance(x,str) and len(x)<=30][:5]
  news=byid[a['id']]
  if news['url'] in chosen_urls:continue
  cs=candidates(catalog,data,field,[news['headline']]+words)
  if news.get('anchor'):
   anchor=news['anchor'];c=card_for(data,anchor['lessonId'],anchor['cardId'])
   cs=[{'lessonId':anchor['lessonId'],'cardId':c['id'],'q':c['q'],'a':c['a'],'title':next(m['title'] for m in catalog if m['id']==anchor['lessonId'])}] if c and not recently_used(field,anchor['lessonId'],c) else []
  if cs:
   news_context=dict(news)
   chosen_urls.add(news['url'])
   news_context['publicationDateJST']=email.utils.parsedate_to_datetime(news['publishedAt']).astimezone(JST).date().isoformat() if news.get('publishedAt') else None
   proposed[field]={'news':news_context,'candidates':cs}
 if not proposed:return {'version':1,'date':edition_date.isoformat(),'sourceDate':source_date.isoformat(),'generatedAt':dt.datetime.now(JST).isoformat(),'items':[]}
 prompt='''あなたは中学生向けの塾講師。ニュースと問題の関連を教える。候補は最近扱っていない小分野を優先して並べてある。可能なら上位から自然につながるものを選ぶ。違う問題でも同じ話の繰り返しにしない。分野ごとに候補問題から厳密に1つ選び、無理に結びつけず、関連が弱ければ省略する。報道の見出しから確実に分かる事実以外は書かない。記事本文は未取得、背景・数字・理由を推測しない。見出しだけから重要性や比較が不明なら断定しない。
次の品質基準を必ず守る。ニュースの要約だけで終わらず、子どもに『結局どういう話？』の答えをあげる。articleは2〜3文、80〜160字目安で、出来事→暮らしへの意味・争点を示す。neko/cyberは2〜3文、70〜150字目安で、身近な例や原因→結果→問題の答えへの橋渡しを説明する。articleと解説で同じ説明を繰り返さない。単に『答えと同じ言葉』『セットで覚えよう』『しっかり覚えよう』で埋めない。ニュースの当事者の意図・数字は推測せず、一般的な仕組みは教材の知識として説明してよい。
例：法人税を上げる案なら『国がお金を集めるため、会社への税金を増やす案が出たんだぜ。増税すると会社の手元に残るお金は減る。国に必要なお金を、誰がどれだけ負担するかがポイントだぜ。』解説は『売り上げが100万円でも、仕入れなどに80万円使えば、もうけは20万円。このもうけにかかる税金が法人税だぜ。売り上げ全部への税金とは区別しようぜ。』のように具体化する。ただし税額そのものの単純計算はしない。
省庁名、拠点、就航、検討、共生などは不可欠でない限り簡単な言葉に言い換える。覚える用語以外の難しい補足を増やさない。両口調とも自然な日本語で。『報じられただぜ』『報じられていただぜ』『ありましただぜ』は禁止。『報じられたんだぜ』『報じられていたんだぜ』を使う。すべての文末に機械的に『だぜ』『にゃ』を足さない。出力前に文法を見直す。
kind=themeの入力は最近も関わりのある学習テーマであり、新しい出来事ではない。『今日のテーマは〜』『〜の仕組みを見てみよう』などと書き、発表・報道日や『最近決まった』などを作らない。入力のheadlineは参考資料の要点。ニュースがなければこのテーマを使い、適切な教材と結びつく場合は省略しない。
このページの掲載日（日本時間）は '''+edition_date.isoformat()+'''。各記事の publicationDateJST はニュースが報道された日であり、出来事が起こった日ではない。古い予報や予定を現在の予報・今後の予定として書かない。台風や天気、警報、災害、選挙、催し、公開予定など時間に敏感な記事は、日付が過ぎた可能性が少しでもあるなら「○月○日のニュースでは、〜と予想されていた」「〜と報じられていた」のように報道当時の話だと明示し、現在も続いている・これから起こるとは書かない。見出しが予報なら実際に起きたと断定しない。報道日以降に状況が変わったかは見出しだけでは分からない。古い記事の「今日」「明日」「まもなく」などを掲載日時点の言葉として使わない。年月日のあいまいな箇所は推測しない。過去日付の掲載分も後日読まれるので、予報・予定には必ず報道日を添えた過去の伝聞表現を使う。記事見出し・articleNeko・articleCyber・neko・cyberすべてで守る。例：掲載日2026-10-27、10月20日の「台風が23日接近見込み」なら「10月20日のニュースでは、台風が沖縄に近づくと予想されていた」と書く。生徒向け文章に制作上の説明は書かない。
生徒に見せる文章では「見出し」「記事本文」「本文を取得していない」「中身は分からない」「情報が足りない」「候補」「生成」など、制作・収集・分析上の事情を説明しない。不明な細部は書かず、確認できた出来事と、中学校で学ぶ仕組みを具体的に説明する。確認できた事実だけでは意味のある文章を作れない記事は選ばず、別の記事または学習テーマを使う。「同じ言葉がある」「答えとつながる」「セットで覚えよう」だけの説明は不可。ニュースで扱われた研究と教科書の研究が別なら同一視せず、学ぶ仕組みの関係を説明する。
文章は偏差値40程度の中学生が読みやすい短い日本語にする。覚えるべき単語以外の専門用語を使わない。「何が起きた」「どういうこと」「問題の答えとの関係」を短く示し、考え方の答えを教える。テーマは普通の言葉で。文体はNekopon=にゃ、Yorupon=だぜ。JSONだけ返す。形式 {"items":[{"field":"geography","lessonId":"候補と一致","cardId":"候補と一致","title":"短い見出し","articleNeko":"ニュースと意味","articleCyber":"同内容の別口調","neko":"問題の答えとのつながり","cyber":"同内容の別口調"}]}。候補: '''+json.dumps(proposed,ensure_ascii=False)
 result=ask(prompt,7000,schema=response_schema('items'));output=[];used=set()
 for row in result.get('items',[]):
  f=row.get('field'); block=proposed.get(f)
  if not block or f in used:continue
  c=next((x for x in block['candidates'] if x['lessonId']==row.get('lessonId') and x['cardId']==row.get('cardId')),None)
  if not c:continue
  if any(not isinstance(row.get(k),str) or not 1<=len(row[k].strip())<=400 for k in ['title','articleNeko','articleCyber','neko','cyber']):continue
  if any(has_editorial_commentary(row[k]) for k in ['title','articleNeko','articleCyber','neko','cyber']):continue
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

def theme_fallback(field,catalog,data,source,edition,excluded):
 headline,keywords,url,publisher=THEMES[field]
 choices=candidates(catalog,data,field,[headline]+keywords)
 if choices:
  seed=[{'id':0,'headline':headline,'source':publisher,'url':url,'publishedAt':'','kind':'theme'}]
  extra=generate(seed,catalog,data,source,[field],edition_date=edition,excluded=excluded)
  if extra['items']:return extra
 # Broaden the subject, rather than repeating a familiar answer or forcing a match.
 options=[]
 for m in catalog:
  if m.get('field')!=field or not str(m.get('source','')).startswith('https://'):continue
  for c in data.get('lessons',{}).get(m['id'],{}).get('cards',[]):
   if not c.get('eligible') or recently_used(field,m['id'],c) or c.get('image'):continue
   q,a=str(c.get('q','')),str(c.get('a',''))
   if not q or not a or len(q)>200 or len(a)>120 or re.search(r'図[のはを中]|下の図|次の図|写真|グラフ|地図|表[のをは]',q):continue
   options.append((topic_penalty(field,c),hashlib.sha256((edition.isoformat()+m['id']+c['id']).encode()).hexdigest(),m,c))
 options.sort(key=lambda x:(x[0],x[1]))
 for _,_,m,c in options[:3]:
  seed=[{'id':0,'headline':'暮らしや社会につながる学習テーマ。教材の確認済み内容：'+str(c['q'])+' 答え：'+str(c['a']),'source':'教材の元動画','url':m['source'],'publishedAt':'','kind':'theme','anchor':{'lessonId':m['id'],'cardId':c['id']}}]
  extra=generate(seed,catalog,data,source,[field],edition_date=edition,excluded=excluded)
  if extra['items']:return extra
 return {'items':[]}

def check_complete(result):
 rows=result.get('items',[])
 if len(rows)!=7 or {x.get('field') for x in rows}!=set(FIELDS):raise ValueError('7分野がそろわないため公開しません')
 if len({x['url'] for x in rows})!=7:raise ValueError('記事が重複しているため公開しません')
 for row in rows:
  if any(has_editorial_commentary(row[k]) for k in ['title','articleNeko','articleCyber','neko','cyber']):raise ValueError('生徒向けでない制作上の説明が含まれています')
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
 global RECENT
 RECENT=load_recent(data,edition)
 result=generate(items,catalog,data,source,edition_date=edition) if items else {'items':[]}
 # Separate searches for missing fields, then a truthful sourced learning theme.
 for field in FIELDS:
  if any(x['field']==field for x in result['items']):continue
  used=[x['url'] for x in result['items']]
  counts={name:sum(1 for r in RECENT if r['field']==field and r['topic']==name) for name in SUBTOPICS[field]}
  least=sorted(counts,key=counts.get)[:2]
  query='('+' OR '.join(SUBTOPICS[field][name][0] for name in least)+') after:'+(source-dt.timedelta(days=90)).isoformat()+' before:'+(source+dt.timedelta(days=1)).isoformat()
  feed='https://news.google.com/rss/search?q='+urllib.parse.quote(query)+'&hl=ja&gl=JP&ceid=JP:ja'
  more=collect([feed],source,days=90)
  extra=generate(more,catalog,data,source,[field],edition_date=edition,excluded=used) if more else {'items':[]}
  if not extra['items']:extra=theme_fallback(field,catalog,data,source,edition,used)
  result['items'].extend(extra['items'])
 # Have the model inspect all seven for the same event under different headlines.
 review=ask('直近の履歴は '+json.dumps([{'field':r['field'],'title':r['title'],'topic':r['topic']} for r in RECENT],ensure_ascii=False)+'。以下の今日の7話題で同じ出来事を二重に使っている場合、または履歴の同じ出来事の言い換えだけで学ぶ内容に変化がない場合、その今日の分野をJSONのreplaceFields配列で返す。記事の新展開があり問題の仕組みも別なら許可。関連する広いテーマでも出来事が別なら重複ではない。形式 {"replaceFields":[]}。'+json.dumps([{'field':x['field'],'headline':x.get('sourceHeadline'),'title':x['title']} for x in result['items']],ensure_ascii=False),1000,schema=response_schema('review'))
 for field in review.get('replaceFields',[]):
  if field not in FIELDS:continue
  others=[x for x in result['items'] if x['field']!=field]
  extra=theme_fallback(field,catalog,data,source,edition,[x['url'] for x in others])
  result['items']=others+extra['items']
 result.update(version=1,temporalRules=1,date=edition.isoformat(),sourceDate=source.isoformat(),generatedAt=dt.datetime.now(JST).isoformat())
 check_complete(result)
 for row in result['items']:
  c=card_for(data,row['lessonId'],row['cardId'])
  if not c or recently_used(row['field'],row['lessonId'],c):raise ValueError('過去7日と重複する問題が残ったため公開しません')
 order={field:i for i,field in enumerate(FIELDS)};result['items'].sort(key=lambda x:order[x['field']])
 output.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
 dates=sorted([p.stem for p in output.glob('????-??-??.json')],reverse=True)
 temp=output/'index.tmp';temp.write_text(json.dumps({'version':1,'dates':dates},ensure_ascii=False,indent=2)+'\n');temp.replace(output/'index.json')
 print('作成:',edition,'7分野（学習テーマ',sum(x.get('kind')=='theme' for x in result['items']),'件）')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ニュース更新失敗:',str(e),file=sys.stderr);sys.exit(1)
