/* 202グルチャ：台本と画面を分離。表示構造と吹き出し描画は戦国の反省会を継承。 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const box=$('group-messages'), inner=$('group-messages-inner'),explain=$('h202-explain'),explainText=$('h202-explain-text');
const indexLayer=$('h202-index-layer'),indexList=$('h202-index-list'),searchForm=$('group-search-form'),searchInput=$('group-search-input');
const state={chapters:[],people:{},config:{mode:'reader'},selected:1,activeId:null,search:'',savedScroll:null};
const isPreview=new URLSearchParams(location.search).get('preview')==='1';
const LAST='history202-last-position-v1:';
let firstLoad=true,paintQueued=false;
function safeTime(v){if(!v)return null;const n=Date.parse(v);return Number.isFinite(n)?n:null}
function applyTheme(mode){const theme=mode==='cyber'?'cyber':'neko';document.documentElement.dataset.persona=theme;document.documentElement.style.colorScheme=theme==='cyber'?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='cyber'?'#080d20':'#fffcf7');requestShapes()}
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data)return;if(e.data.type==='history202-theme'||e.data.type==='nekopon-persona')applyTheme(e.data.persona)});
function close(){if(parent!==window)parent.postMessage({type:'history202-close'},location.origin);else if(history.length>1)history.back();else location.assign('himiko.html')}
// 既存の戦国グルチャと同じ音声経路。iframe内のタップを親画面へ渡す。
function originalChatSound(kind,event){
 try{const host=hostWindow();if(typeof host?.appSound==='function')host.appSound(kind,event)}
 catch(_){/* ブラウザの自動再生・ミュート設定には従う */}
}
document.addEventListener('click',event=>{
 const control=event.target.closest('button, .sengoku-member-card');
 if(!control||control.disabled)return;
 originalChatSound(control.classList.contains('sengoku-member-card')?'open':'tap',event);
},true);
document.addEventListener('pointerdown',event=>{
 if(event.target.closest('#group-search-input'))originalChatSound('tap',event);
},{passive:true});

