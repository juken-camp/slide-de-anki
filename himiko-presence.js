/* Presence is an app performance, not a claim about the historical person's life. */
(()=>{
 const KEY='himiko-personal-presence-v1';let model;
 try{model=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
 if(!model||!model.people)model={people:{},seed:Math.floor(Math.random()*1000000)};
 const $=id=>document.getElementById(id),person=id=>allChars.find(p=>p.id===Number(id));
 function entry(id){return model.people[id]||=( {activity:0,onlineUntil:0,queue:[],unread:0} )}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(model));return true}catch{setChatStorageStatus('送信待ちの保存ができません。端末の保存容量を確認してください','error');return false}}
 function hash(text){let h=2166136261;for(const c of text){h=Math.imul(h^c.charCodeAt(0),16777619)}return h>>>0}
 function presence(ch,now=Date.now()){
  const e=entry(ch.id);if(ch.id===0||e.onlineUntil>now)return {label:'オンライン',color:'#22c55e',delay:0};
  const jp=new Date(now+9*3600000),hour=jp.getUTCHours(),slot=Math.floor(now/1800000);
  const draw=hash(ch.id+':'+slot+':'+model.seed)%100;
  const reflective=/式部|漱石|芭蕉|雪舟|ソクラテス/.test(ch.name),active=/信長|秀吉|龍馬/.test(ch.name);
  const online=reflective?48:active?75:62;
  // Religious figures remain third-person explainers; no invented personal schedule.
  if(ch.isExplainer||ch.isNarrator)return {label:'解説受付中',color:'#22c55e',delay:0};
  if(hour>=7&&hour<23&&draw<online)return {label:'オンライン',color:'#22c55e',delay:0};
  return draw<88&&hour>=7&&hour<23?{label:'離席中',color:'#eab308',delay:60000+hash(ch.id+':away:'+slot)%240001}:{label:'あとで戻る',color:'#94a3b8',delay:600000+hash(ch.id+':later:'+slot)%1200001};
 }
 function previewText(e,ch){
  if(!e.preview)return String(ch.catchphrase||'').replace(/^💬\s*/,'');
  const text=e.previewRole==='user'?e.preview:cleanReplyText(e.preview);
  const last=e.previewRole==='user'?text:splitReplyBubbles(text).at(-1)||text;
  return '💬 '+last.replace(/\s+/g,' ').trim();
 }
 function sorted(list){return [...list].sort((a,b)=>model.defaultOrder?allChars.indexOf(a)-allChars.indexOf(b):(entry(b.id).activity||0)-(entry(a.id).activity||0))}
 function restoreOrder(){model.defaultOrder=true;save();renderCards()}
 function touch(id){model.defaultOrder=false;entry(id).activity=Date.now();save()}
 // Keep the original order for people who have not exchanged messages yet.
 const baseCards=renderCards;
 renderCards=function(){baseCards();const box=$('card-list');if(!box)return;const cards=[...box.querySelectorAll('.char-card[onclick]')];
  const ids=cards.map(el=>({el,id:Number(el.getAttribute('onclick')?.match(/openChat\((\d+)\)/)?.[1])})).filter(x=>person(x.id));
  ids.sort((a,b)=>model.defaultOrder?allChars.indexOf(person(a.id))-allChars.indexOf(person(b.id)):(entry(b.id).activity||0)-(entry(a.id).activity||0));
  document.querySelectorAll('[data-personal-sort]').forEach(b=>b.setAttribute('aria-checked',String((b.dataset.personalSort==='default')===!!model.defaultOrder)));
  for(const {el,id} of ids){box.append(el);const ch=person(id),p=presence(ch),row=el.querySelector('.card-name-row');row?.querySelector('.online-badge')?.remove();
   const badge=document.createElement('span');badge.className='online-badge';badge.textContent=p.label;badge.style.color=p.color;badge.style.background=p.color+'20';row?.append(badge);
   const av=el.querySelector('.avatar');av?.querySelector('.online-dot')?.remove();if(av){const dot=document.createElement('div');dot.className='online-dot';dot.style.background=p.color;av.append(dot)}
   const preview=el.querySelector('.card-info>div:last-child');if(preview){
    preview.classList.add('personal-preview');preview.replaceChildren();const text=document.createElement('span');text.className='personal-preview-text';text.textContent=previewText(entry(id),ch);preview.append(text);
    const dots=document.createElement('span');dots.className='personal-card-typing';dots.setAttribute('aria-label','返信を準備中');dots.hidden=!isTyping(id);for(let i=0;i<3;i++)dots.append(document.createElement('i'));preview.append(dots);
   }
   if(entry(id).unread){const n=document.createElement('span');n.className='personal-unread';n.textContent=entry(id).unread;row?.append(n)}
  }
 };
 function header(){if(!currentChar)return;const p=presence(currentChar),b=$('online-badge');b.classList.remove('hidden');b.textContent=(p.delay?'● ':'🟢 ')+p.label;b.style.color=p.color;b.style.background=p.color+'20';}
 let pendingStamp='';
 function pending(){const ch=currentChar;if(!ch||!chatReady)return;header();const e=entry(ch.id),stamp=ch.id+':'+chatEpoch+':'+e.queue.map(j=>j.key).join(',')+':'+(e.queue[0]?.due-Date.now()<=10000);if(stamp===pendingStamp&&$('personal-pending'))return;pendingStamp=stamp;$('personal-pending')?.remove();if(!e.queue.length)return;
  const node=document.createElement('div');node.id='personal-pending';
  for(const job of e.queue)node.append(nodeFromHTML(userRowHTML(ch,job.text,false,job.at,false)));
  if(e.queue[0].due-Date.now()<=10000)node.append(nodeFromHTML(typingHTML(ch)));
  else {const note=document.createElement('div');note.className='personal-wait';note.textContent='送信済み・返信を待っています';node.append(note)}
  appendChatNode(node,false);
 }
 const baseOpen=openChat;
 openChat=async function(id){await baseOpen(id);if(currentChar?.id===Number(id)){entry(id).unread=0;save();pending();}};
 function isTyping(id,now=Date.now()){const e=entry(id);return processingId===id||!!(e.queue.length&&!e.error&&e.queue[0].due-now<=10000)}
 const baseSend=sendMessage;
 sendMessage=async function(text){if(!text?.trim()||!currentChar||!chatReady||isLoading)return;
  clearTimeout(personalSuggestionTimer);messageInner()?.querySelectorAll('.suggestions').forEach(n=>n.remove());
  const ch=currentChar,e=entry(ch.id),p=presence(ch);touch(ch.id);
  if(!p.delay)e.onlineUntil=Date.now()+600000;
  e.preview=text.trim();e.previewRole='user';e.error='';
  const previous=JSON.stringify(e.queue);e.queue.push({key:Date.now()+':'+Math.random(),text:text.trim(),at:Date.now(),due:e.queue[0]?.due||Date.now()+(p.delay||1500+Math.floor(Math.random()*3500))});
  if(!save()){e.queue=JSON.parse(previous);return;}
  $('msg-input').value='';playSendSound();pending();scrollChatToEnd(true);updateSendBtn();
 };
 let processing=false,processingId=null;
 async function deliver(){
  if(processing||isLoading||activeReveal)return;
  const now=Date.now(),ch=allChars.find(ch=>entry(ch.id).queue.length&&entry(ch.id).queue[0].due<=now&&!entry(ch.id).paused);if(!ch)return;
  processing=true;processingId=ch.id;const e=entry(ch.id),batch=[...e.queue],keys=new Set(batch.map(j=>j.key));
  // Batch small follow-up messages, keeping the entire input rather than truncating it.
  const selected=[];let length=0;for(const j of batch){if(length+j.text.length+(selected.length?2:0)>2000)break;selected.push(j);length+=j.text.length+2}
  if(!selected.length){e.paused=true;save();processing=false;processingId=null;return}
  const question=selected.map(j=>j.text).join('\n\n'),chosen=new Set(selected.map(j=>j.key));
  try{
   const prior=await readSavedChat(ch.id),turns=prior?.turns||[];let used=question.length;const history=[];
   for(let i=turns.length-2;i>=0&&history.length<16;i-=2){if(used+turns[i].content.length+turns[i+1].content.length>10000)break;history.unshift(turns[i],turns[i+1]);used+=turns[i].content.length+turns[i+1].content.length}
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);let r;
   try{r=await fetch('/api/himiko-chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({characterId:ch.id,messages:[...history,{role:'user',content:question}]})})}finally{clearTimeout(timeout)}
   const data=await r.json();if(!r.ok)throw Error(data.error||'返信を取得できませんでした');
   const raw=typeof data.reply==='string'?data:(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');const parsed=parseSuggestions(raw,ch);if(!parsed.text)throw Error('返信を読み取れませんでした');
   // A reset during generation invalidates this response.
   if(!selected.every(j=>e.queue.some(x=>x.key===j.key)))return;
   const answerAt=Date.now(),user={role:'user',content:question,at:selected[0].at,read:true},answer={role:'assistant',content:parsed.text,at:answerAt,chunkTimes:[]};
   await writeSavedChat(ch.id,{turns:[...turns,user,answer],suggestions:parsed.suggestions});
   e.queue=e.queue.filter(j=>!chosen.has(j.key));e.onlineUntil=answerAt+600000;e.activity=answerAt;model.defaultOrder=false;e.preview=parsed.text;e.previewRole='assistant';e.unread+=(currentChar?.id===ch.id?0:1);e.error='';save();
   if(currentChar?.id===ch.id&&chatReady){$('personal-pending')?.remove();messages=[{role:'assistant',content:ch.greeting},...turns,user];dynamicSuggestions=[];renderMessages();messages.push(answer);dynamicSuggestions=parsed.suggestions;playReceiveSound();startReveal(ch,parsed.text,parsed.suggestions);pending();}
   else renderCards();
  }catch(err){e.error=String(err.message);e.queue.forEach(j=>{if(chosen.has(j.key))j.due=Date.now()+60000});save();if(currentChar?.id===ch.id)setChatStorageStatus('返信を取得できませんでした。送信内容を保持して再試行します','error');}
  finally{processing=false;processingId=null;}
 }
 window.addEventListener('himiko-person-bubble',event=>{const e=entry(event.detail.id);e.preview=event.detail.text;e.previewRole='assistant';save();});
 window.addEventListener('himiko-person-reset',event=>{entry(event.detail.id).queue=[];entry(event.detail.id).unread=0;entry(event.detail.id).preview='';save();pendingStamp='';});
 let stamp='';setInterval(()=>{deliver();if(currentChar)pending();else if(!$('list-view').classList.contains('hidden')){const next=allChars.map(ch=>ch.id+presence(ch).label+entry(ch.id).activity+entry(ch.id).unread+isTyping(ch.id)+entry(ch.id).preview+!!model.defaultOrder).join('|');if(next!==stamp){stamp=next;renderCards()}}},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){deliver();pending();renderCards()}});
 const list=$('card-list');if(list){
  const tools=document.createElement('div');tools.className='personal-sort';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='personal-sort-trigger';trigger.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/></svg>';trigger.setAttribute('aria-label','人物の並び順を選ぶ');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','personal-sort-menu');
  const menu=document.createElement('div');menu.id='personal-sort-menu';menu.className='personal-sort-menu';menu.hidden=true;menu.setAttribute('role','menu');
  function close(){menu.hidden=true;trigger.setAttribute('aria-expanded','false')}
  for(const [value,label] of [['recent','最近のやり取り順'],['default','元の順番']]){const b=document.createElement('button');b.type='button';b.dataset.personalSort=value;b.textContent=label;b.setAttribute('role','menuitemradio');b.onclick=()=>{model.defaultOrder=value==='default';save();close();renderCards();trigger.focus()};menu.append(b)}
  trigger.onclick=()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('button')?.focus()};
  tools.append(trigger,menu);const count=$('filter-count');if(count){count.classList.add('personal-sort-heading');count.append(tools)}else list.before(tools);
  document.addEventListener('click',e=>{if(!tools.contains(e.target))close()});tools.addEventListener('keydown',e=>{if(e.key==='Escape'){close();trigger.focus()}});
 }
 const style=document.createElement('style');style.textContent='#list-view #card-list .char-card{position:relative}#list-view #card-list .char-card .card-inner{gap:10px}#list-view #card-list .char-card .card-info{min-width:0}#list-view #card-list .char-card .card-name-row{padding-right:30px}#list-view #card-list .char-card .fav-btn{position:absolute;right:9px;top:9px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:2px} .personal-sort-heading>.filter-count-text{flex:1;min-width:0}.personal-sort{position:relative;flex:0 0 34px;margin-left:auto}.personal-sort-trigger{display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;font:24px/1 Arial,sans-serif;color:#885b39;background:#fff7eb;border:1.5px solid #d2ab85;border-radius:9px;cursor:pointer}.personal-sort-trigger svg{display:block;flex:none;width:22px;height:22px;pointer-events:none}.personal-sort-menu{position:absolute;right:0;top:40px;z-index:50;width:190px;padding:5px;border:1.5px solid #d2ab85;border-radius:12px;background:#fff7eb;box-shadow:0 8px 24px #0003}.personal-sort-menu[hidden]{display:none!important}.personal-sort-menu button{display:block;width:100%;padding:11px 12px;border:0;border-radius:7px;background:transparent;color:#805432;text-align:left;font-family:inherit;font-size:12px;font-weight:600;line-height:1.5;cursor:pointer}.personal-sort-menu button[aria-checked=true]{background:#ead2b955}.personal-sort-menu button[aria-checked=true]::after{content:"✓";float:right}html[data-persona=cyber] .personal-sort-trigger{color:#62f6ff;background:#10243b;border-color:#3e819c;box-shadow:0 0 8px #00e5ff25}html[data-persona=cyber] .personal-sort-menu{background:#101b32;border-color:#3e819c;box-shadow:0 8px 24px #0008,0 0 12px #00e5ff20}html[data-persona=cyber] .personal-sort-menu button{color:#c6efff}html[data-persona=cyber] .personal-sort-menu button[aria-checked=true]{color:#6dffff;background:#1b415b}.personal-preview{display:flex;align-items:center;gap:6px;min-height:22px}.personal-preview-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.personal-card-typing{display:inline-flex;flex:0 0 30px;height:20px;align-items:center;justify-content:center;gap:3px;border-radius:12px;background:#dce8ef;color:#527086}.personal-card-typing[hidden]{display:none!important}.personal-card-typing i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:groupEntryDot 1.2s infinite}.personal-card-typing i:nth-child(2){animation-delay:.18s}.personal-card-typing i:nth-child(3){animation-delay:.36s}@media(prefers-reduced-motion:reduce){.personal-card-typing i{animation:none}}.personal-wait{font-size:11px;color:#94a3b8;text-align:right;margin:6px 0 12px}.personal-unread{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:20px;background:#19aab5;color:white;font-size:11px;padding:0 4px}';document.head.append(style);
 openChatDB().then(db=>new Promise((resolve,reject)=>{const r=db.transaction(CHAT_DB_STORE,'readonly').objectStore(CHAT_DB_STORE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})).then(records=>{for(const r of records){const last=r.turns?.at(-1),at=last?.at;if(at&&person(r.id)){const e=entry(r.id);if(at>=(e.activity||0)){e.activity=at;e.preview=last.content;e.previewRole=last.role;}}}save();renderCards()}).catch(()=>{});
 renderCards();
})();
