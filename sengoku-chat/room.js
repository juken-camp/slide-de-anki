(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const messagesBox=$('group-messages');
 const inner=$('group-messages-inner');
 let room={title:'戦国の反省会',label:'期間限定',image:'',participants:[],messages:[]};
 let searchOpen=false;
 let lastRenderKey='';
 function close(){if(window.parent!==window){window.parent.postMessage({type:'sengoku-close'},location.origin)}else if(history.length>1){history.back()}else{location.href='index.html'}}
 $('back').addEventListener('click',close);
 window.addEventListener('message',event=>{if(event.origin!==location.origin)return;if(event.data?.type==='sengoku-theme')document.documentElement.dataset.persona=event.data.persona==='cyber'?'cyber':'neko'});
 function safeLocalImage(src){return typeof src==='string'&&/^history-icons\/[A-Za-z0-9_.-]+\.(webp|png|jpg|jpeg)$/.test(src)?src:null}
 function imageNode(url,container){container.replaceChildren();const src=safeLocalImage(url);if(src){const img=document.createElement('img');img.src=src;img.alt='';img.onerror=()=>img.remove();container.append(img)}}
 function applyMeta(){
  $('group-title').textContent=room.title||'戦国の反省会';
  $('sengoku-period-badge').textContent=room.label||'期間限定';
  imageNode(room.image,$('group-header-avatar'));
  imageNode(room.image,document.querySelector('.group-members-avatar'));
  const list=$('group-member-list');list.replaceChildren();
  const people=Array.isArray(room.participants)?room.participants:[];
  if(!people.length){const p=document.createElement('p');p.id='sengoku-empty-members';p.textContent='参加者はこれから公開するぜ！';list.append(p)}
  for(const person of people){if(!person||typeof person.name!=='string')continue;
   const row=document.createElement('div');row.className='sengoku-member';
   const icon=document.createElement('span');icon.className='bubble-avatar';
   imageNode(person.avatar,icon);if(!icon.childNodes.length)icon.textContent='👤';
   const label=document.createElement('span');label.textContent=person.name.slice(0,40);
   row.append(icon,label);list.append(row);
  }
 }
 function validTime(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v))return NaN;return Date.parse(v)}
 function normalize(){return (Array.isArray(room.messages)?room.messages:[]).filter(m=>m&&typeof m.text==='string'&&m.text.trim()&&Number.isFinite(validTime(m.at))&&validTime(m.at)<=Date.now()).slice(0,2000).sort((a,b)=>validTime(a.at)-validTime(b.at));}
 function dateJP(ms){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'}).format(ms)}
 function clockJP(ms){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms)}
 function makeRow(m){
  const modern=m.role==='modern';const row=document.createElement('div');row.className='bubble-row '+(modern?'user':'assistant');
  const icon=document.createElement('span');icon.className=modern?'bubble-avatar-spacer':'bubble-avatar';
  if(!modern){imageNode(m.avatar||room.participants?.find(p=>p.id===m.senderId)?.avatar,icon);if(!icon.childNodes.length)icon.textContent='👤';row.append(icon)}
  const content=document.createElement('div');content.className='group-reply-content';
  if(!modern){const name=document.createElement('div');name.className='group-reply-name';name.textContent=(m.name||room.participants?.find(p=>p.id===m.senderId)?.name||'歴史人物').slice(0,40);content.append(name)}
  const bubble=document.createElement('div');bubble.className='bubble '+(modern?'user':'assistant');bubble.textContent=m.text.slice(0,2000);content.append(bubble);
  const at=document.createElement('div');at.className='history-message-time';at.textContent=clockJP(validTime(m.at));content.append(at);
  row.append(content);return row;
 }
 function render(){
  const nearBottom=messagesBox.scrollHeight-messagesBox.scrollTop-messagesBox.clientHeight<120;
  const oldTop=messagesBox.scrollTop;
  const activeSearch=$('group-search-input').value.trim().toLocaleLowerCase();
  const msgs=normalize().filter(m=>!activeSearch||(m.text+' '+(m.name||'')).toLocaleLowerCase().includes(activeSearch));
  const renderKey=activeSearch+'\n'+msgs.map(m=>String(m.id||'')+'|'+m.at+'|'+m.senderId+'|'+m.text+'|'+m.role).join('\n');
  if(renderKey===lastRenderKey)return;
  lastRenderKey=renderKey;
  inner.replaceChildren();
  if(!msgs.length){const empty=document.createElement('p');empty.id='sengoku-empty';empty.textContent=activeSearch?'該当する会話はありません':'会話はこれから始まるぜ！';inner.append(empty);return}
  let currentDay='';
  for(const m of msgs){const ms=validTime(m.at),day=dateJP(ms);if(day!==currentDay){const heading=document.createElement('div');heading.className='sengoku-date';heading.textContent=day;inner.append(heading);currentDay=day}inner.append(makeRow(m))}
  requestAnimationFrame(()=>{messagesBox.scrollTop=nearBottom?messagesBox.scrollHeight:oldTop});
 }
 $('group-members-direct').addEventListener('click',()=>{$('group-members').hidden=false;document.documentElement.dataset.membersOpen='true'});
 $('group-members-back').addEventListener('click',()=>{$('group-members').hidden=true;delete document.documentElement.dataset.membersOpen});
 const toggleSearch=open=>{searchOpen=open;$('group-search-form').hidden=!open;$('group-search-toggle').setAttribute('aria-expanded',String(open));if(open){$('group-search-input').focus()}else{$('group-search-input').value='';render()}};
 $('group-search-toggle').addEventListener('click',()=>toggleSearch(!searchOpen));
 $('group-search-close').addEventListener('click',()=>toggleSearch(false));
 $('group-search-clear').addEventListener('click',()=>{$('group-search-input').value='';$('group-search-input').focus();render()});
 $('group-search-input').addEventListener('input',()=>{$('group-search-clear').hidden=!$('group-search-input').value;render()});
 $('group-search-form').addEventListener('submit',e=>{e.preventDefault();$('group-search-input').blur()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&searchOpen)toggleSearch(false)});
 // All viewers load the same static schedule; there are no sign-in requirements,
 // user writes, AI generation calls or separate local conversations.
 async function load(){
  try{
   const response=await fetch('sengoku-chat/schedule.json',{cache:'no-store'});
   if(!response.ok)throw Error('配信データを取得できません');
   const data=await response.json();
   if(!data||typeof data!=='object')throw Error('配信データが不正です');
   room={...room,...data};applyMeta();render();
  }catch(error){console.error('Sengoku room:',error);const p=$('sengoku-empty');if(p)p.textContent='会話の読み込みに失敗しました';}
 }
 load();
 // Recheck time-based release every 30 seconds. Refresh the static file every 5 minutes.
 setInterval(()=>{if(!document.hidden)render()},30000);
 setInterval(()=>{if(!document.hidden)load()},300000);
})();
