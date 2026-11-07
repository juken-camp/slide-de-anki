/* 戦国の反省会 v2: shared timeline, LINE-style room, read-only. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const core=window.SengokuSchedule;
  const box=$('group-messages'),inner=$('group-messages-inner');
  const explanation=$('sengoku-explanation');
  const explanationText=$('sengoku-explanation-text');
  const preview=new URLSearchParams(location.search).get('sengokuPreview')==='1';
  const DAY_MS=core?.DAY_MS||86400000;
  const JST_MS=9*3600000;
  const periodBySender={
    oda_nobunaga:'戦国〜安土桃山時代・1534〜1582年',
    toyotomi_hideyoshi:'安土桃山時代・1537〜1598年',
    tokugawa_ieyasu:'江戸時代・1543〜1616年',
    akechi_mitsuhide:'戦国時代・生年不詳〜1582年',
    takeda_shingen:'戦国時代・1521〜1573年',
    uesugi_kenshin:'戦国時代・1530〜1578年'
  };
  let room=null,ordered=[],messageById=new Map(),settings={},checksum='';
  let currentKey='',drawnIds=[],rendered=[],drawnDay='',unreadIndex=-1,entryUnreadIndex=-1;
  let searchOpen=false,searchTerm='',selectedId=null,previousCycle=null;
  let serverOffsetMs=0,firstLoad=true,liveTypingId='',previewCount=0,previewTimer=null;
  let lastActiveKey='',lastUnreadBadge=-1,readingAnchorId=null;

  function close(){
    if(window.parent!==window){window.parent.postMessage({type:'sengoku-close'},location.origin)}
    else if(history.length>1)history.back();else location.href='index.html';
  }
  $('back').addEventListener('click',close);
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='sengoku-theme')document.documentElement.dataset.persona=event.data.persona==='cyber'?'cyber':'neko';
  });
  try{document.documentElement.dataset.persona=localStorage.getItem('nekopon-character-theme-v1')==='cyber'?'cyber':'neko'}catch(_){/* not critical */}

  function safeLocalImage(url){return typeof url==='string'&&/^history-icons\/[A-Za-z0-9_.-]+\.(webp|png|jpg|jpeg)$/.test(url)?url:null;}
  function imageInto(url,container){
    container.replaceChildren();const src=safeLocalImage(url);
    if(src){const img=document.createElement('img');img.alt='';img.src=src;img.onerror=()=>img.remove();container.append(img);}
  }
  function jstKey(ms){return new Date(ms+JST_MS).toISOString().slice(0,10);}
  function dateLabel(ms){
    const day=jstKey(ms),today=jstKey(Date.now()+serverOffsetMs);
    if(day===today)return '今日';
    if(day===jstKey(Date.now()+serverOffsetMs-DAY_MS))return '昨日';
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(ms));
  }
  function clock(ms){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);}
  function now(){return Date.now()+serverOffsetMs;}
  function mergeScript(script,config){
    if(!core?.parseMessages)throw Error('配信エンジンがありません');
    if(!script?.presentation||!Array.isArray(script.systemEvents)||!Array.isArray(script.timelineOrder))throw Error('台本第2稿ではありません');
    const messages=core.parseMessages(script);
    if(messages.length!==328||script.systemEvents.length!==8||script.timelineOrder.length!==336)throw Error('第2稿の件数が不一致です');
    const people=new Map(script.speakerCatalog.map(p=>[p.speakerId,p]));
    const byId=new Map(messages.map(m=>[m.id,{...m,kind:'message'}]));
    const episodes=new Set(script.episodes.map(e=>e.episodeId));
    for(const event of script.systemEvents){
      if(!event||byId.has(event.id)||!['join','leave','invite'].includes(event.event)||!people.has(event.subjectId)||!episodes.has(event.episodeId))throw Error('参加イベントが不正です');
      const day=/^Day ([1-3])$/.exec(event.day||''),sec=core.seconds(event.time);
      if(!day||sec===null)throw Error('イベント日時が不正です');
      byId.set(event.id,{...event,kind:'system',dayNumber:Number(day[1]),offsetMs:(Number(day[1])-1)*DAY_MS+sec*1000});
    }
    const seen=new Set(),entries=[];
    for(const pointer of script.timelineOrder){
      const value=byId.get(pointer?.id);
      if(!value||seen.has(pointer.id)||value.kind!==pointer.kind)throw Error('時系列の参照が不正です');
      seen.add(pointer.id);entries.push(value);
    }
    if(entries.length!==byId.size)throw Error('時系列の項目が不足しています');
    for(let i=1;i<entries.length;i++)if(entries[i].offsetMs<entries[i-1].offsetMs)throw Error('時系列が逆転しています');
    const initial=script.presentation.initialActiveSpeakerIds;
    if(!Array.isArray(initial)||!initial.length||initial.some(id=>!people.has(id)))throw Error('初期メンバーが不正です');
    if(config.startDate!==null&&core.startTime(config.startDate)===null)throw Error('開始日が不正です');
    const participants=script.speakerCatalog.map(p=>({
      id:p.speakerId,name:p.speakerName,role:p.speakerType,
      avatar:config.participants?.[p.speakerId]?.avatar||'',appCharacterId:config.participants?.[p.speakerId]?.appCharacterId??null
    }));
    return {script,config,people:new Map(participants.map(p=>[p.id,p])),participants,entries,messages,
      startDate:config.startDate,repeat:config.repeat!==false,title:script.title||'戦国の反省会',
      image:config.image||'',label:config.label||'期間限定',initial};
  }
  function phase(){
    if(!room)return null;
    const start=core.startTime(room.startDate);
    if(start===null)return {status:'unconfigured',cycle:0,start:null,visible:[],time:0};
    if(preview){const visible=ordered.slice(0,previewCount);return {status:'preview',cycle:0,start,visible,time:visible.at(-1)?.offsetMs??0};}
    const elapsed=now()-start;
    if(elapsed<0)return {status:'waiting',cycle:0,start,visible:[],time:elapsed};
    const duration=3*DAY_MS;
    if(!room.repeat&&elapsed>=duration)return {status:'finished',cycle:0,start,visible:ordered,time:duration};
    const cycle=room.repeat?Math.floor(elapsed/duration):0;
    const cycleStart=start+cycle*duration;
    const time=now()-cycleStart;
    return {status:'running',cycle,start:cycleStart,visible:ordered.filter(x=>x.offsetMs<=time),time};
  }
  function activeAt(offset){
    const ids=new Set(room?.initial||[]);
    for(const e of ordered){
      if(e.offsetMs>offset)break;
      if(e.kind!=='system')continue;
      if(e.event==='join')ids.add(e.subjectId);
      else if(e.event==='leave')ids.delete(e.subjectId);
    }
    return ids;
  }
  function updatePeople(state){
    if(!state)return;
    const ids=activeAt(state.time),names=[...ids].join('|');
    const key=state.cycle+'|'+names+'|'+room.title;
    if(key===lastActiveKey)return;
    lastActiveKey=key;
    const label=`${room.title} (${ids.size})`;
    $('group-title').textContent=label;
    $('sengoku-period-badge').textContent=room.label;
    document.querySelector('.members-title').textContent=label;
    const list=$('group-member-list');list.replaceChildren();
    for(const id of ids){
      const p=room.people.get(id);if(!p)continue;
      const row=document.createElement('div');row.className='sengoku-member';
      const avatar=document.createElement('span');avatar.className='bubble-avatar';imageInto(p.avatar,avatar);
      if(!avatar.childElementCount)avatar.textContent='👤';
      const text=document.createElement('span');text.textContent=p.name;
      row.append(avatar,text);list.append(row);
    }
    imageInto(room.image,$('group-header-avatar'));
    imageInto(room.image,document.querySelector('.group-members-avatar'));
    publishRoomTitle(label);
  }

  function storageKey(cycle){return 'sengoku-last-read-v2:'+room.startDate+':'+cycle;}
  function getReadIndex(state){
    if(preview||!state)return -1;
    let key='';try{key=localStorage.getItem(storageKey(state.cycle))||'';}catch(_){/* private mode */}
    if(!key)return -1;
    // Identify the exact message in this *cycle*, not a reused ID in a future cycle.
    return state.visible.findIndex(x=>x.id===key);
  }
  function setReadIndex(state,n){
    if(preview||!state||n<0||n<=unreadIndex||n>=state.visible.length)return;
    unreadIndex=n;
    try{localStorage.setItem(storageKey(state.cycle),state.visible[n].id);}catch(_){/* private mode */}
    updateUnread(state);
  }
  function parentDocument(){
    try{return window.parent!==window&&window.parent.location.origin===location.origin
      ?window.parent.document:null;}
    catch(_){return null;}
  }
  function parentEntry(){return parentDocument()?.querySelector('.sengoku-chat-entry')||null;}
  function isRoomVisible(){
    const panel=parentDocument()?.getElementById('sengoku-panel');
    return !panel||!panel.hidden;
  }
  function publishRoomTitle(title){
    const entry=parentEntry();if(!entry)return;
    const label=entry.querySelector('.sengoku-entry-title');
    if(label&&label.textContent!==title)label.textContent=title;
  }
  function publishUnread(count){
    count=Math.max(0,Number(count)||0);
    const entry=parentEntry();
    // Never create or display a red "0". Use the same no-badge behavior as Himiko.
    if(entry){
      let badge=entry.querySelector('.sengoku-unread-badge');
      if(count===0){badge?.remove();}
      else{
        if(!badge){
          badge=entry.ownerDocument.createElement('span');
          badge.className='sengoku-unread-badge';
          badge.style.cssText='display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:99px;background:#e6404b;color:#fff;font:800 11px sans-serif;margin-left:6px;';
          entry.querySelector('.sengoku-entry-name-row')?.append(badge);
        }
        badge.hidden=false;
        badge.style.display='inline-grid';
        badge.textContent=count>99?'99+':String(count);
      }
    }
    if(lastUnreadBadge===count)return;
    lastUnreadBadge=count;
    if(window.parent!==window){try{window.parent.postMessage({type:'sengoku-unread',count},location.origin);}catch(_){/* opaque local test origin */}}
  }
  function updateUnread(state){
    if(!state||preview)return;
    const next=Math.min(unreadIndex+1,state.visible.length);
    publishUnread(Math.max(0,state.visible.length-next));
    if(searchTerm)return;
    const existing=inner.querySelector('.sengoku-unread-divider');
    // This marks the messages unread on ENTRY. It does not jump forward or flicker
    // while the user reads, exactly like the original group's entry divider.
    const target=entryUnreadIndex>=0?inner.querySelector(`[data-timeline-index="${entryUnreadIndex}"]`):null;
    if(!target){existing?.remove();return;}
    if(existing&&existing.nextSibling===target)return;
    existing?.remove();
    const divider=document.createElement('div');
    divider.className='sengoku-unread-divider';divider.setAttribute('role','separator');
    divider.setAttribute('aria-label','ここから未読メッセージ');
    divider.textContent='ここから未読メッセージ';
    inner.insertBefore(divider,target);
  }
  function updateReadFromViewport(){
    if(document.hidden||!isRoomVisible()||preview||searchTerm||!room)return;
    const state=phase();if(!state||state.cycle!==previousCycle)return;
    const bounds=box.getBoundingClientRect();let max=unreadIndex;
    // Mark only rows actually visible at the bottom of the reader's viewport.
    for(const elem of inner.querySelectorAll('[data-timeline-index]')){
      const rect=elem.getBoundingClientRect();if(rect.top>=bounds.bottom-8)break;
      if(rect.bottom<=bounds.top+10)continue;
      max=Math.max(max,Number(elem.dataset.timelineIndex));
    }
    if(max>unreadIndex)setReadIndex(state,max);
  }
  function readCount(message,state){
    if(message.role!=='modern'||!Array.isArray(message.readPlan)||!state)return 0;
    const elapsed=(preview?state.time:now()-state.start)-message.offsetMs;
    let count=0;
    for(const step of message.readPlan){
      if(!Number.isFinite(step.afterSeconds)||!Number.isFinite(step.count)||elapsed<step.afterSeconds*1000)continue;
      const members=activeAt(message.offsetMs+step.afterSeconds*1000).size;
      count=Math.max(count,Math.min(Math.max(0,step.count),Math.max(0,members-1)));
    }
    return count;
  }
  function timeNode(m,state){
    const el=document.createElement('span');el.className='history-message-time sengoku-time';
    el.dataset.readMessageId=m.id;
    const count=readCount(m,state);
    el.textContent=(count?'既読 '+count+'\n':'')+clock(state.start+m.offsetMs);
    return el;
  }
  function selectExplanation(message){
    selectedId=message.id;
    explanationText.textContent=message.explanation; // no innerHTML, no heading
    explanation.scrollTop=0;
  }
  function messageRow(m,state){
    const modern=m.role==='modern';
    const row=document.createElement('div');row.className='bubble-row '+(modern?'user':'assistant');row.dataset.messageId=m.id;
    if(!modern){
      const icon=document.createElement('span');icon.className='bubble-avatar';
      imageInto(room.people.get(m.senderId)?.avatar,icon);
      if(!icon.childElementCount)icon.textContent='👤';row.append(icon);
    }
    const bubble=document.createElement('button');bubble.type='button';bubble.className='bubble sengoku-bubble '+(modern?'user':'assistant');
    bubble.textContent=m.text;bubble.setAttribute('aria-label',m.name+'の発言、タップして解説を表示');
    bubble.addEventListener('click',()=>selectExplanation(m));
    const at=timeNode(m,state);
    if(modern)row.append(bubble,at);
    else{
      const content=document.createElement('div');content.className='group-reply-content';
      const name=document.createElement('div');name.className='group-reply-name';
      const label=document.createElement('span');label.className='group-name-label';label.textContent=m.name;
      const period=periodBySender[m.senderId];if(period){
        const sub=document.createElement('span');sub.className='group-reply-period';sub.textContent=`（${period}）`;label.append(' ',sub);
      }
      name.append(label);content.append(name,bubble,at);row.append(content);
    }
    return row;
  }
  function systemRow(e,state){
    const row=document.createElement('div');row.className='group-system-event sengoku-system-event';
    const capsule=document.createElement('span');
    const time=document.createElement('time');time.textContent=clock(state.start+e.offsetMs);
    time.setAttribute('datetime',new Date(state.start+e.offsetMs).toISOString());
    const label=document.createElement('span');label.className='group-event-label';label.textContent=e.text;
    capsule.append(time,label);row.append(capsule);return row;
  }
  function addRow(e,state,index){
    const actual=state.start+e.offsetMs;
    const day=jstKey(actual);
    if(day!==drawnDay){
      const head=document.createElement('div');head.className='history-day sengoku-date';head.dataset.date=day;
      const label=document.createElement('span');label.textContent=dateLabel(actual);head.append(label);
      inner.append(head);drawnDay=day;
    }
    const node=e.kind==='system'?systemRow(e,state):messageRow(e,state);
    node.dataset.timelineIndex=String(index);node.dataset.timelineId=e.id;
    inner.append(node);drawnIds.push(e.id);rendered.push(e);
  }
  function showEmpty(state){
    const p=document.createElement('p');p.id='sengoku-empty';p.textContent=searchTerm?'該当する会話はありません':
      state.status==='unconfigured'?'配信開始日は設定されていません':
      state.status==='waiting'?'配信開始までお待ちください':
      state.status==='preview'?'再生ボタンで会話を確認できます':'新しい会話を待っています';
    inner.append(p);
  }
  function resetRows(){inner.replaceChildren();drawnIds=[];rendered=[];drawnDay='';liveTypingId='';}
  function updateTimes(state){
    for(const e of rendered){
      if(e.kind!=='message'||e.role!=='modern')continue;
      const time=inner.querySelector(`[data-read-message-id="${e.id}"]`);if(!time)continue;
      const count=readCount(e,state),txt=(count?'既読 '+count+'\n':'')+clock(state.start+e.offsetMs);
      if(time.textContent!==txt)time.textContent=txt;
    }
    for(const head of inner.querySelectorAll('.sengoku-date')){
      const ms=core.startTime(head.dataset.date);
      const val=ms===null?'':dateLabel(ms);
      const span=head.querySelector('span');
      if(val&&span&&span.textContent!==val)span.textContent=val;
    }
  }
  function updateTyping(state){
    const existing=$('sengoku-live-typing');
    if(!state||preview||searchTerm||!['running'].includes(state.status)){
      existing?.remove();liveTypingId='';return;
    }
    const first=ordered.find(e=>e.kind==='message'&&e.role==='historical'&&e.offsetMs>state.time);
    let target=null;
    if(first&&Number(first.typingLeadSeconds)>0&&first.offsetMs-state.time<=first.typingLeadSeconds*1000)target=first;
    if(!target){existing?.remove();liveTypingId='';return;}
    if(existing&&liveTypingId===target.id)return;
    existing?.remove();liveTypingId=target.id;
    const row=document.createElement('div');row.id='sengoku-live-typing';row.className='bubble-row assistant sengoku-live-typing';
    const icon=document.createElement('span');icon.className='bubble-avatar';imageInto(room.people.get(target.senderId)?.avatar,icon);
    if(!icon.childElementCount)icon.textContent='👤';
    const body=document.createElement('div');body.className='group-reply-content';
    const name=document.createElement('div');name.className='group-reply-name';name.textContent=target.name;
    const typing=document.createElement('div');typing.className='bubble typing sengoku-typing-dots';
    typing.setAttribute('aria-label',target.name+'が入力中');
    for(let i=0;i<3;i++){const dot=document.createElement('span');dot.className='sengoku-typing-dot';dot.textContent='●';dot.style.animationDelay=(i*.18)+'s';typing.append(dot);}
    body.append(name,typing);row.append(icon,body);inner.append(row);
  }
  function render(){
    const state=phase();if(!state)return;
    updatePeople(state);
    const view=searchTerm?state.visible.filter(e=>e.kind==='message'&&(e.text+' '+e.name+' '+e.explanation).toLocaleLowerCase().includes(searchTerm)):state.visible;
    const key=String(state.cycle)+'|'+state.status+'|'+searchTerm+'|'+state.start;
    const same=key===currentKey,append=same&&drawnIds.length<=view.length&&drawnIds.every((id,i)=>id===view[i].id);
    if(state.cycle!==previousCycle){
      previousCycle=state.cycle;
      unreadIndex=getReadIndex(state);
      entryUnreadIndex=state.visible.length>unreadIndex+1 ? unreadIndex+1 : -1;
      firstLoad=true;selectedId=null;explanationText.textContent='';
    }
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<115;
    const previousTop=box.scrollTop;
    let changed=false;
    if(!append){resetRows();currentKey=key;changed=true;}
    if(view.length)$('sengoku-empty')?.remove();
    if(view.length){
      for(let i=drawnIds.length;i<view.length;i++){
        const idx=state.visible.findIndex(x=>x.id===view[i].id);
        addRow(view[i],state,idx);changed=true;
      }
    }else if(!drawnIds.length&&!$('sengoku-empty')){showEmpty(state);}
    updateTimes(state);
    updateUnread(state);
    updateTyping(state);
    if(changed){
      requestAnimationFrame(()=>{
        if(firstLoad&&!preview&&!searchTerm&&state.visible.length&&unreadIndex<state.visible.length-1){
          const firstUnread=inner.querySelector(`[data-timeline-index="${entryUnreadIndex}"]`);
          if(firstUnread)box.scrollTop=Math.max(0,firstUnread.offsetTop-box.offsetTop-45);
          firstLoad=false;
        }else if(nearBottom&&!searchTerm){box.scrollTop=box.scrollHeight;firstLoad=false;}
        else{box.scrollTop=previousTop;firstLoad=false;}
        if(!preview)updateReadFromViewport();
      });
    }
  }
  // Same transient floating date used by Himiko's group: follows the scroll position.
  const floating=document.createElement('div');floating.className='history-floating';floating.setAttribute('aria-hidden','true');
  const floatingLabel=document.createElement('span');floating.append(floatingLabel);
  box.prepend(floating);
  let floatingTimer,scrollTouch=false,scrollUntil=0;
  box.addEventListener('pointerdown',()=>{scrollTouch=true;},{passive:true});
  for(const event of ['pointerup','pointercancel','pointerleave'])box.addEventListener(event,()=>{scrollTouch=false;scrollUntil=Date.now()+1400;},{passive:true});
  box.addEventListener('wheel',()=>{scrollUntil=Date.now()+1400;},{passive:true});
  box.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key))scrollUntil=Date.now()+1400;});
  box.addEventListener('scroll',()=>{
    if(!scrollTouch&&Date.now()>scrollUntil)return;
    scrollUntil=Date.now()+1400;
    const edge=box.getBoundingClientRect().top+3;
    const dates=[...inner.querySelectorAll('.history-day')];
    const active=dates.filter(d=>d.getBoundingClientRect().bottom<edge).at(-1);
    if(active){floatingLabel.textContent=active.textContent;floating.classList.add('is-visible');}
    else floating.classList.remove('is-visible');
    clearTimeout(floatingTimer);floatingTimer=setTimeout(()=>floating.classList.remove('is-visible'),1400);
  },{passive:true});

  // Mark visible rows as read without triggering an entire chat repaint or scroll jump.
  let scrollPending=false;
  box.addEventListener('scroll',()=>{
    if(scrollPending)return;scrollPending=true;
    requestAnimationFrame(()=>{scrollPending=false;updateReadFromViewport();});
  },{passive:true});

  $('group-members-direct').addEventListener('click',()=>{$('group-members').hidden=false;document.documentElement.dataset.membersOpen='true';});
  $('group-members-back').addEventListener('click',()=>{$('group-members').hidden=true;delete document.documentElement.dataset.membersOpen;});
  function search(open){
    searchOpen=open;$('group-search-form').hidden=!open;
    $('group-view').toggleAttribute('data-search-open',open);
    $('group-search-toggle').setAttribute('aria-expanded',String(open));
    if(open)$('group-search-input').focus();
    else{$('group-search-input').value='';searchTerm='';render();}
  }
  $('group-search-toggle').addEventListener('click',()=>search(!searchOpen));
  $('group-search-close').addEventListener('click',()=>search(false));
  $('group-search-clear').addEventListener('click',()=>{$('group-search-input').value='';searchTerm='';render();$('group-search-input').focus();});
  $('group-search-input').addEventListener('input',()=>{
    searchTerm=$('group-search-input').value.trim().toLocaleLowerCase();
    $('group-search-clear').hidden=!searchTerm;render();
  });
  $('group-search-form').addEventListener('submit',e=>{e.preventDefault();$('group-search-input').blur();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&searchOpen)search(false);});

  function previewStop(){if(previewTimer){clearInterval(previewTimer);previewTimer=null;}previewLabel();}
  function previewLabel(){if(!preview)return;
    $('sengoku-preview-progress').textContent=previewCount+' / '+ordered.length;
    $('sengoku-preview-play').textContent=previewTimer?'一時停止':'▶ 自動再生';
  }
  function previewSet(n){previewStop();previewCount=Math.max(0,Math.min(ordered.length,n));render();previewLabel();}
  function previewPlay(){
    if(previewTimer){previewStop();return;}
    if(previewCount>=ordered.length)previewCount=0;
    previewTimer=setInterval(()=>{previewCount=Math.min(ordered.length,previewCount+1);render();previewLabel();if(previewCount>=ordered.length)previewStop();},700);
    render();previewLabel();
  }
  if(preview){
    $('sengoku-preview-controls').hidden=false;
    $('sengoku-preview-play').addEventListener('click',previewPlay);
    $('sengoku-preview-next').addEventListener('click',()=>previewSet(previewCount+1));
    $('sengoku-preview-reset').addEventListener('click',()=>previewSet(0));
    $('sengoku-preview-all').addEventListener('click',()=>previewSet(ordered.length));
    for(let day=1;day<=3;day++)$('sengoku-preview-day'+day).addEventListener('click',()=>previewSet(ordered.filter(e=>e.dayNumber<=day).length));
    window.addEventListener('pagehide',previewStop);
  }
  $('sengoku-preview-all').textContent='全336件';

  async function load(){
    try{
      // IMPORTANT: root schedule.json is the latest v2. Keep sengoku-chat/schedule.json untouched (old v1 fallback).
      const [response,settingsResponse]=await Promise.all([
        fetch('schedule.json',{cache:'no-store'}),
        fetch('sengoku-chat/config.json',{cache:'no-store'})
      ]);
      if(!response.ok||!settingsResponse.ok)throw Error('配信データを取得できません');
      const fetchedAt=Date.now(),serverDate=response.headers.get('Date');
      const age=Math.max(0,Number(response.headers.get('Age'))||0);
      if(serverDate){const serverMs=Date.parse(serverDate);
        if(Number.isFinite(serverMs)&&Math.abs(serverMs+age*1000-fetchedAt)<3*DAY_MS)serverOffsetMs=serverMs+age*1000-fetchedAt;
      }
      const [data,config]=await Promise.all([response.json(),settingsResponse.json()]);
      const nextChecksum=JSON.stringify(data)+'|'+JSON.stringify(config);
      if(nextChecksum!==checksum){
        const next=mergeScript(data,config);
        room=next;settings=config;ordered=next.entries;
        messageById=new Map(next.messages.map(m=>[m.id,m]));checksum=nextChecksum;
        resetRows();currentKey='';lastActiveKey='';previousCycle=null;lastUnreadBadge=-1;
        if(preview){previewCount=Math.min(previewCount,ordered.length);previewLabel();}
        if(selectedId){const saved=messageById.get(selectedId);if(saved)selectExplanation(saved);}
      }
      render();
    }catch(error){
      console.error('Sengoku room v2:',error);
      if(!checksum){resetRows();const p=document.createElement('p');p.id='sengoku-empty';p.textContent='会話の読み込みに失敗しました';inner.append(p);}
    }
  }
  load();
  // The original Himiko screen keeps this iframe mounted when returning to its list.
  // Treat each reopen as a new reading session, rather than reusing an old unread divider.
  const hostPanel=parentDocument()?.getElementById('sengoku-panel');
  if(hostPanel&&typeof MutationObserver==='function'){
    new MutationObserver(()=>{
      if(hostPanel.hidden||!room)return;
      requestAnimationFrame(()=>{
        if(hostPanel.hidden)return;
        const state=phase();if(!state)return;
        unreadIndex=getReadIndex(state);
        entryUnreadIndex=state.visible.length>unreadIndex+1?unreadIndex+1:-1;
        firstLoad=true;currentKey='';render();
      });
    }).observe(hostPanel,{attributes:true,attributeFilter:['hidden']});
  }
  setInterval(()=>{if(!document.hidden)render();},1000);
  setInterval(()=>{if(!document.hidden)load();},300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();load();}});
  window.addEventListener('pagehide',()=>{const state=phase();if(state&&!preview)updateReadFromViewport();});

  // Small styles only for new features. The original room's CSS and bubble geometry remain unchanged.
  const extra=document.createElement('style');extra.textContent=`
    #sengoku-explanation{flex:0 0 calc(70px + env(safe-area-inset-bottom,0px))!important;height:calc(70px + env(safe-area-inset-bottom,0px))!important;max-height:none!important;padding:8px 12px calc(18px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box;overflow-y:auto;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch}
    #group-messages .sengoku-time {white-space:pre-line;line-height:1.45;text-align:center;min-width:31px}
    #group-messages .history-floating{position:sticky;top:3px;z-index:7;height:0;display:flex;justify-content:center;pointer-events:none;opacity:0;transition:opacity .2s ease}
    #group-messages .history-floating.is-visible{opacity:1}
    #group-messages .history-floating span{height:max-content;padding:3px 12px;border-radius:20px;font-size:11px;line-height:1.5;color:#fff;background:rgba(114,83,57,.7)}
    html[data-persona=cyber] #group-messages .history-floating span{background:rgba(77,111,137,.8);color:#eefaff}
    #group-messages .sengoku-date.history-day{display:flex;align-items:center;justify-content:center;min-height:26px;padding:8px 0;line-height:1.5;pointer-events:none}
    #group-messages .history-day span{padding:3px 12px;border-radius:20px;font-size:11px;font-weight:500;background:rgba(114,83,57,.25);opacity:.8}
    html[data-persona=cyber] #group-messages .history-day span{background:rgba(77,111,137,.28)}
    /* Exact structure used by original group for join / leave / invite */
    #group-messages .sengoku-system-event{clear:both;text-align:center;margin:16px 12px;color:var(--muted,#9bb7c9);font-size:11px;line-height:1.6}
    #group-messages .sengoku-system-event>span{display:inline-block;max-width:100%;padding:6px 12px;border-radius:14px;background:#8299b51c;overflow-wrap:anywhere}
    #group-messages .sengoku-system-event time{display:block;font-size:inherit;color:inherit;line-height:1.4}
    #group-messages .sengoku-system-event .group-event-label{display:block;line-height:1.5}
    #group-messages .sengoku-unread-divider{display:flex;align-items:center;gap:10px;margin:18px 0;padding:6px 0;color:#df596d;font-size:11px;font-weight:800;white-space:nowrap;animation:sengoku-unread-glow 2s ease-in-out infinite}
    #group-messages .sengoku-unread-divider::before,#group-messages .sengoku-unread-divider::after{content:'';height:1px;flex:1;background:currentColor;opacity:.4}
    @keyframes sengoku-unread-glow{0%,100%{opacity:.66}50%{opacity:1;text-shadow:0 0 7px #ef507e88}}
    @media(prefers-reduced-motion:reduce){#group-messages .sengoku-unread-divider{animation:none;opacity:1}}
    html[data-persona=cyber] #group-messages .sengoku-unread-divider{color:#ff768f}
    #group-messages .sengoku-live-typing {pointer-events:none;margin-top:6px}
    #group-messages .sengoku-typing-dots {display:inline-flex;align-items:center;gap:4px;min-width:55px;min-height:32px;padding:7px 15px;font-size:11px;line-height:1;color:inherit}
    .sengoku-typing-dot {display:inline-block;animation:sengoku-dot 1.12s infinite ease-in-out;opacity:.28;transform:translateY(0)}
    @keyframes sengoku-dot{0%,60%,100%{opacity:.28;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
    @media(prefers-reduced-motion:reduce){.sengoku-typing-dot{animation:none;opacity:.75}}
  `;document.head.append(extra);
})();

