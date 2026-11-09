/* 202グルチャ：台本と画面を分離。表示構造と吹き出し描画は戦国の反省会を継承。 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const box=$('group-messages'), inner=$('group-messages-inner'),explain=$('h202-explain'),explainText=$('h202-explain-text');
const indexLayer=$('h202-index-layer'),indexList=$('h202-index-list'),searchForm=$('group-search-form'),searchInput=$('group-search-input');
const state={chapters:[],people:{},config:{mode:'reader'},selected:1,activeId:null,search:'',savedScroll:null,materialLoadError:''};
const isPreview=new URLSearchParams(location.search).get('preview')==='1';
const h202PhotoStyle=document.createElement('style');h202PhotoStyle.id='h202-photo-layout-mobile-v2';h202PhotoStyle.textContent='\n/* History202: mobile-safe, small photographic chat bubbles. No credit or disclaimer UI. */\n#group-view #group-messages,\n#group-view #group-messages-inner,\n#group-view #group-messages .bubble-row{max-width:100%!important;min-width:0!important}\n#group-view #group-messages .bubble-row:has(.h202-real-image-bubble){overflow:visible;min-width:0!important}\n#group-view #group-messages .group-reply-content.h202-has-image{\n display:grid!important;\n grid-template-columns:minmax(0,1fr) auto!important;\n column-gap:5px!important;\n width:min(100%,270px)!important;\n max-width:calc(100vw - 95px)!important;\n min-width:0!important;\n align-items:end!important;\n box-sizing:border-box!important;\n}\n#group-view #group-messages .group-reply-content.h202-has-image>.group-reply-name{\n grid-column:1/-1!important;grid-row:auto!important;min-width:0!important;\n}\n#group-view #group-messages .group-reply-content.h202-has-image>.h202-real-image-bubble{\n display:block!important;\n grid-column:1!important;grid-row:auto!important;\n width:100%!important;max-width:100%!important;min-width:0!important;\n box-sizing:border-box!important;\n height:auto!important;max-height:none!important;\n margin:0!important;padding:7px!important;\n overflow:hidden!important;white-space:normal!important;text-align:left!important;\n line-height:1.4!important;\n}\n#group-view #group-messages .h202-real-image-bubble img{\n display:block!important;\n box-sizing:border-box!important;\n width:100%!important;max-width:100%!important;\n height:clamp(130px,42vw,205px)!important;\n max-height:205px!important;\n min-width:0!important;object-fit:contain!important;\n object-position:center!important;\n border:0!important;border-radius:9px!important;\n margin:0!important;padding:0!important;\n background:rgba(255,255,255,.035)!important;\n}\n#group-view #group-messages .h202-real-image-caption{\n display:block!important;width:100%!important;\n overflow-wrap:anywhere!important;word-break:normal!important;\n margin:5px 1px 0!important;padding:0!important;\n font-size:11px!important;font-weight:700!important;\n line-height:1.45!important;white-space:normal!important;\n}\n#group-view #group-messages .group-reply-content.h202-has-image>.history-message-time{\n grid-column:2!important;grid-row:auto!important;\n align-self:end!important;white-space:nowrap!important;\n margin:0 0 2px 0!important;\n}\n#group-view #group-messages .h202-real-image-credit,\n#group-view #group-messages .h202-image-source-always,\n#group-view #group-messages .h202-image-source-link{display:none!important}\n#group-view #group-messages .h202-image-load-failure{\n display:block!important;white-space:normal!important;\n padding:20px 5px!important;font-size:11px!important;line-height:1.5!important;\n}\n';document.head.append(h202PhotoStyle);
const h202SinglePhotoStyle=document.createElement('style');h202SinglePhotoStyle.id='h202-single-photo-no-stacked-bubble';h202SinglePhotoStyle.textContent='\n/* One image = one clean photo attachment. The standard text-bubble vector\n   must never be applied to real historical images. */\n#group-view #group-messages .group-reply-content.h202-has-image>.h202-real-image-bubble.h202-image-card {\n all:unset!important;\n display:block!important;\n box-sizing:border-box!important;\n grid-column:1!important;\n min-width:0!important;\n width:100%!important;\n max-width:100%!important;\n padding:0!important;\n margin:0!important;\n background:none!important;\n background-image:none!important;\n border:0!important;\n border-radius:0!important;\n box-shadow:none!important;\n filter:none!important;\n overflow:visible!important;\n cursor:pointer!important;\n -webkit-tap-highlight-color:transparent!important;\n touch-action:manipulation!important;\n text-align:left!important;\n color:inherit!important;\n line-height:1.5!important;\n font-family:inherit!important;\n}\n#group-view #group-messages .h202-image-card::before,\n#group-view #group-messages .h202-image-card::after {\n content:none!important;\n display:none!important;\n background:none!important;\n background-image:none!important;\n box-shadow:none!important;\n}\n#group-view #group-messages .h202-image-card img {\n display:block!important;\n width:auto!important;\n max-width:100%!important;\n height:auto!important;\n max-height:205px!important;\n object-fit:contain!important;\n box-sizing:border-box!important;\n border:0!important;\n border-radius:9px!important;\n padding:0!important;\n margin:0!important;\n background:transparent!important;\n box-shadow:none!important;\n}\n#group-view #group-messages .h202-image-card .h202-real-image-caption {\n display:block!important;\n width:100%!important;\n max-width:100%!important;\n margin:5px 0 0!important;\n padding:0!important;\n color:#5c4939!important;\n font-size:11px!important;\n line-height:1.45!important;\n font-weight:700!important;\n white-space:normal!important;\n overflow-wrap:anywhere!important;\n}\nhtml[data-persona="cyber"] #group-view #group-messages .h202-image-card .h202-real-image-caption {\n color:#d1e4f4!important;\n}\n#group-view #group-messages .h202-image-card[aria-pressed="true"] img {\n outline:2px solid #d89539!important;\n outline-offset:2px!important;\n}\nhtml[data-persona="cyber"] #group-view #group-messages .h202-image-card[aria-pressed="true"] img {\n outline-color:#4ee6ff!important;\n}\n#group-view #group-messages .h202-image-card:focus-visible img {\n outline:2px solid currentColor!important;\n outline-offset:3px!important;\n}\n';document.head.append(h202SinglePhotoStyle);
const LAST='history202-last-position-v1:';
let firstLoad=true,paintQueued=false;
const realAssetsById=new Map();

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
const ROOM_ICON_SRC=document.querySelector('#group-header-avatar img')?.getAttribute('src') || '/icons/history202.webp';
function ensureRoomIcon(node){
 if(!node) return;
 let img=node.querySelector('img');
 if(!img){
  img=document.createElement('img');
  img.alt='';img.width=256;img.height=256;img.decoding='async';
  node.replaceChildren(img);
 }
 img.src=ROOM_ICON_SRC;
}
function syncRoomIcons(){
 ensureRoomIcon(document.getElementById('group-header-avatar'));
 ensureRoomIcon(document.querySelector('#group-members .group-members-avatar'));
}

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

