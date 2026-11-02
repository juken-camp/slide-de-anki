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
 function sorted(list){return [...list].sort((a,b)=>(entry(b.id).activity||0)-(entry(a.id).activity||0))}
 function touch(id){entry(id).activity=Date.now();save()}
 // Keep the original order for people who have not exchanged messages yet.
 const baseCards=renderCards;
 renderCards=function(){baseCards();const box=$('card-list');if(!box)return;const cards=[...box.querySelectorAll('.char-card[onclick]')];
  const ids=cards.map(el=>({el,id:Number(el.getAttribute('onclick')?.match(/openChat\((\d+)\)/)?.[1])})).filter(x=>person(x.id));
  ids.sort((a,b)=>(entry(b.id).activity||0)-(entry(a.id).activity||0));
  for(const {el,id} of ids){box.append(el);const ch=person(id),p=presence(ch),row=el.querySelector('.card-name-row');row?.querySelector('.online-badge')?.remove();
   const badge=document.createElement('span');badge.className='online-badge';badge.textContent=p.label;badge.style.color=p.color;badge.style.background=p.color+'20';row?.append(badge);
   const av=el.querySelector('.avatar');av?.querySelector('.online-dot')?.remove();if(av){const dot=document.createElement('div');dot.className='online-dot';dot.style.background=p.color;av.append(dot)}
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
 const baseSend=sendMessage;
 sendMessage=async function(text){if(!text?.trim()||!currentChar||!chatReady||isLoading)return;
  const ch=currentChar,e=entry(ch.id),p=presence(ch);touch(ch.id);
  if(!p.delay&&!e.queue.length){e.onlineUntil=Date.now()+600000;save();await baseSend(text);touch(ch.id);header();return;}
  const previous=JSON.stringify(e.queue);e.queue.push({key:Date.now()+':'+Math.random(),text:text.trim(),at:Date.now(),due:e.queue[0]?.due||Date.now()+p.delay});
  if(!save()){e.queue=JSON.parse(previous);return;}
  $('msg-input').value='';playSendSound();pending();scrollChatToEnd(true);updateSendBtn();
 };
 let processing=false;
 async function deliver(){
  if(processing||isLoading||activeReveal)return;
  const now=Date.now(),ch=allChars.find(ch=>entry(ch.id).queue.length&&entry(ch.id).queue[0].due<=now&&!entry(ch.id).paused);if(!ch)return;
  processing=true;const e=entry(ch.id),batch=[...e.queue],keys=new Set(batch.map(j=>j.key));
  // Batch small follow-up messages, keeping the entire input rather than truncating it.
  const selected=[];let length=0;for(const j of batch){if(length+j.text.length+2>2000)break;selected.push(j);length+=j.text.length+2}
  if(!selected.length){e.paused=true;save();processing=false;return}
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
   e.queue=e.queue.filter(j=>!chosen.has(j.key));e.onlineUntil=answerAt+600000;e.activity=answerAt;e.unread+=(currentChar?.id===ch.id?0:1);e.error='';save();
   if(currentChar?.id===ch.id&&chatReady){$('personal-pending')?.remove();messages=[{role:'assistant',content:ch.greeting},...turns,user,answer];dynamicSuggestions=parsed.suggestions;renderMessages();playReceiveSound();pending();}
   else renderCards();
  }catch(err){e.error=String(err.message);e.queue.forEach(j=>{if(chosen.has(j.key))j.due=Date.now()+60000});save();if(currentChar?.id===ch.id)setChatStorageStatus('返信を取得できませんでした。送信内容を保持して再試行します','error');}
  finally{processing=false;}
 }
 window.addEventListener('himiko-person-reset',event=>{entry(event.detail.id).queue=[];entry(event.detail.id).unread=0;save();pendingStamp='';});
 let stamp='';setInterval(()=>{deliver();if(currentChar)pending();else if(!$('list-view').classList.contains('hidden')){const next=allChars.map(ch=>ch.id+presence(ch).label+entry(ch.id).activity+entry(ch.id).unread).join('|');if(next!==stamp){stamp=next;renderCards()}}},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){deliver();pending();renderCards()}});
 const style=document.createElement('style');style.textContent='.personal-wait{font-size:11px;color:#94a3b8;text-align:right;margin:6px 0 12px}.personal-unread{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:20px;background:#19aab5;color:white;font-size:11px;padding:0 4px}';document.head.append(style);
 openChatDB().then(db=>new Promise((resolve,reject)=>{const r=db.transaction(CHAT_DB_STORE,'readonly').objectStore(CHAT_DB_STORE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})).then(records=>{for(const r of records){const at=r.turns?.at(-1)?.at;if(at&&person(r.id))entry(r.id).activity=Math.max(entry(r.id).activity||0,at)}save();renderCards()}).catch(()=>{});
 renderCards();
})();
