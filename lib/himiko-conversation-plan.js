'use strict';
const {randomInt}=require('node:crypto');
const {topics}=require('./himiko-history-seeds.json');
const byId=new Map(topics.map(t=>[t.id,t]));
const freeTopics=[
 ['food','食べ物の好みと妙なこだわり'],['packing','旅の荷物を減らせない理由'],
 ['writing','短い投稿のはずが長くなる'],['research','調べものの寄り道'],
 ['tools','便利な道具なのに使い方にこだわる'],['design','作品やデザインの好みの違い'],
 ['planning','段取り派と勢い派'],['weather','雨の日の過ごし方を一般論で話す'],
 ['hobby','好きなことだけ急に早口になる'],['wording','グルチャの一語が違って伝わる'],
 ['tidying','捨てられない持ち物'],['books','本や物語の続きを待つ'],
 ['music','音楽の好みが意外に合う'],['shopping','買い物で何を重視するか'],
 ['practice','練習や創作でついやってしまう癖'],['letters','手紙とチャットの文章量の違い']
].map(([id,label])=>({id:'free-'+id,label}));
const angles=[
 ['space','教科書の掲載量や扱われ方に、少し張り合う。掲載量・ページ・評価は実際に確認した事実として作らない。'],
 ['confusion','似ている名称や人物と一緒にされて、本人が短く訂正し相手が言い返す。'],
 ['reaction','本人には大事な実績なのに、相手は意外な細部に食いつく。'],
 ['analogy','史実の仕組みを身近なことにたとえ、相手がたとえの妙な所を拾う。'],
 ['pride','ちょっと得意げな本人に、親しい人が軽くツッコみ本人も返す。'],
 ['contrast','時代や立場の違う人同士で意外に気が合い、別の点ですれ違う。'],
 ['detail','誰かのこだわりが急に細かくなり、相手の短い返しで話が変わる。'],
 ['question','人物自身の素朴な疑問から始まり、他の人の実績との違いが見える。']
].map(([id,hint])=>({id,hint}));
function shuffle(values,rng=randomInt){
 const a=[...values];for(let i=a.length-1;i>0;i--){const j=rng(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;
}
// Stored history is bounded and contains identifiers only, never private human messages.
function cleanHistory(history){return (Array.isArray(history)?history:[]).filter(h=>h&&
 (byId.has(h.topicId)||freeTopics.some(t=>t.id===h.topicId))).slice(-100).map(h=>({
 topicId:h.topicId,angleId:angles.some(a=>a.id===h.angleId)?h.angleId:'',at:Number(h.at)||0
}));}
function makePlan(history=[],rng=randomInt){
 const past=cleanHistory(history),selected=[],eras=new Set(),families=new Set();
 const recent=past.slice(-25),recentIds=new Set(recent.map(h=>h.topicId));
 const recentFamilies=new Set(recent.map(h=>byId.get(h.topicId)?.family).filter(Boolean));
 const countEra=era=>past.slice(-35).filter(h=>byId.get(h.topicId)?.era===era).length;
 const last=id=>past.map(h=>h.topicId).lastIndexOf(id);
 for(let i=0;i<3;i++){
  let pool=topics.filter(t=>!eras.has(t.era)&&!families.has(t.family));
  const fresh=pool.filter(t=>!recentIds.has(t.id)&&!recentFamilies.has(t.family));
  if(fresh.length)pool=fresh;
  // Shuffling BEFORE stable sorting avoids always selecting the start/middle of the file.
  pool=shuffle(pool,rng).sort((a,b)=>countEra(a.era)-countEra(b.era)||last(a.id)-last(b.id));
  const topic=pool[0];selected.push({kind:'history',topicId:topic.id});eras.add(topic.era);families.add(topic.family);
 }
 let free=shuffle(freeTopics,rng).filter(t=>!recentIds.has(t.id));
 if(free.length<2)free=shuffle(freeTopics,rng).sort((a,b)=>last(a.id)-last(b.id));
 selected.push(...free.slice(0,2).map(t=>({kind:'free',topicId:t.id})));
 let anglePool=shuffle(angles,rng).filter(a=>!past.slice(-3).some(h=>h.angleId===a.id));
 if(anglePool.length<5)anglePool=shuffle(angles,rng);
 return shuffle(selected,rng).map((p,i)=>({...p,angleId:anglePool[i].id}));
}
function validPlan(plan){return Array.isArray(plan)&&plan.length===5&&
 plan.filter(p=>p?.kind==='history'&&byId.has(p.topicId)).length===3&&
 plan.filter(p=>p?.kind==='free'&&freeTopics.some(t=>t.id===p.topicId)).length===2&&
 new Set(plan.map(p=>p.topicId)).size===5&&plan.every(p=>angles.some(a=>a.id===p.angleId));}
function promptFor(plan){
 if(!validPlan(plan))return '';
 return `\n【コードで決定済みの5場面の話題】
以下の割当は場面ごとに固定。選び直したり、5場面を同じ話題の続きにしない。
偉人たちは異次元から現代の学校教育・歴史の学ばれ方も話題にできる。ただし実物の教科書や利用者の成績を見たふりはしない。
歴史3場面では、指定の用語を会話内に自然に一度以上出し、その意味・人物・出来事のつながりが読んで分かる掛け合いにする。用語を並べるだけ、長い講義、毎回の小テストやまとめは不要。
当事者や関心が近い人物を軸に、相手の短い反応で話を進める。同じ有名人・組合せに集中させない。本人がいなければ詳しい別の人物が話し、無理に不在者を参加させない。
自由な雑談2場面では、受験用語や教訓を無理に入れない。どの場面も口調は今のくだけた現代語を維持し、人物の立場や実績から生まれる言い分・すれ違い・言い返しで笑いを作る。「それわかる」「すごい」の同意やwwwだけで埋めない。
教材の問答は知識の土台。冗談のために正答・因果関係を変えず、創作の感情や現代のたとえを史実・名言として扱わない。犠牲者、差別、災害、戦争被害を笑いの対象にしない。嫉妬や自慢も、本人の現代語の創作の反応として表現する。
${plan.map((p,i)=>{
 const topic=byId.get(p.topicId),angle=angles.find(a=>a.id===p.angleId);
 return 'scene'+(i+1)+'：'+JSON.stringify(topic?{種類:'歴史の会話',時代:topic.era,必須用語:topic.term,既存教材の問い:topic.question,正答:topic.term,展開:angle.hint}:{種類:'自由な雑談',話題:freeTopics.find(t=>t.id===p.topicId).label,展開:angle.hint});
}).join('\n')}`;
}
function metadata(plan,index){return validPlan(plan)?{topicId:plan[index].topicId,angleId:plan[index].angleId}:null;}
function label(meta){return byId.get(meta?.topicId)?.term||freeTopics.find(t=>t.id===meta?.topicId)?.label||'';}
function matches(meta,replies){const topic=byId.get(meta?.topicId);return !topic||replies.some(r=>String(r.text||'').includes(topic.term));}
function remember(history,meta,at=Date.now()){
 if(!meta)return cleanHistory(history);
 return cleanHistory([...cleanHistory(history),{topicId:meta.topicId,angleId:meta.angleId,at}]);
}
module.exports={makePlan,promptFor,metadata,label,matches,remember,cleanHistory,validPlan,topics,freeTopics,angles};