$('h202-back').addEventListener('click',close);
function hostWindow(){try{return parent!==window&&parent.location.origin===location.origin?parent:null}catch(_){return null}}
function profileId(person){const m=String(person?.image||'').match(/^history-icons\/(\d+)\.(?:webp|png)$/);return m?Number(m[1]):null}
function profileAvailable(person){return Number.isInteger(profileId(person))&&!!hostWindow()?.document?.getElementById('card-list')}
function openOriginalProfile(person){
 if(!profileAvailable(person))return;
 const host=hostWindow(),list=host.document.getElementById('card-list');
 // Exactly the same original-profile opening route as sengoku-chat/room.js.
 const probe=host.document.createElement('button');probe.type='button';probe.className='char-card';probe.setAttribute('onclick','openChat('+profileId(person)+')');probe.tabIndex=-1;probe.setAttribute('aria-hidden','true');probe.style.cssText='position:absolute!important;left:-99999px!important;top:-99999px!important;visibility:hidden!important';
 const avatar=host.document.createElement('span');avatar.className='avatar';probe.append(avatar);list.append(probe);
 try{avatar.dispatchEvent(new host.MouseEvent('click',{bubbles:true,cancelable:true}))}finally{probe.remove()}
}
function imageInto(person,node){node.replaceChildren();const url=person?.image;
 if(typeof url==='string'&&/^history-icons\/[0-9]+\.(?:webp|png)$/.test(url)){
  const img=document.createElement('img');img.alt='';img.src=url;img.loading='lazy';img.onerror=()=>{img.remove();node.textContent=person?.icon||'👤'};node.append(img);
 }else node.textContent=person?.icon||'👤';
}
function avatar(sp){const p=state.people[sp]||{},click=profileAvailable(p);const node=document.createElement(click?'button':'span');
 node.className='bubble-avatar'+(click?' h202-profile-button':'');
 if(click){node.type='button';node.setAttribute('aria-label',sp+'のプロフィールを開く');node.addEventListener('click',()=>openOriginalProfile(p));}
 imageInto(p,node);return node;
}
function chapterAt(index){return state.chapters[index]||null}
function scheduleInfo(chapterIndex,messageIndex){
 if(state.config.mode!=='broadcast'||isPreview)return {visible:true,when:null};
 const start=safeTime(state.config.startAt);if(start===null)return {visible:false,when:null};
 const interval=Math.max(2,Number(state.config.messageIntervalSeconds)||11)*1000;
 const gap=Math.max(1,Number(state.config.chapterGapMinutes)||60)*60000;
 let t=start;for(let i=0;i<chapterIndex;i++)t+=state.chapters[i].messages.length*interval+gap;
 t+=messageIndex*interval;return {visible:Date.now()>=t,when:t};
}
function visibleMessages(ch,index){return ch.messages.map((m,i)=>({m,time:scheduleInfo(index,i)})).filter(x=>x.time.visible)}
// 戦国版と同様、検索中は元ヘッダーの全要素を隠して検索フォームだけを表示。
function setSearchOpen(open){
 searchForm.hidden=!open;
 $('group-view').toggleAttribute('data-search-open',open);
 $('group-search-toggle').setAttribute('aria-expanded',String(open));
 if(open)searchInput.focus();
 else{searchInput.value='';state.search='';$('group-search-clear').hidden=true;render()}
}
function closeSearch(){setSearchOpen(false)}
function openSearch(){setSearchOpen(true)}
$('group-search-toggle').addEventListener('click',()=>{if(searchForm.hidden)openSearch();else closeSearch()});
$('group-search-close').addEventListener('click',closeSearch);
$('group-search-clear').addEventListener('click',()=>{searchInput.value='';state.search='';$('group-search-clear').hidden=true;render();searchInput.focus()});
searchForm.addEventListener('submit',e=>{e.preventDefault();searchInput.blur()});
searchInput.addEventListener('input',()=>{state.search=searchInput.value.trim().toLocaleLowerCase('ja');$('group-search-clear').hidden=!state.search;render()});
function openMembers(){if(!state.chapters.length)return;renderMembers();$('group-members').hidden=false;$('group-members-back').focus()}
function closeMembers(){$('group-members').hidden=true;$('group-members-direct').focus()}
$('group-members-direct').addEventListener('click',openMembers);$('group-members-back').addEventListener('click',closeMembers);
// 戦国グルチャの参加者一覧と同じカード階層（section → char-card → name-row → period）。
// 年号などの推測表示を避け、時代名は本文で確かに扱うものだけを載せる。
const personPeriods={
 'ソクラテス':'古代ギリシャ','ハンムラビ王':'古代メソポタミア','始皇帝':'秦','卑弥呼':'弥生時代',
 '聖徳太子':'飛鳥時代','中大兄皇子':'飛鳥時代','聖武天皇':'奈良時代',
 '桓武天皇':'奈良〜平安時代','最澄':'平安時代','空海':'平安時代','藤原道長':'平安時代',
 '紫式部':'平安時代','白河上皇':'平安時代','平清盛':'平安時代',
 '源頼朝':'平安〜鎌倉時代','北条泰時':'鎌倉時代','親鸞':'鎌倉時代',
 '足利義満':'室町時代','雪舟':'室町時代',
 '織田信長':'戦国〜安土桃山時代','豊臣秀吉':'安土桃山時代',
 '徳川家康':'安土桃山〜江戸時代','徳川家光':'江戸時代','徳川綱吉':'江戸時代',
 '徳川吉宗':'江戸時代','本居宣長':'江戸時代','伊能忠敬':'江戸時代',
 '吉田松陰':'江戸時代（幕末）','坂本龍馬':'江戸時代（幕末）','ペリー':'19世紀・アメリカ',
 '板垣退助':'明治時代','伊藤博文':'明治時代','大久保利通':'明治時代',
 'ルター':'16世紀・ドイツ','マゼラン':'16世紀・大航海時代','孫文':'清末〜中華民国',
 '小村寿太郎':'明治時代'
};
function personalPresence(name,person){
 const host=hostWindow(),id=profileId(person);
 if(!Number.isInteger(id)||typeof host?.himikoPersonPresence!=='function')return null;
 try{
  const result=host.himikoPersonPresence({id,name});
  if(!result||!['オンライン','離席中','あとで戻る'].includes(result.label))return null;
  return result;
 }catch(_){return null}
}
function renderMembers(){
 const list=$('group-member-list');list.replaceChildren();const names=[];
 for(const ch of state.chapters)for(const m of ch.messages)
  if(m.role!=='modern'&&!names.includes(m.speaker))names.push(m.speaker);
 // 参加者一覧は「退会・招待の演出」を持たないが、同じ区分見出しにする。
 const section=document.createElement('h3');section.className='membership-section-title';
 const emoji=document.createElement('span');emoji.setAttribute('aria-hidden','true');emoji.textContent='👋';
 section.append(emoji,' '+names.length+'人が参加中です');list.append(section);
 document.querySelector('#group-members .members-title').textContent='歴史の暗記202グルチャ ('+names.length+')';
 for(const name of names){
  const person=state.people[name]||{},hasProfile=profileAvailable(person);
  const card=document.createElement(hasProfile?'button':'div');
  if(hasProfile){card.type='button';card.addEventListener('click',()=>openOriginalProfile(person))}
  card.className='char-card member-card sengoku-member-card'+(hasProfile?'':' sengoku-member-static');
  if(hasProfile)card.setAttribute('aria-label',name+'のプロフィールを開く');
  const row=document.createElement('span');row.className='card-inner';
  const photo=document.createElement('span');photo.className='avatar';imageInto(person,photo);
  const meta=document.createElement('span');meta.className='card-info';
  const nameLine=document.createElement('span');nameLine.className='member-name-row';
  const label=document.createElement('span');label.className='member-name';label.textContent=name;nameLine.append(label);
  const presence=personalPresence(name,person);
  if(presence){const badge=document.createElement('span');badge.className='online-badge member-presence';
   badge.textContent=presence.label;badge.style.color=presence.color;badge.style.background=presence.color+'20';nameLine.append(badge)}
  meta.append(nameLine);
  const period=personPeriods[name];if(period){const sub=document.createElement('span');sub.className='member-period';sub.textContent='（'+period+'）';meta.append(sub)}
  row.append(photo,meta);card.append(row);list.append(card);
 }
}