function replaceFakeCards(chapters,realMaterials){
 const items=Array.isArray(realMaterials?.items)?realMaterials.items:[];
 for(const ch of chapters){
  // Previous 202 word cards / 16 hand-drawn cards were not genuine historical sources.
  ch.messages=ch.messages.filter(m=>!(m.kind==='image'&&/history202\/(?:term_cards|materials)\//.test(m.image||''))&&!/^h\d+-(?:termimg-|img-)/.test(m.id||''));
  const additions=items.filter(it=>Number(it.chapter)===Number(ch.id));
  for(const item of additions){
   const imageUrl=item.image||item.imageUrl;
   // Authentic materials also come from public museums, libraries and archival collections.
   // Permit only the explicit asset hosts used in the source manifest.
   const acceptedImageHosts=new Set([
    'commons.wikimedia.org','upload.wikimedia.org','codh.rois.ac.jp','online.bunka.go.jp',
    'www.wul.waseda.ac.jp','www.law.nihon-u.ac.jp','www.pref.gifu.lg.jp','www.pref.gunma.jp',
    'www.med.nagoya-u.ac.jp','www.archives.go.jp','www.nier.go.jp','www.ndl.go.jp',
    'assets.st-note.com','archive.wul.waseda.ac.jp','search.showakan.go.jp',
    'www.library.metro.tokyo.lg.jp','www.jacar.go.jp','images.metmuseum.org','jaa2100.org'
   ]);
   let resolvedImage;
   try{resolvedImage=new URL(imageUrl,location.href)}catch(_){continue}
   if(!item.localImage&&(resolvedImage.protocol!=='https:'||!acceptedImageHosts.has(resolvedImage.hostname)))continue;
   const m={id:item.id,speaker:'AI先生',role:'historical',kind:'real-image',text:'資料：'+item.caption,
    caption:item.caption,image:imageUrl,remoteImage:item.localImage?(item.imageOriginal||null):null,sourceUrl:item.sourceUrl,credit:item.credit,license:item.license||'出典ページで確認',
    explanation:item.explanation};
   const index=ch.messages.findIndex(v=>v.id===item.after);
   if(index===-1){console.warn('歴史資料の配置先が存在しません',item.id,item.after);continue;}
   // Multiple historical sources anchored after one line retain source-list order.
   let at=index+1;while(at<ch.messages.length&&ch.messages[at]._h202After===item.after)at++;
   m._h202After=item.after;ch.messages.splice(at,0,m);realAssetsById.set(m.id,m);
  }
 }
 return chapters;
}

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
function openMembers(){if(!state.chapters.length)return;renderMembers();syncRoomIcons();$('group-members').hidden=false;document.documentElement.dataset.membersOpen='true';$('group-members-back').focus()}
function closeMembers(){$('group-members').hidden=true;delete document.documentElement.dataset.membersOpen;$('group-members-direct').focus()}
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
 syncRoomIcons();
 const list=$('group-member-list');list.replaceChildren();const names=[];
 for(const ch of state.chapters)for(const m of ch.messages)
  if(m.role!=='modern'&&!names.includes(m.speaker))names.push(m.speaker);
 // 参加者一覧は「退会・招待の演出」を持たないが、同じ区分見出しにする。
 const section=document.createElement('h3');section.className='membership-section-title';
 const emoji=document.createElement('span');emoji.setAttribute('aria-hidden','true');emoji.textContent='👋';
 section.append(emoji,' '+names.length+'人が参加中です');list.append(section);
 document.querySelector('#group-members .members-title').textContent='歴史の重要ワード202 ('+names.length+')';
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

// The chapter index and the chat must never be visible together.
// An overlay z-index alone is not sufficient because the inherited chat
// stylesheet creates its own stacking context on some iOS layouts.
function setIndexOpen(open){
  const groupView=$('group-view');
  if(open){
    $('group-members').hidden=true;
    groupView.hidden=true;
    document.body.classList.add('h202-index-open');
    indexLayer.hidden=false;
  }else{
    indexLayer.hidden=true;
    document.body.classList.remove('h202-index-open');
    groupView.hidden=false;
  }
}
function openIndex(){
  if(!state.chapters.length)return;
  setIndexOpen(true);
  const current=indexList.querySelector('.is-current');
  current?.scrollIntoView({block:'nearest'});
  $('h202-index-back').focus();
}
function closeIndex(){
  setIndexOpen(false);
  $('group-title').focus();
}
$('group-title').addEventListener('click',openIndex);
$('h202-index-back').addEventListener('click',closeIndex);
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!indexLayer.hidden)closeIndex();else if(!$('group-members').hidden)closeMembers();else if(!searchForm.hidden)closeSearch()});
function renderIndex(){indexList.replaceChildren();for(const ch of state.chapters){const row=document.createElement('button');row.type='button';row.className=ch.id===state.selected?'is-current':'';
 const no=document.createElement('span');no.className='h202-no';no.textContent='第'+ch.id+'話';const name=document.createElement('span');name.className='h202-name';name.textContent=ch.title;
 const sub=document.createElement('small');sub.textContent=ch.category;name.append(sub);const count=document.createElement('span');count.className='h202-count';count.textContent=ch.count+'項目';row.append(no,name,count);row.addEventListener('click',()=>chooseChapter(ch.id));indexList.append(row);
}}
function clearExplanation(){state.activeId=null;explainText.textContent='';explain.classList.remove('has-selected-bubble');inner.querySelectorAll('.h202-bubble[aria-pressed="true"],.h202-image-card[aria-pressed="true"]').forEach(b=>b.setAttribute('aria-pressed','false'));requestShapes()}
function selectExplanation(m,b){const same=state.activeId===m.id;clearExplanation();if(same)return;state.activeId=m.id;b.setAttribute('aria-pressed','true');explainText.textContent=m.explanation||'';
 explain.classList.add('has-selected-bubble');explain.scrollTop=0;requestShapes()}
