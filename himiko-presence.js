/* Presence is an app performance, not a claim about the historical person's life. */
(()=>{
 const KEY='himiko-personal-presence-v1';let model;
 try{model=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
 if(!model||!model.people)model={people:{},seed:Math.floor(Math.random()*1000000)};
 const $=id=>document.getElementById(id),person=id=>allHistoryChars.find(p=>p.id===Number(id));
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
 window.himikoPersonPresence=presence;
 window.himikoPersonalUnreadCount=id=>entry(Number(id)).unread||0;
 function previewText(e,ch){
  if(!e.preview)return String(ch.catchphrase||'').replace(/^💬\s*/,'');
  const text=e.previewRole==='user'?e.preview:cleanReplyText(e.preview);
  const last=e.previewRole==='user'?text:splitReplyBubbles(text).at(-1)||text;
  return '💬 '+last.replace(/\s+/g,' ').trim();
 }
 function sorted(list){return [...list].sort((a,b)=>model.defaultOrder?allChars.indexOf(a)-allChars.indexOf(b):(entry(b.id).activity||0)-(entry(a.id).activity||0))}
 function restoreOrder(){model.defaultOrder=true;save();renderCards()}
 window.himikoRestorePersonalOrder=()=>{if(!confirm('人物の並びを元の順番に戻しますか？\n会話履歴は消えません。'))return;restoreOrder()};
 function touch(id){model.defaultOrder=false;entry(id).activity=Date.now();save()}
 // Keep the original order for people who have not exchanged messages yet.

 const ERA_SECTIONS=[
 ['jomon','縄文時代','約1万6千年前〜紀元前10世紀頃',[]],
 ['ancient','世界の古代','紀元前〜5世紀頃',[80,81,34,33,75]],
 ['yayoi','弥生時代','紀元前10世紀頃〜3世紀頃',[1]],
 ['kofun','古墳時代','3世紀中頃〜6世紀末',[61]],
 ['asuka','飛鳥時代','6世紀末〜710年',[2,3,105,106]],
 ['nara','奈良時代','710〜794年',[57,84,4]],
 ['heian','平安時代','794〜1185年',[96,58,62,5,6,72,107,108,109,110,159]],
 ['medieval','世界の中世','5〜15世紀頃',[35,36,9]],
 ['kamakura','鎌倉時代','1185〜1333年',[97,7,8,85,98,86,99,100,60,111,112,113,152]],
 ['muromachi','室町時代','1336〜1573年',[59,87,10,11,114,115,116,160,161,164]],
 ['earlymodern','世界の近世','15〜18世紀頃',[37,77,88,38,117,90,91,40,39,145,146]],
 ['momoyama','安土桃山時代','1573〜1603年',[12,13,118,158]],
 ['edo','江戸時代','1603〜1868年',[14,89,101,15,102,17,16,18,119,120,121,122,123,124,125,126,127,129,130,149,153,154,155,156,157,162]],
 ['modern','世界の近代','18世紀末〜1945年頃',[41,43,42,46,45,51,49,147,148,128]],
 ['meiji','明治時代','1868〜1912年',[92,93,20,94,21,95,19,24,23,22,131,132,133,134,135,136,137,138,139,140,151]],
 ['taisho','大正時代','1912〜1926年',[25,141,142]],
 ['showa','昭和時代','1926〜1989年',[27,53,144]],
 ['contemporary','世界の現代','1945年頃〜現在',[52,143]],
 ['heisei','平成時代','1989〜2019年',[]],
 ['reiwa','令和時代','2019年〜現在',[]]
 ];
 const WORLD_KEYS=new Set(['ancient','medieval','earlymodern','modern','contemporary']);
 const worldSections=ERA_SECTIONS.filter(([key])=>WORLD_KEYS.has(key));
 const japaneseSections=ERA_SECTIONS.filter(([key])=>!WORLD_KEYS.has(key));
 const worldIds=new Set([...worldSections.flatMap(section=>section[3]),84]);
 const eraForId=new Map(ERA_SECTIONS.flatMap(([key,title,date,ids])=>ids.map(id=>[id,key])));
 const japaneseWorldEras={80:'ancient',81:'ancient',34:'ancient',33:'ancient',75:'ancient',35:'asuka',36:'kamakura',9:'kamakura',37:'muromachi',77:'muromachi',88:'muromachi',38:'muromachi',117:'muromachi',145:'muromachi',90:'edo',91:'edo',40:'edo',39:'edo',146:'edo',128:'edo',41:'edo',43:'edo',42:'meiji',46:'meiji',45:'meiji',147:'meiji',148:'taisho',51:'showa',49:'showa',52:'showa',143:'showa'};
 const worldEraForId=new Map(worldSections.flatMap(([key,title,date,ids])=>ids.map(id=>[id,key])));worldEraForId.set(84,'medieval');
 const japaneseWithAncient=japaneseSections;
 const relatedWorldIds=new Set([84,9,117,128,143,147,51,49,52]);
 const estimatedCentury={1:3,105:6,109:10,113:12,155:17,162:17};
 const mode=()=>['conversation','world','birth'].includes(model.listMode)?model.listMode:'era';
 function groupEraCards(box,ids){
  const sections=mode()==='world'?worldSections:japaneseWithAncient;
  const rows=new Map(sections.map(([key])=>[key,[]]));
  for(const item of ids){if(item.id===0){box.append(item.el);continue}const key=mode()==='world'?worldEraForId.get(item.id):(japaneseWorldEras[item.id]||eraForId.get(item.id));if(!rows.has(key))continue;rows.get(key).push(item.el)}
  const noFilters=!$('search-input').value.trim()&&Object.values(selectedFilters).every(set=>!set.size);
  for(const [key,title,date] of sections){
   const cards=rows.get(key),showEmpty=mode()==='era'&&((noFilters&&['jomon','kofun','heisei','reiwa'].includes(key))||(key==='jomon'&&selectedFilters.era.has('縄文')&&!$('search-input').value.trim()));
   if(!cards.length&&!showEmpty)continue;
   if(showEmpty)box.querySelector('.empty-state')?.remove();
   const section=document.createElement('section');section.className='history-era-section';section.dataset.era=key;
   const heading=document.createElement('h3');heading.className='history-era-heading';
   const label=document.createElement('span');label.textContent=title;const years=document.createElement('span');years.className='history-era-years';years.textContent='（'+date+'）';heading.append(label,years);section.append(heading);
   if(cards.length)section.append(...cards);else{const empty=document.createElement('p');empty.className='history-era-empty';empty.textContent='この時代の人物はまだいません';section.append(empty)}box.append(section);
  }
 }
 function birthInfo(ch){
  const period=String(ch.period||'');
  if(Object.prototype.hasOwnProperty.call(estimatedCentury,ch.id)){const century=estimatedCentury[ch.id];return century?{sort:century*100-0.5,century,estimated:true}:{sort:Infinity,century:null,estimated:true};}
  const match=period.match(/(?:紀元前\s*)?(\d+)年?頃?(?:〜|～|－|–|-)/);
  if(match){const bc=match[0].includes('紀元前'),year=Number(match[1]),sort=bc?1-year:year;return {sort,century:bc?-Math.ceil(year/100):Math.ceil(year/100),estimated:false};}
  const before=period.match(/紀元前(\d+)世紀/);if(before){const c=Number(before[1]);return {sort:1-c*100,century:-c,estimated:true};}
  return {sort:Infinity,century:null,estimated:true};
 }
 function groupBirthCards(box,ids){
  const ai=ids.find(item=>item.id===0);if(ai)box.append(ai.el);
  const list=ids.filter(item=>item.id!==0).map(item=>({...item,info:birthInfo(person(item.id))}));
  list.sort((a,b)=>a.info.sort-b.info.sort||allChars.indexOf(person(a.id))-allChars.indexOf(person(b.id)));
  let currentKey=null,section=null;
  for(const item of list){const c=item.info.century,key=c===null?'unknown':String(c);if(key!==currentKey){currentKey=key;section=document.createElement('section');section.className='history-era-section';section.dataset.era='birth-'+key;const h=document.createElement('h3');h.className='history-era-heading';const label=document.createElement('span');const years=document.createElement('span');years.className='history-era-years';if(c===null){label.textContent='生年不詳'}else if(c<0){const n=-c;label.textContent='紀元前'+n+'世紀';years.textContent='（紀元前'+(n*100)+'〜'+((n-1)*100+1)+'年）'}else{label.textContent=c+'世紀';years.textContent='（'+((c-1)*100+1)+'〜'+(c*100)+'年）'}h.append(label,years);section.append(h);box.append(section)}section.append(item.el)}
 }
 function syncListMode(){document.querySelectorAll('[data-history-list-mode]').forEach(button=>{const active=button.dataset.historyListMode===mode();button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active)})}
 window.setHistoryListMode=value=>{if(!['era','world','birth','conversation'].includes(value))return;model.listMode=value;save();renderCards()};

 const baseCards=renderCards;
 renderCards=function(){baseCards();const box=$('card-list');if(!box)return;const cards=[...box.querySelectorAll('.char-card[onclick]')];
  let ids=cards.map(el=>({el,id:Number(el.getAttribute('onclick')?.match(/openChat\((\d+)\)/)?.[1])})).filter(x=>person(x.id));
  if(mode()==='world'||mode()==='era'){
   const allowed=item=>item.id===0||mode()==='world'?item.id===0||worldIds.has(item.id):!worldIds.has(item.id)||relatedWorldIds.has(item.id);
   for(const item of ids)if(!allowed(item))item.el.remove();
   ids=ids.filter(allowed);
   if(!ids.length&&!box.querySelector('.empty-state')){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='該当する人物が見つかりません';box.append(empty)}
   const count=$('filter-count')?.querySelector('.filter-count-text');if(count){const met=ids.filter(item=>item.el.classList.contains('group-met')).length;const suffix=document.documentElement.dataset.persona==='cyber'?'ぜ':'にゃ';count.textContent=`${ids.length}人いる${suffix}。そのうち${met}人と話してる${suffix}`}
  }
  ids.sort((a,b)=>mode()!=='conversation'?allChars.indexOf(person(a.id))-allChars.indexOf(person(b.id)):(entry(b.id).activity||0)-(entry(a.id).activity||0));
  for(const {el,id} of ids){box.append(el);const ch=person(id),p=presence(ch),row=el.querySelector('.card-name-row');row?.querySelector('.online-badge')?.remove();
   const badge=document.createElement('span');badge.className='online-badge';badge.textContent=p.label;badge.style.color=p.color;badge.style.background=p.color+'20';row?.append(badge);
   const av=el.querySelector('.avatar');av?.querySelector('.online-dot')?.remove();if(av){const dot=document.createElement('div');dot.className='online-dot';dot.style.background=p.color;av.append(dot)}
   const preview=el.querySelector('.card-info>div:last-child');if(preview){
    preview.classList.add('personal-preview');preview.classList.toggle('is-description',mode()!=='conversation');preview.replaceChildren();const text=document.createElement('span');text.className='personal-preview-text';text.textContent=mode()!=='conversation'?ch.catchphrase:previewText(entry(id),ch);preview.append(text);
    const dots=document.createElement('span');dots.className='personal-card-typing';dots.setAttribute('aria-label','返信を準備中');dots.hidden=!isTyping(id);for(let i=0;i<3;i++)dots.append(document.createElement('i'));preview.append(dots);
   }
   if(entry(id).unread){const n=document.createElement('span');n.className='group-unread personal-unread';n.textContent=entry(id).unread;n.setAttribute('aria-label','未読'+entry(id).unread+'件');el.append(n)}
  }
  if(mode()==='birth')groupBirthCards(box,ids);else if(mode()!=='conversation')groupEraCards(box,ids);syncListMode();
 };

 function header(){if(!currentChar)return;const p=presence(currentChar),b=$('online-badge');b.classList.remove('hidden');b.textContent=p.label;b.style.color=p.color;b.style.background=p.color+'20';}
 // Latch receipts so navigating away or a retry never makes a read message unread.
 function updateQueueReads(e,now=Date.now()){
  let changed=false;
  for(const job of e.queue){const readAt=Number.isFinite(job.readAt)?job.readAt:Math.max(job.at||0,job.due-5000);if(!job.read&&now>=readAt){job.read=true;changed=true}}
  if(changed)save();
 }
 function typingReady(job,now=Date.now()){if(!job)return false;const readAt=Number.isFinite(job.readAt)?job.readAt:Math.max(job.at||0,job.due-5000);return now>=readAt+500&&job.due-now<=10000}
 let pendingStamp='';
 function pending(){const ch=currentChar;if(!ch||!chatReady)return;header();const e=entry(ch.id);updateQueueReads(e);const stamp=ch.id+':'+chatEpoch+':'+e.queue.map(j=>j.key+':'+!!j.read).join(',')+':'+typingReady(e.queue[0]);if(stamp===pendingStamp&&$('personal-pending'))return;pendingStamp=stamp;$('personal-pending')?.remove();if(!e.queue.length)return;
  const node=document.createElement('div');node.id='personal-pending';
  for(const job of e.queue)node.append(nodeFromHTML(userRowHTML(ch,job.text,false,job.at,!!job.read)));
  if(typingReady(e.queue[0]))node.append(nodeFromHTML(typingHTML(ch)));
  appendChatNode(node,false);
 }
 const baseOpen=openChat;
 openChat=async function(id){
  const opened=baseOpen(id),epoch=chatEpoch;
  await opened;
  if(epoch===chatEpoch&&currentChar?.id===Number(id)&&chatReady){
   if(messages.length>1){entry(id).unread=0;save();renderCards();}
   pending();
  }
 };
 function isTyping(id,now=Date.now()){const e=entry(id);return processingId===id||!!(e.queue.length&&!e.error&&typingReady(e.queue[0],now))}
 const baseSend=sendMessage;
 sendMessage=async function(text){if(!text?.trim()||!currentChar||!chatReady||isLoading)return;
  clearTimeout(personalSuggestionTimer);
  const ch=currentChar,e=entry(ch.id),p=presence(ch);touch(ch.id);
  if(!p.delay)e.onlineUntil=Date.now()+600000;
  e.preview=text.trim();e.previewRole='user';e.error='';
  const previous=JSON.stringify(e.queue),at=Date.now(),due=e.queue[0]?.due||at+(p.delay||1500+Math.floor(Math.random()*3500));e.queue.push({key:at+':'+Math.random(),text:text.trim(),at,due,readAt:p.delay?Math.max(at,due-5000):at+700,read:false});
  if(!save()){e.queue=JSON.parse(previous);return;}
  const {hadQuestions,oldTop}=preparePersonalSend();
  userReadingHistory=false;
  $('msg-input').value='';playSendSound();pending();
  if(hadQuestions){$('messages').scrollTop=oldTop;previousChatScroll=oldTop;}else scrollChatToEnd(true);
  updateSendBtn();
 };
 let processing=false,processingId=null;
 async function deliver(){
  if(processing||isLoading||activeReveal)return;
  const now=Date.now(),ch=allHistoryChars.find(ch=>entry(ch.id).queue.length&&entry(ch.id).queue[0].due<=now&&!entry(ch.id).paused);if(!ch)return;
  processing=true;processingId=ch.id;const e=entry(ch.id),batch=[...e.queue],keys=new Set(batch.map(j=>j.key));
  // Batch small follow-up messages, keeping the entire input rather than truncating it.
  const selected=[];let length=0;for(const j of batch){if(length+j.text.length+(selected.length?2:0)>2000)break;selected.push(j);length+=j.text.length+2}
  if(!selected.length){e.paused=true;save();processing=false;processingId=null;return}
  const question=selected.map(j=>j.text).join('\n\n'),chosen=new Set(selected.map(j=>j.key));
  try{
   const prior=await readSavedChat(ch.id),turns=prior?.turns||[];let used=question.length;const history=[];
   for(let i=turns.length-2;i>=0&&history.length<16;i-=2){if(used+turns[i].content.length+turns[i+1].content.length>10000)break;history.unshift(turns[i],turns[i+1]);used+=turns[i].content.length+turns[i+1].content.length}
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);let r;
   try{r=await fetch('/api/himiko-chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({characterId:ch.id,nickname:himikoNickname(),messages:[...history,{role:'user',content:question}]})})}finally{clearTimeout(timeout)}
   const data=await r.json();if(!r.ok)throw Error(data.error||'返信を取得できませんでした');
   const raw=typeof data.reply==='string'?data:(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');const parsed=parseSuggestions(raw,ch);if(!parsed.text)throw Error('返信を読み取れませんでした');
   // A reset during generation invalidates this response.
   if(!selected.every(j=>e.queue.some(x=>x.key===j.key)))return;
   const answerAt=Date.now(),user={role:'user',content:question,at:selected[0].at,read:true},answer={role:'assistant',content:parsed.text,at:answerAt,chunkTimes:[]};
   await writeSavedChat(ch.id,{turns:[...turns,user,answer],suggestions:parsed.suggestions});
   e.queue=e.queue.filter(j=>!chosen.has(j.key));e.onlineUntil=answerAt+600000;e.activity=answerAt;model.defaultOrder=false;e.preview=parsed.text;e.previewRole='assistant';e.unread+=(currentChar?.id===ch.id?0:1);e.error='';save();
   if(currentChar?.id===ch.id&&chatReady){
    // Keep the existing DOM and viewport, including the send-time height floor.
    // Rebuilding history here used to jump again when the API reply arrived.
    const pendingNode=$('personal-pending');
    const userNode=nodeFromHTML(userRowHTML(ch,question,false,user.at,true));
    if(pendingNode)pendingNode.replaceWith(userNode);else appendChatNode(userNode,false);
    messages=[{role:'assistant',content:ch.greeting},...turns,user,answer];
    dynamicSuggestions=parsed.suggestions;startReveal(ch,parsed.text,parsed.suggestions);pending();
   }
   else renderCards();
  }catch(err){e.error=String(err.message);e.queue.forEach(j=>{if(chosen.has(j.key))j.due=Date.now()+60000});save();if(currentChar?.id===ch.id)setChatStorageStatus('返信を取得できませんでした。送信内容を保持して再試行します','error');}
  finally{processing=false;processingId=null;}
 }
 window.addEventListener('himiko-group-speaker',event=>{const {id,at}=event.detail||{};if(!person(id)||!Number.isFinite(at)||at>Date.now()||at<Date.now()-600000)return;const e=entry(id),until=at+600000;if(until>(e.onlineUntil||0)){e.onlineUntil=until;save();}});
 window.addEventListener('himiko-person-bubble',event=>{const e=entry(event.detail.id);e.preview=event.detail.text;e.previewRole='assistant';save();});
 window.addEventListener('himiko-person-reset',event=>{entry(event.detail.id).queue=[];entry(event.detail.id).unread=0;entry(event.detail.id).preview='';save();pendingStamp='';});
 function updateMemberPresence(){
  const panel=$('group-members');if(!panel||panel.hidden)return;
  panel.querySelectorAll('.member-card[data-id]').forEach(card=>{
   const ch=person(Number(card.dataset.id));if(!ch)return;
   const p=presence(ch);let badge=card.querySelector('.member-presence');
   if(!badge){badge=document.createElement('span');badge.className='online-badge member-presence';card.querySelector('.member-name-row')?.append(badge);}
   if(badge.textContent!==p.label){badge.textContent=p.label;badge.style.color=p.color;badge.style.background=p.color+'20';}
  });
 }
 const baseShowMembers=window.showGroupMembers;
 if(baseShowMembers)window.showGroupMembers=function(){baseShowMembers();updateMemberPresence()};
 setInterval(updateMemberPresence,5000);
 let stamp='';setInterval(()=>{deliver();if(currentChar)pending();else if(!$('list-view').classList.contains('hidden')){const next=allChars.map(ch=>ch.id+presence(ch).label+entry(ch.id).activity+entry(ch.id).unread+isTyping(ch.id)+entry(ch.id).preview+!!model.defaultOrder).join('|');if(next!==stamp){stamp=next;renderCards()}}},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){deliver();pending();renderCards()}});
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==='himiko-personal-order-reset')restoreOrder();
 });
 const style=document.createElement('style');style.textContent='#group-members .member-presence{display:inline-block;vertical-align:middle;margin-left:7px;white-space:nowrap;font-family:inherit;font-size:10px;line-height:1.4}#list-view #card-list .char-card .card-inner{gap:10px}#list-view #card-list .char-card .card-info{min-width:0}#list-view #card-list .char-card .card-name-row{padding-right:12px}.personal-preview{display:flex;align-items:center;gap:6px;min-height:22px}.personal-preview-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.personal-card-typing{position:relative;overflow:visible;display:inline-flex;flex:0 0 30px;height:20px;align-items:center;justify-content:center;gap:3px;border-radius:12px;background:#e4ded7;color:#816d5b}.personal-card-typing::before{content:"";position:absolute;left:2px;bottom:-3px;width:9px;height:8px;background:inherit;clip-path:polygon(0 0,100% 0,0 100%)}html[data-persona=cyber] .personal-card-typing{background:#24435c;color:#bcefff}.personal-card-typing[hidden]{display:none!important}.personal-card-typing i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:groupEntryDot 1.2s infinite}.personal-card-typing i:nth-child(2){animation-delay:.18s}.personal-card-typing i:nth-child(3){animation-delay:.36s}@media(prefers-reduced-motion:reduce){.personal-card-typing i{animation:none}}';document.head.append(style);
 openChatDB().then(db=>new Promise((resolve,reject)=>{const r=db.transaction(CHAT_DB_STORE,'readonly').objectStore(CHAT_DB_STORE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})).then(records=>{for(const r of records){const last=r.turns?.at(-1),at=last?.at;if(at&&person(r.id)){const e=entry(r.id);if(at>=(e.activity||0)){e.activity=at;e.preview=last.content;e.previewRole=last.role;}}}save();renderCards()}).catch(()=>{});
 renderCards();
})();