function openIndex(){if(!state.chapters.length)return;indexLayer.hidden=false;const current=indexList.querySelector('.is-current');current?.scrollIntoView({block:'nearest'});$('h202-index-back').focus()}
function closeIndex(){indexLayer.hidden=true;$('group-title').focus()}
$('group-title').addEventListener('click',openIndex);
$('h202-index-back').addEventListener('click',closeIndex);
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!indexLayer.hidden)closeIndex();else if(!$('group-members').hidden)closeMembers();else if(!searchForm.hidden)closeSearch()});
function renderIndex(){indexList.replaceChildren();for(const ch of state.chapters){const row=document.createElement('button');row.type='button';row.className=ch.id===state.selected?'is-current':'';
 const no=document.createElement('span');no.className='h202-no';no.textContent='第'+ch.id+'話';const name=document.createElement('span');name.className='h202-name';name.textContent=ch.title;
 const sub=document.createElement('small');sub.textContent=ch.category;name.append(sub);const count=document.createElement('span');count.className='h202-count';count.textContent=ch.count+'項目';row.append(no,name,count);row.addEventListener('click',()=>chooseChapter(ch.id));indexList.append(row);
}}
function clearExplanation(){state.activeId=null;explainText.textContent='';explain.classList.remove('has-selected-bubble');inner.querySelectorAll('.h202-bubble[aria-pressed="true"]').forEach(b=>b.setAttribute('aria-pressed','false'));requestShapes()}
function selectExplanation(m,b){const same=state.activeId===m.id;clearExplanation();if(same)return;state.activeId=m.id;b.setAttribute('aria-pressed','true');explainText.textContent=m.explanation||'';explain.classList.add('has-selected-bubble');explain.scrollTop=0;requestShapes()}
function timeNode(stamp){const el=document.createElement('span');el.className='history-message-time sengoku-time';if(stamp!=null)el.textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp);else{el.textContent='00:00';el.classList.add('h202-time-empty');el.setAttribute('aria-hidden','true')}return el}
function addRow(m,when,previous){
 const modern=m.role==='modern',continuation=previous?.speaker===m.speaker&&previous?.role===m.role;
 const row=document.createElement('div');row.className='bubble-row '+(modern?'user':'assistant')+(continuation?' continuation':'');row.dataset.messageId=m.id;
 if(!modern){if(continuation){const space=document.createElement('span');space.className='bubble-avatar-spacer';row.append(space)}else row.append(avatar(m.speaker))}
 const bubble=document.createElement('button');bubble.type='button';bubble.className='bubble sengoku-bubble h202-bubble '+(modern?'user':'assistant');bubble.setAttribute('aria-pressed','false');bubble.textContent=m.text;bubble.setAttribute('aria-label',m.speaker+'の発言、タップで解説を表示または閉じる');bubble.addEventListener('click',()=>selectExplanation(m,bubble));
 const time=timeNode(when);
 if(modern){row.append(bubble,time)}else{
  const container=document.createElement('div');container.className='group-reply-content';
  if(!continuation){const name=document.createElement('div');name.className='group-reply-name';const wrapper=document.createElement('span');wrapper.className='group-name-label';const person=state.people[m.speaker]||{};const can=profileAvailable(person);const label=document.createElement(can?'button':'span');label.textContent=m.speaker;
   if(can){label.type='button';label.className='h202-name-profile';label.setAttribute('aria-label',m.speaker+'のプロフィールを開く');label.addEventListener('click',()=>openOriginalProfile(person));}
   wrapper.append(label);name.append(wrapper);container.append(name);
  }
  container.append(bubble,time);row.append(container);
 }
 inner.append(row);
}
function render(){const ci=Math.max(0,state.selected-1),ch=chapterAt(ci);if(!ch)return;clearExplanation();inner.replaceChildren();
 const heading=document.createElement('div');heading.className='h202-episode-heading';const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label','第'+ch.id+'話。タップで31話の目次を開く');btn.append(document.createTextNode('第'+ch.id+'話　'+ch.category+'（'+ch.count+'項目）'));
 const title=document.createElement('strong');title.textContent=ch.title;const sub=document.createElement('small');sub.textContent=ch.subtitle;btn.append(title,sub);btn.addEventListener('click',openIndex);heading.append(btn);inner.append(heading);
 const visible=visibleMessages(ch,ci);let shown=visible;
 if(state.search)shown=visible.filter(({m})=>(m.text+' '+m.speaker+' '+(m.explanation||'')).toLocaleLowerCase('ja').includes(state.search));
 let previous=null;for(const {m,time} of shown){addRow(m,time.when,previous);previous=m}
 if(!shown.length){const p=document.createElement('p');p.className='h202-status';p.textContent=state.search?'該当する会話はありません':state.config.mode==='broadcast'&&!isPreview?'配信されると、会話がここに届きます':'会話がありません';inner.append(p)}
 else if(!state.search){const end=document.createElement('p');end.className='h202-story-end';end.textContent=state.config.mode==='broadcast'&&!isPreview?'現在の配信はここまで':'第'+ch.id+'話・ここまで。次の話はタイトルから選べます。';inner.append(end)}
 requestShapes();
}
function chooseChapter(id,restore=false){const chapter=state.chapters.find(x=>x.id===id);if(!chapter)return;state.selected=id;searchForm.hidden=true;$('group-view').removeAttribute('data-search-open');$('group-search-toggle').setAttribute('aria-expanded','false');searchInput.value='';state.search='';$('group-search-clear').hidden=true;
 try{localStorage.setItem('history202-last-chapter',String(id))}catch(_){}
 render();renderIndex();indexLayer.hidden=true;
 if(restore){try{box.scrollTop=Number(localStorage.getItem(LAST+id))||0}catch(_){box.scrollTop=0}}else box.scrollTop=0;
}
let saveTimeout=null;box.addEventListener('scroll',()=>{clearTimeout(saveTimeout);saveTimeout=setTimeout(()=>{try{localStorage.setItem(LAST+state.selected,String(box.scrollTop))}catch(_){}},350)},{passive:true});
async function load(){try{const responses=await Promise.all(['history202/chapters.json','history202/participants.json','history202/config.json'].map(url=>fetch(url,{cache:'no-store'})));
 for(const response of responses)if(!response.ok)throw Error('読み込みに失敗しました: '+response.status);
 const [script,people,config]=await Promise.all(responses.map(r=>r.json()));
 if(!Array.isArray(script.chapters)||script.chapters.length!==31||script.chapters.reduce((n,c)=>n+(c.entries?.length||0),0)!==202)throw Error('重要事項が31話・202項目ではありません');
 const ids=new Set();for(const ch of script.chapters){if(!Array.isArray(ch.messages)||!ch.messages.length)throw Error('空の話があります');for(const m of ch.messages){if(!m.id||!m.text||!m.speaker||ids.has(m.id))throw Error('会話IDの重複または不足があります');ids.add(m.id)}}
 state.chapters=script.chapters;state.people=people;state.config=config;
 let saved=1;try{saved=Number(localStorage.getItem('history202-last-chapter'))||1}catch(_){}
 chooseChapter(state.chapters.some(c=>c.id===saved)?saved:1,true);firstLoad=false;
 }catch(err){inner.replaceChildren();const p=document.createElement('p');p.className='h202-status';p.textContent='会話の読み込みに失敗しました。\n'+String(err.message||err);inner.append(p);console.error(err)}}