/* Exact original Himiko chat balloon vector outline; redraw only on size/theme changes. */
(()=>{
  const selector=':is(#chat-view,#group-view) .messages :is(.bubble,.typing,.suggestion-btn)';
  function shapePath(w,h){
    const x=6.5,right=w+5.5,top=.5,bottom=h-.5,r=Math.min((h-1)/2,23.5),tailR=23.5,tip=w+11;
    return `M${x+r} ${top} H${right-tailR} C${right-tailR*.72} ${top} ${right-tailR*.5} ${top+1} ${right-9} ${top+4} C${right-4} ${top+5} ${right+1} ${top+3} ${tip} ${top+.5} C${tip-.6} ${top+5} ${right+3} ${top+9} ${right-1} ${top+12} C${right} ${top+15} ${right} ${top+17} ${right} ${top+18} V${bottom-r} A${r} ${r} 0 0 1 ${right-r} ${bottom} H${x+r} A${r} ${r} 0 0 1 ${x} ${bottom-r} V${top+r} A${r} ${r} 0 0 1 ${x+r} ${top} Z`;
  }
  function paint(el){
    const w=el.offsetWidth,h=el.offsetHeight;if(w<10||h<24)return;
    const style=getComputedStyle(el),draft=el.classList.contains('suggestion-btn'),fill=draft?'none':(style.getPropertyValue('--chat-bubble-fill').trim()||'#fff7eb'),line=style.getPropertyValue('--chat-bubble-line').trim()||'#ead2b9';
    const left=el.classList.contains('assistant')||el.classList.contains('typing'),stamp=[w,h,fill,line,left].join('|');if(el.nekoShapeStamp===stamp)return;el.nekoShapeStamp=stamp;
    const transform=left?`transform="translate(${w+12} 0) scale(-1 1)"`:'';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w+12}" height="${h}" viewBox="0 0 ${w+12} ${h}"><path ${transform} d="${shapePath(w,h)}" fill="${fill}" stroke="${line}" stroke-width="1" stroke-linejoin="round"/></svg>`;
    el.style.setProperty('--chat-bubble-shape',`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  const observed=new Set(),resizer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>entries.forEach(e=>paint(e.target))):null;
  let pending=false;function scan(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;for(const el of observed){if(!el.isConnected){resizer?.unobserve(el);observed.delete(el);}}for(const el of document.querySelectorAll(selector)){paint(el);if(!observed.has(el)){observed.add(el);resizer?.observe(el);}}});}
  const app=document.body;if(app)new MutationObserver(scan).observe(app,{childList:true,subtree:true});
  new MutationObserver(scan).observe(document.documentElement,{attributes:true,attributeFilter:['data-persona']});
  window.addEventListener('resize',scan,{passive:true});scan();
})();
