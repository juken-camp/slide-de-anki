(() => {
'use strict';
const $ = id => document.getElementById(id);
const list = $('h202-index-list'), box = $('h202-messages'), scroll = $('h202-scroll');
const layer = $('h202-index-layer'), guide = $('h202-explain-guide'), expl = $('h202-explain-body');
const search = $('h202-search'), searchInput = $('h202-search-input');
const state = {chapters:[],people:{},config:{mode:'reader'},selected:1,activeBubble:null,filter:'',lastProgress:new Map()};
const isPreview= new URLSearchParams(location.search).get('preview')==='1';
const LS_PREFIX='history202-last-position-v1:';
const AVATAR_FALLBACK={受験生:'🎓','AI先生':'📖'};
const safeTime=(v)=>{if(!v)return null;const ms=Date.parse(v);return Number.isFinite(ms)?ms:null};
function applyTheme(mode){const v=mode==='cyber'?'cyber':'neko';document.documentElement.dataset.persona=v;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',v==='cyber'?'#080d20':'#fffcf7');}
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data)return;if(e.data.type==='history202-theme'||e.data.type==='nekopon-persona')applyTheme(e.data.persona)});
function close(){if(parent!==window){parent.postMessage({type:'history202-close'},location.origin)}else if(history.length>1){history.back()}else{location.assign('himiko.html')}}
$('h202-back').addEventListener('click',close);
function openIndex(){layer.hidden=false;document.body.style.overflow='hidden';const current=list.querySelector('.is-current');current?.scrollIntoView({block:'nearest'});$('h202-index-close').focus();}
function closeIndex(){layer.hidden=true;$('h202-index-button').focus()}
$('h202-index-button').addEventListener('click',openIndex);
$('h202-chapter-current').addEventListener('click',openIndex);
$('h202-index-close').addEventListener('click',closeIndex);
$('h202-index-backdrop').addEventListener('click',closeIndex);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!layer.hidden)closeIndex();else if(!search.hidden){search.hidden=true;searchInput.value='';state.filter='';render()}}});
$('h202-search-button').addEventListener('click',()=>{search.hidden=!search.hidden;if(!search.hidden)searchInput.focus();else{searchInput.value='';state.filter='';render()}});
$('h202-search-clear').addEventListener('click',()=>{searchInput.value='';state.filter='';render();searchInput.focus()});
searchInput.addEventListener('input',()=>{state.filter=searchInput.value.trim().toLocaleLowerCase('ja');render()});
function scheduleInfo(chapterIndex,messageIndex){
 if(state.config.mode!=='broadcast'||isPreview)return {visible:true};
 const start=safeTime(state.config.startAt);
 if(start===null)return {visible:false,reason:'配信日時はまだ設定されていません。'};
 const interval=Math.max(2,Number(state.config.messageIntervalSeconds)||11)*1000;
 const gap=Math.max(1,Number(state.config.chapterGapMinutes)||60)*60000;
 let t=start;
 for(let i=0;i<chapterIndex;i++){t+=state.chapters[i].messages.length*interval+gap;}
 t+=messageIndex*interval;
 return {visible:Date.now()>=t,when:t,reason:'この発言は、まだ配信されていません。'};
}
function visibleMessages(ch,chapterIndex){
 if(state.config.mode!=='broadcast'||isPreview)return ch.messages;
 return ch.messages.filter((_,idx)=>scheduleInfo(chapterIndex,idx).visible);
}
function iconFor(sp){
 const meta=state.people[sp]||{};
 const node=document.createElement('span');node.className='h202-avatar';node.setAttribute('aria-hidden','true');
 if(meta.image){const img=document.createElement('img');img.src=meta.image;img.alt='';img.loading='lazy';img.onerror=()=>{img.remove();node.textContent=meta.icon||AVATAR_FALLBACK[sp]||'👤'};node.append(img)}else node.textContent=meta.icon||AVATAR_FALLBACK[sp]||'👤';
 return node;
}
function setExplanation(msg,element){
 const same=state.activeBubble?.dataset.id===msg.id;
 if(state.activeBubble)state.activeBubble.classList.remove('is-selected');
 if(same){state.activeBubble=null;guide.hidden=false;expl.hidden=true;expl.textContent='';return;}
 state.activeBubble=element;element.classList.add('is-selected');
 guide.hidden=true;expl.hidden=false;expl.textContent=msg.explanation||'この発言に対応する追加の説明はありません。';
 $('h202-explain').scrollTop=0;
}
function clearExplanation(){state.activeBubble?.classList.remove('is-selected');state.activeBubble=null;guide.hidden=false;expl.hidden=true;expl.textContent=''}
function addBubble(stack,msg){
 const b=document.createElement('button');b.type='button';b.className='h202-bubble'+(msg.kind==='index'||msg.kind==='recap'?' h202-bubble--'+msg.kind:'');b.dataset.id=msg.id;b.textContent=msg.text;b.setAttribute('aria-label',msg.speaker+'の発言。タップで解説。'+msg.text);
 b.addEventListener('click',()=>setExplanation(msg,b));
 stack.append(b);return b;
}
function render(){
 const ci=Math.max(0,Math.min(state.selected-1,state.chapters.length-1)),ch=state.chapters[ci];if(!ch)return;
 $('h202-chapter-num').textContent='第'+ch.id+'話';$('h202-chapter-title').textContent=ch.title;
 $('h202-total-caption').textContent='31話・202重要事項';
 const all=visibleMessages(ch,ci);
 const filtered=state.filter?all.filter(m=>(m.text+' '+m.speaker+' '+m.explanation).toLocaleLowerCase('ja').includes(state.filter)):all;
 $('h202-search-count').textContent=state.filter?filtered.length+'件':'';
 clearExplanation();box.replaceChildren();
 const head=document.createElement('div');head.className='h202-episode-heading';
 const label=document.createElement('div');label.textContent=`第${ch.id}話　${ch.category}（${ch.count}項目）`;
 const h=document.createElement('strong');h.textContent=ch.title;
 const sub=document.createElement('p');sub.textContent=ch.subtitle;
 head.append(label,h,sub);box.append(head);
 if(filtered.length===0){const p=document.createElement('p');p.className='h202-status';p.textContent=state.filter?'一致する発言がありません。':(state.config.mode==='broadcast'&&!isPreview?'配信されると、この話の発言が表示されます。':'発言がありません。');box.append(p);return;}
 let currentSpeaker=null,stack=null;
 for(const msg of filtered){
  if(currentSpeaker!==msg.speaker){
   const group=document.createElement('div');group.className='h202-msg-group'+(msg.role==='modern'?' is-modern':'');
   group.append(iconFor(msg.speaker));stack=document.createElement('div');stack.className='h202-msg-stack';
   if(msg.role!=='modern'){const name=document.createElement('div');name.className='h202-speaker';name.textContent=msg.speaker;stack.append(name)}
   group.append(stack);box.append(group);currentSpeaker=msg.speaker;
  }
  addBubble(stack,msg);
 }
 const bottom=document.createElement('p');bottom.className='h202-story-marker';bottom.textContent=state.config.mode==='broadcast'&&!isPreview?'配信中の発言はここまで':'この話はここまで。目次から別の話も読めます。';box.append(bottom);
}
function setChapter(id,restore=false){
 const ch=state.chapters.find(x=>x.id===id);if(!ch)return;
 state.selected=ch.id;state.filter='';searchInput.value='';search.hidden=true;
 try{localStorage.setItem('history202-last-chapter',String(id))}catch(_){}
 render();renderIndex();layer.hidden=true;
 if(restore){try{scroll.scrollTop=Number(localStorage.getItem(LS_PREFIX+id))||0}catch(_){scroll.scrollTop=0}}else scroll.scrollTop=0;
}
function renderIndex(){list.replaceChildren();for(const ch of state.chapters){
 const item=document.createElement('button');item.type='button';item.className='h202-index-item'+(ch.id===state.selected?' is-current':'');
 const no=document.createElement('span');no.className='h202-index-number';no.textContent='第'+ch.id+'話';
 const main=document.createElement('span');main.className='h202-index-main';
 const title=document.createElement('strong');title.textContent=ch.title;
 const subtitle=document.createElement('small');subtitle.textContent=ch.category+'・'+ch.subtitle;
 main.append(title,subtitle);
 const count=document.createElement('span');count.className='h202-index-count';count.textContent=ch.count+'項目';
 item.append(no,main,count);item.addEventListener('click',()=>setChapter(ch.id));list.append(item);
}}
let saveTimeout=null;
scroll.addEventListener('scroll',()=>{if(saveTimeout)clearTimeout(saveTimeout);saveTimeout=setTimeout(()=>{try{localStorage.setItem(LS_PREFIX+state.selected,String(scroll.scrollTop))}catch(_){}},350)},{passive:true});
async function load(){
 try{
  const response=await Promise.all(['history202/chapters.json','history202/participants.json','history202/config.json'].map(x=>fetch(x,{cache:'no-store'})));
  for(const r of response)if(!r.ok)throw Error('読み込み失敗: '+r.url+' '+r.status);
  const [script,people,config]=await Promise.all(response.map(r=>r.json()));
  if(!Array.isArray(script.chapters)||script.chapters.length!==31||script.chapters.reduce((n,c)=>n+c.entries.length,0)!==202)throw Error('31カテゴリー・202項目の整合性を確認できません。');
  const ids=new Set();let count=0;
  for(const ch of script.chapters){if(!ch.messages?.length)throw Error('会話なし: '+ch.id);for(const m of ch.messages){if(ids.has(m.id)||!m.text||!m.speaker)throw Error('会話データ不正: '+m.id);ids.add(m.id);count++;}}
  state.chapters=script.chapters;state.people=people;state.config=config;
  let saved=1;try{saved=Number(localStorage.getItem('history202-last-chapter'))||1}catch(_){}
  setChapter(saved,true);
 }catch(err){box.replaceChildren();const p=document.createElement('p');p.className='h202-status';p.textContent='会話の読み込みに失敗しました。\n'+String(err.message||err);box.append(p);console.error(err)}
}
load();
// One-way clock update only for common broadcast mode; no personal replay controls.
setInterval(()=>{if(!document.hidden&&state.config.mode==='broadcast'&&state.chapters.length&&!isPreview){let count=visibleMessages(state.chapters[state.selected-1],state.selected-1).length;if(count!==box.querySelectorAll('.h202-bubble').length&&!state.filter){const before=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight;render();if(before<90)scroll.scrollTop=scroll.scrollHeight}}},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.config.mode==='broadcast'&&!isPreview&&state.chapters.length)render()});
})();