function timeNode(stamp){const el=document.createElement('span');el.className='history-message-time sengoku-time';if(stamp!=null)el.textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp);else{el.textContent='00:00';el.classList.add('h202-time-empty');el.setAttribute('aria-hidden','true')}return el}
// Image recovery: try Commons file path and a smaller thumbnail when the first URL fails.
// Keep the source page accessible even if all remote image hosts are blocked.
function historicalImageCandidates(m){
 const urls=[m.image];
 try{
  const src=new URL(m.sourceUrl||'');
  if(src.hostname==='commons.wikimedia.org'&&src.pathname.startsWith('/wiki/File:')){
   const name=decodeURIComponent(src.pathname.slice('/wiki/File:'.length));
   urls.push('https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(name)+'?width=600');
   urls.push('https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(name));
  }
  const original=new URL(m.image);
  if(original.hostname==='commons.wikimedia.org'&&original.searchParams.has('width')){
   original.searchParams.set('width','360');urls.push(original.href);
  }
 }catch(_){}
 return [...new Set(urls.filter(Boolean))];
}
function installHistoricalPhoto(photo,m){
 const candidates=historicalImageCandidates(m);let attempt=0;
 photo.addEventListener('load',requestShapes);
 photo.addEventListener('error',()=>{
  attempt++;
  if(attempt<candidates.length){photo.src=candidates[attempt];return;}
  const hint=document.createElement('span');hint.className='h202-image-load-failure';
  hint.textContent='画像を表示できませんでした。';
  const src=m.sourceUrl;
  if(src){try{const url=new URL(src);if(url.protocol==='https:'){
   const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
   link.textContent=' 資料の原本ページを開く';link.addEventListener('click',e=>e.stopPropagation());hint.append(link);
  }}catch(_){}}
  photo.replaceWith(hint);requestShapes();
 });
 photo.src=candidates[0];
}
function addRow(m,when,previous){
 const modern=m.role==='modern',continuation=previous?.speaker===m.speaker&&previous?.role===m.role;
 const row=document.createElement('div');row.className='bubble-row '+(modern?'user':'assistant')+(continuation?' continuation':'');row.dataset.messageId=m.id;
 if(!modern){if(continuation){const space=document.createElement('span');space.className='bubble-avatar-spacer';row.append(space)}else row.append(avatar(m.speaker))}
 const bubble=document.createElement('button');bubble.type='button';bubble.className=m.kind==='real-image'?'h202-image-card h202-real-image-bubble':('bubble sengoku-bubble h202-bubble '+(modern?'user':'assistant'));bubble.setAttribute('aria-pressed','false');if(m.kind!=='real-image')bubble.textContent=m.text;
 if(m.kind==='real-image'){
  bubble.replaceChildren();
  const photo=document.createElement('img');photo.alt=m.caption;photo.loading='lazy';photo.decoding='async';
  // Keep remote historical media responsive on mobile.
  photo.referrerPolicy='no-referrer';
  installHistoricalPhoto(photo,m);
  const caption=document.createElement('span');caption.className='h202-real-image-caption';caption.textContent=m.caption;
  bubble.append(photo,caption);
 }
 bubble.setAttribute('aria-label',m.speaker+'の発言、タップで解説を表示または閉じる');bubble.addEventListener('click',()=>selectExplanation(m,bubble));
 const time=timeNode(when);
 if(modern){row.append(bubble,time)}else{
  const container=document.createElement('div');container.className='group-reply-content'+(m.kind==='real-image'?' h202-has-image':'');
  if(!continuation){const name=document.createElement('div');name.className='group-reply-name';const wrapper=document.createElement('span');wrapper.className='group-name-label';const person=state.people[m.speaker]||{};const can=profileAvailable(person);const label=document.createElement(can?'button':'span');label.textContent=m.speaker;
   if(can){label.type='button';label.className='h202-name-profile';label.setAttribute('aria-label',m.speaker+'のプロフィールを開く');label.addEventListener('click',()=>openOriginalProfile(person));}
   wrapper.append(label);name.append(wrapper);container.append(name);
  }
  container.append(bubble);
  container.append(time);row.append(container);
 }
 inner.append(row);
}
function updateEpisodeHeader(ch){
 const label='第'+ch.id+'話・'+ch.category+'・'+ch.count+'項目';
 const badge=$('sengoku-period-badge');
 if(badge){badge.textContent=label;badge.setAttribute('aria-label',label);badge.title=label;}
 const title=$('group-title');if(title){title.title=label+'／31話の目次を開く';title.setAttribute('aria-label','歴史の重要ワード202。'+label+'。目次を開く');}
}
function render(){const ci=Math.max(0,state.selected-1),ch=chapterAt(ci);if(!ch)return;syncRoomIcons();updateEpisodeHeader(ch);clearExplanation();inner.replaceChildren();
 const heading=document.createElement('div');heading.className='h202-episode-heading';const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label','第'+ch.id+'話。タップで31話の目次を開く');btn.append(document.createTextNode('第'+ch.id+'話　'+ch.category+'（'+ch.count+'項目）'));
 const title=document.createElement('strong');title.textContent=ch.title;const sub=document.createElement('small');sub.textContent=ch.subtitle;btn.append(title,sub);btn.addEventListener('click',openIndex);heading.append(btn);inner.append(heading);
 if(state.materialLoadError){const warn=document.createElement('p');warn.className='h202-material-load-warning';warn.textContent=state.materialLoadError;inner.append(warn)}
 const visible=visibleMessages(ch,ci);let shown=visible;
 if(state.search)shown=visible.filter(({m})=>((m.text||'')+' '+(m.caption||'')+' '+m.speaker+' '+(m.explanation||'')).toLocaleLowerCase('ja').includes(state.search));
 let previous=null;for(const {m,time} of shown){addRow(m,time.when,previous);previous=m}
 if(!shown.length){const p=document.createElement('p');p.className='h202-status';p.textContent=state.search?'該当する会話はありません':state.config.mode==='broadcast'&&!isPreview?'配信されると、会話がここに届きます':'会話がありません';inner.append(p)}
 else if(!state.search){const end=document.createElement('p');end.className='h202-story-end';end.textContent=state.config.mode==='broadcast'&&!isPreview?'現在の配信はここまで':'第'+ch.id+'話・ここまで。次の話はタイトルから選べます。';inner.append(end)}
 requestShapes();
}
function chooseChapter(id,restore=false){const chapter=state.chapters.find(x=>x.id===id);if(!chapter)return;state.selected=id;searchForm.hidden=true;$('group-view').removeAttribute('data-search-open');$('group-search-toggle').setAttribute('aria-expanded','false');searchInput.value='';state.search='';$('group-search-clear').hidden=true;
 try{localStorage.setItem('history202-last-chapter',String(id))}catch(_){}
 render();renderIndex();setIndexOpen(false);
 if(restore){try{box.scrollTop=Number(localStorage.getItem(LAST+id))||0}catch(_){box.scrollTop=0}}else box.scrollTop=0;
}
let saveTimeout=null;box.addEventListener('scroll',()=>{clearTimeout(saveTimeout);saveTimeout=setTimeout(()=>{try{localStorage.setItem(LAST+state.selected,String(box.scrollTop))}catch(_){}},350)},{passive:true});
async function load(){try{const responses=await Promise.all(['history202/chapters.json','history202/participants.json','history202/config.json'].map(url=>fetch(url,{cache:'no-store'})));
 for(const response of responses)if(!response.ok)throw Error('読み込みに失敗しました: '+response.status);
 const [script,people,config]=await Promise.all(responses.map(r=>r.json()));
 let localImages={};try{const localResponse=await fetch('history202/local-images.json',{cache:'no-store'});if(localResponse.ok)localImages=await localResponse.json()}catch(e){console.warn('local image index unavailable',e)}
 let realMaterials={items:[]};try{const r=await fetch('history202/real-materials.json',{cache:'no-store'});if(!r.ok)throw Error('資料データ HTTP '+r.status);realMaterials=await r.json();for(const material of realMaterials.items||[]){const local=localImages[material.id];if(typeof local==='string'&&/^history202\/authentic_images\/[a-zA-Z0-9_-]+\.webp$/.test(local)){material.image=local;material.localImage=true}}if(!Array.isArray(realMaterials.items)||realMaterials.items.length<157)throw Error('歴史資料データが不足しています')}catch(e){state.materialLoadError='歴史資料画像データを読み込めませんでした。画像の設定ファイルを確認してください。';console.warn('real materials unavailable',e)}
 if(!Array.isArray(script.chapters)||script.chapters.length!==31||script.chapters.reduce((n,c)=>n+(c.entries?.length||0),0)!==202)throw Error('重要事項が31話・202項目ではありません');
 const ids=new Set();for(const ch of script.chapters){if(!Array.isArray(ch.messages)||!ch.messages.length)throw Error('空の話があります');for(const m of ch.messages){if(!m.id||!m.text||!m.speaker||ids.has(m.id))throw Error('会話IDの重複または不足があります');ids.add(m.id)}}
 state.chapters=replaceFakeCards(script.chapters,realMaterials);state.people=people;state.config=config;
 let saved=1;try{saved=Number(localStorage.getItem('history202-last-chapter'))||1}catch(_){}
 chooseChapter(state.chapters.some(c=>c.id===saved)?saved:1,true);syncRoomIcons();firstLoad=false;
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
