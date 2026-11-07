(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const core=window.SengokuSchedule;
 const messagesBox=$('group-messages'),inner=$('group-messages-inner');
 const explanationPanel=$('sengoku-explanation');
 const explanationText=$('sengoku-explanation-text');
 const isPreview=new URLSearchParams(location.search).get('sengokuPreview')==='1';
 let room={title:'戦国の反省会',label:'期間限定',image:'',participants:[],messages:[],repeat:true,startDate:null};
 let entries=[],searchOpen=false,searchQuery='',rendered=[],renderedCycle='',currentDay='';
 let selectedId=null,serverOffsetMs=0,previewCount=0,previewTimer=null,version='',displayedCycle=null;
 function close(){if(window.parent!==window){window.parent.postMessage({type:'sengoku-close'},location.origin)}else if(history.length>1){history.back()}else{location.href='index.html'}}
 $('back').addEventListener('click',close);
 window.addEventListener('message',event=>{if(event.origin!==location.origin)return;if(event.data?.type==='sengoku-theme')document.documentElement.dataset.persona=event.data.persona==='cyber'?'cyber':'neko'});
 try{document.documentElement.dataset.persona=localStorage.getItem('nekopon-character-theme-v1')==='cyber'?'cyber':'neko'}catch(_){/* optional */}
 function safeLocalImage(src){return typeof src==='string'&&/^history-icons\/[A-Za-z0-9_.-]+\.(webp|png|jpg|jpeg)$/.test(src)?src:null}
 function imageNode(url,container){container.replaceChildren();const src=safeLocalImage(url);if(src){const img=document.createElement('img');img.src=src;img.alt='';img.onerror=()=>img.remove();container.append(img)}}
 function applyMeta(){
  $('group-title').textContent=room.title||'戦国の反省会';
  $('sengoku-period-badge').textContent=room.label||'期間限定';
  imageNode(room.image,$('group-header-avatar'));
  imageNode(room.image,document.querySelector('.group-members-avatar'));
  document.querySelector('.members-title').textContent=room.title||'戦国の反省会';
  const list=$('group-member-list');list.replaceChildren();
  const people=Array.isArray(room.participants)?room.participants:[];
  if(!people.length){const p=document.createElement('p');p.id='sengoku-empty-members';p.textContent='参加者はこれから公開するぜ！';list.append(p)}
  for(const person of people){if(!person||typeof person.name!=='string')continue;
   const row=document.createElement('div');row.className='sengoku-member';
   const icon=document.createElement('span');icon.className='bubble-avatar';imageNode(person.avatar,icon);
   if(!icon.childNodes.length)icon.textContent='👤';
   const label=document.createElement('span');label.textContent=person.name.slice(0,40);
   row.append(icon,label);list.append(row);
  }
 }
 function dateJP(ms){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'}).format(ms)}
 function clockJP(ms){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms)}
 function now(){return Date.now()+serverOffsetMs}
 function currentState(){
  if(isPreview){
   const start=core.startTime(room.startDate)||core.startTime('2026-11-15');
   return {status:'preview',cycle:0,cycleStart:start,visible:entries.slice(0,previewCount)};
  }
  return core.view(room,entries,now());
 }
 function selectExplanation(m){
  selectedId=m.id;
  explanationText.textContent=m.explanation; // text only: NEVER render user-authored HTML
  explanationPanel.scrollTop=0;
 }
 function makeRow(m,cycleStart){
  const modern=m.role==='modern';
  const row=document.createElement('div');row.className='bubble-row '+(modern?'user':'assistant');row.dataset.messageId=m.id;
  if(!modern){
   const icon=document.createElement('span');icon.className='bubble-avatar';
   imageNode(room.participants?.find(p=>p.id===m.senderId)?.avatar,icon);
   if(!icon.childNodes.length)icon.textContent='👤';row.append(icon);
  }
  const content=document.createElement('div');content.className='group-reply-content';
  if(!modern){const name=document.createElement('div');name.className='group-reply-name';const label=document.createElement('span');label.className='group-name-label';label.textContent=m.name;name.append(label);content.append(name)}
  const bubble=document.createElement('button');bubble.type='button';bubble.className='bubble sengoku-bubble '+(modern?'user':'assistant');
  bubble.textContent=m.text; // verbatim: do not rewrite jokes, text, punctuation, or newlines
  bubble.setAttribute('aria-label',m.name+'の発言、タップして解説を表示');
  bubble.addEventListener('click',()=>selectExplanation(m));
  content.append(bubble);
  const at=document.createElement('div');at.className='history-message-time';at.textContent=clockJP(cycleStart+m.offsetMs);content.append(at);
  row.append(content);return row;
 }
 function append(m,start){
  const messageMs=start+m.offsetMs,day=dateJP(messageMs);
  if(day!==currentDay){const heading=document.createElement('div');heading.className='sengoku-date';heading.textContent=day;inner.append(heading);currentDay=day}
  inner.append(makeRow(m,start));rendered.push(m.id);
 }
 function showEmpty(state){
  if(inner.childElementCount)return;
  const msg=document.createElement('p');msg.id='sengoku-empty';
  msg.textContent=searchQuery?'該当する会話はありません':state.status==='unconfigured'?'配信開始日はまだ設定されていません':state.status==='waiting'?'配信開始までお待ちください':state.status==='preview'?'再生ボタンで会話を確認できます':'新しい会話を待っています';
  inner.append(msg);
 }
 function clearRows(){inner.replaceChildren();rendered=[];currentDay=''}
 function render(){
  if(!entries.length)return;
  const state=currentState(),start=state.cycleStart||core.startTime('2026-11-15');
  const visible=state.visible.filter(m=>!searchQuery||(m.text+' '+m.name+' '+m.explanation).toLocaleLowerCase().includes(searchQuery));
  if(displayedCycle!==null&&displayedCycle!==state.cycle&&!isPreview){selectedId=null;explanationText.textContent=''}
  displayedCycle=state.cycle;
  const cycleKey=String(state.cycle)+'|'+state.status+'|'+searchQuery+'|'+start;
  const sameCycle=cycleKey===renderedCycle;
  const appendOnly=sameCycle&&rendered.length<=visible.length&&rendered.every((id,i)=>id===visible[i].id);
  if(appendOnly&&rendered.length===visible.length)return; // no DOM changes when tapping an explanation
  const nearBottom=messagesBox.scrollHeight-messagesBox.scrollTop-messagesBox.clientHeight<115;
  const oldTop=messagesBox.scrollTop;
  if(!appendOnly){clearRows();renderedCycle=cycleKey}
  if(visible.length){
   if(!appendOnly){
    // Keep the existing DOM tree per message: the stable bottom panel won't move.
    for(const m of visible)append(m,start);
   }else{
    const empty=$('sengoku-empty');if(empty)empty.remove();
    for(let i=rendered.length;i<visible.length;i++)append(visible[i],start);
   }
  }else{clearRows();showEmpty(state)}
  // Updating the bottom explanation text does not change chat viewport height.
  requestAnimationFrame(()=>{if(nearBottom)messagesBox.scrollTop=messagesBox.scrollHeight;else messagesBox.scrollTop=oldTop});
 }
 $('group-members-direct').addEventListener('click',()=>{$('group-members').hidden=false;document.documentElement.dataset.membersOpen='true'});
 $('group-members-back').addEventListener('click',()=>{$('group-members').hidden=true;delete document.documentElement.dataset.membersOpen});
 function toggleSearch(open){
  searchOpen=open;$('group-search-form').hidden=!open;
  $('group-view').toggleAttribute('data-search-open',open);
  $('group-search-toggle').setAttribute('aria-expanded',String(open));
  if(open){$('group-search-input').focus()}else{$('group-search-input').value='';searchQuery='';render()}
 }
 $('group-search-toggle').addEventListener('click',()=>toggleSearch(!searchOpen));
 $('group-search-close').addEventListener('click',()=>toggleSearch(false));
 $('group-search-clear').addEventListener('click',()=>{$('group-search-input').value='';$('group-search-input').focus();searchQuery='';render()});
 $('group-search-input').addEventListener('input',()=>{searchQuery=$('group-search-input').value.trim().toLocaleLowerCase();$('group-search-clear').hidden=!searchQuery;render()});
 $('group-search-form').addEventListener('submit',e=>{e.preventDefault();$('group-search-input').blur()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&searchOpen)toggleSearch(false)});
 // No visible controls for normal readers. Preview alters *only* this window and never writes to the server.
 function previewStop(){if(previewTimer){clearInterval(previewTimer);previewTimer=null}previewLabel()}
 function previewLabel(){if(!isPreview)return;
  $('sengoku-preview-progress').textContent=previewCount+' / '+entries.length;
  $('sengoku-preview-play').textContent=previewTimer?'一時停止':'▶ 自動再生';
 }
 function previewSet(n){previewStop();previewCount=Math.max(0,Math.min(entries.length,n));render();previewLabel()}
 function previewPlay(){
  if(previewTimer){previewStop();return}
  if(previewCount>=entries.length)previewCount=0;
  render();
  previewTimer=setInterval(()=>{
   previewCount=Math.min(entries.length,previewCount+1);render();previewLabel();
   if(previewCount===entries.length)previewStop();
  },700);
  previewLabel();
 }
 if(isPreview){
  $('sengoku-preview-controls').hidden=false;
  $('sengoku-preview-play').addEventListener('click',previewPlay);
  $('sengoku-preview-reset').addEventListener('click',()=>previewSet(0));
  $('sengoku-preview-next').addEventListener('click',()=>previewSet(previewCount+1));
  $('sengoku-preview-all').addEventListener('click',()=>previewSet(entries.length));
  for(const day of [1,2,3]){
   $('sengoku-preview-day'+day).addEventListener('click',()=>previewSet(entries.filter(m=>m.dayNumber<=day).length));
  }
  window.addEventListener('pagehide',previewStop);
 }
 async function load(){
  try{
   const [response,settingsResponse]=await Promise.all([fetch('sengoku-chat/schedule.json',{cache:'no-store'}),fetch('sengoku-chat/config.json',{cache:'no-store'})]);
   if(!response.ok||!settingsResponse.ok)throw Error('配信データを取得できません');
   const fetchedAt=Date.now();
   const serverDate=response.headers.get('Date');
   // Approximate CDN age, if the server supplies it. Falls back to device clock.
   const age=Math.max(0,Number(response.headers.get('Age'))||0);
   if(serverDate){const serverMs=Date.parse(serverDate);if(Number.isFinite(serverMs)&&Math.abs(serverMs+age*1000-fetchedAt)<3*DAY_MS)serverOffsetMs=serverMs+age*1000-fetchedAt}
   const [data,settings]=await Promise.all([response.json(),settingsResponse.json()]);
   const parsed=core.parseMessages(data); // fail safely if any message/person/explanation mismatches
   if(settings.startDate!==null&&core.startTime(settings.startDate)===null)throw Error('配信開始日が不正です');
   const mapping=settings.participants||{};
   const merged={...data,startDate:settings.startDate,repeat:settings.repeat!==false,label:settings.label||'期間限定',image:settings.image||'',participants:data.speakerCatalog.map(p=>({id:p.speakerId,name:p.speakerName,role:p.speakerType,appCharacterId:mapping[p.speakerId]?.appCharacterId??null,avatar:mapping[p.speakerId]?.avatar||''}))};
   const checksum=JSON.stringify(data)+'|'+JSON.stringify(settings);
   if(checksum!==version){
    const selected=selectedId;
    room=merged;entries=parsed;version=checksum;
    applyMeta();clearRows();renderedCycle='';
    if(isPreview){previewCount=Math.min(previewCount,entries.length);previewLabel()}
    if(selected){const latest=entries.find(m=>m.id===selected);if(latest)selectExplanation(latest);else{selectedId=null;explanationText.textContent=''}}
   }
   render();
  }catch(error){
   console.error('Sengoku room:',error);
   if(!version){clearRows();const p=document.createElement('p');p.id='sengoku-empty';p.textContent='会話の読み込みに失敗しました';inner.append(p)}
  }
 }
 load();
 // Timed publication is calculated from one absolute Asia/Tokyo start date for EVERY viewer.
 // Device-unique IDs, localStorage progress, per-user AI calls, WebSocket sends: none.
 setInterval(()=>{if(!document.hidden)render()},3000);
 setInterval(()=>{if(!document.hidden)load()},300000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();load()}});
})();