/* Exact copy of Sengoku's existing Himiko bubble-vector function (sengoku-chat/room.js). */
function shapePath(w,h){
 const x=6.5,right=w+5.5,top=.5,bottom=h-.5,r=Math.min((h-1)/2,23.5),tailR=23.5,tip=w+11;
 return `M${x+r} ${top} H${right-tailR} C${right-tailR*.72} ${top} ${right-tailR*.5} ${top+1} ${right-9} ${top+4} C${right-4} ${top+5} ${right+1} ${top+3} ${tip} ${top+.5} C${tip-.6} ${top+5} ${right+3} ${top+9} ${right-1} ${top+12} C${right} ${top+15} ${right} ${top+17} ${right} ${top+18} V${bottom-r} A${r} ${r} 0 0 1 ${right-r} ${bottom} H${x+r} A${r} ${r} 0 0 1 ${x} ${bottom-r} V${top+r} A${r} ${r} 0 0 1 ${x+r} ${top} Z`;
}
function paint(el){const w=el.offsetWidth,h=el.offsetHeight;if(w<10||h<24)return;const style=getComputedStyle(el),fill=style.getPropertyValue('--chat-bubble-fill').trim()||'#fff7eb',line=style.getPropertyValue('--chat-bubble-line').trim()||'#ead2b9';
 const left=el.classList.contains('assistant'),stamp=[w,h,fill,line,left].join('|');if(el.h202ShapeStamp===stamp)return;el.h202ShapeStamp=stamp;
 const transform=left?`transform="translate(${w+12} 0) scale(-1 1)"`:'';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w+12}" height="${h}" viewBox="0 0 ${w+12} ${h}"><path ${transform} d="${shapePath(w,h)}" fill="${fill}" stroke="${line}" stroke-width="1" stroke-linejoin="round"/></svg>`;
 el.style.setProperty('--chat-bubble-shape',`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}
function requestShapes(){if(paintQueued)return;paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;inner.querySelectorAll('.h202-bubble').forEach(paint)})}
const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>requestShapes()):null;
const rowObserver=new MutationObserver(()=>{inner.querySelectorAll('.h202-bubble').forEach(el=>{if(!el.h202Observed){el.h202Observed=true;resizeObserver?.observe(el)}});requestShapes()});rowObserver.observe(inner,{subtree:true,childList:true});
window.addEventListener('resize',requestShapes,{passive:true});
new MutationObserver(requestShapes).observe(document.documentElement,{attributes:true,attributeFilter:['data-persona']});
load();
setInterval(()=>{if(document.hidden||state.config.mode!=='broadcast'||isPreview||!state.chapters.length||state.search)return;const ch=chapterAt(state.selected-1),shown=visibleMessages(ch,state.selected-1);if(shown.length!==inner.querySelectorAll('.h202-bubble').length){const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;render();if(nearBottom)box.scrollTop=box.scrollHeight}},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.config.mode==='broadcast'&&!isPreview&&state.chapters.length)render()});
})();
