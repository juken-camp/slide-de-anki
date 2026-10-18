'use strict';
(() => {
const $ = id => document.getElementById(id);
const KEY = 'jc-image-quiz-v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const data = read();
data.records ||= {}; data.neko ||= {}; data.neko.daily ||= {};
const meta = [...window.QUIZ_CATALOG], loaded = new Map(), pending = new Map();
const saved = data.neko.resume || {};
const savedIds = Array.isArray(saved.lessonIds) ? saved.lessonIds : saved.lessonId ? [saved.lessonId] : [];
const cardKey = (lessonId, id) => `${lessonId}/${id}`;
const migrateKey = id => id && !id.includes('/') && saved.lessonId ? cardKey(saved.lessonId, id) : id;
const state = {
  subject: saved.subject === 'social' ? 'social' : 'science',
  lessonIds: [...new Set(savedIds)], lessonId: saved.lessonId || null,
  chapter: saved.chapter || 'all', mode: ['all','weak','known','unmarked'].includes(saved.mode) ? saved.mode : 'all',
  current: migrateKey(saved.current) || null, flipped: !!saved.flipped,
  order: Array.isArray(saved.order) ? saved.order.map(migrateKey) : [],
  answerMode: data.neko.answerMode === true, shuffle: !!saved.shuffle, finished: !!saved.finished, loading: false
};
const labels = { known: 'おぼえた', weak: 'おぼえてない', unmarked: 'まだ' };
const fields = {
  biology: ['生物','🌱'], chemistry: ['化学','🧪'], physics: ['物理','💡'], earth: ['地学','🌏'],
  integrated_science: ['総合','🔬'], geography: ['地理','🌏'], history: ['歴史','🏯'], civics: ['公民','⚖️']
};
let lesson = null, screen = 'home', request = 0, imageToken = 0, ready = false, undo = null;
let soundEnabled = data.neko.soundEnabled !== false, audio = null, lastTapSound = -1000;
let playing = false, timer = null, remaining = 0, lastTick = 0;
let catTaps=0, playfulParticles=0, lastPlaySound=-1000;
let noticeTimer, imageWaitTimer, suppressUntil = 0, navBusy = false;
const imageLoader = window.createNekoImageLoader();
let browse = 'grade', catalogFilter = 'all';
const selected = new Set(state.lessonIds);
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const dateKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function save() {
  data.neko.resume = { subject: state.subject, lessonIds: state.lessonIds, lessonId: state.lessonId,
    chapter: state.chapter, mode: state.mode, current: state.current, flipped: state.flipped,
    order: state.order, shuffle: state.shuffle, finished: state.finished };
  data.neko.sound = soundEnabled; data.neko.soundEnabled = soundEnabled; data.neko.answerMode = state.answerMode;
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { $('saveWarning').hidden = false; $('saveWarning').textContent = '記録を保存できないにゃ。ブラウザーの空き容量や保存設定を確認してにゃ。'; }
}
function toast(s) { $('notice').textContent = s; $('notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').classList.remove('show'), 2600); }
function unlockAudio() {
  if (!soundEnabled) return null;
  try {
    if (!audio || audio.state === 'closed') { const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return null; audio = new Context(); }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  } catch { return null; }
}
function beep(kind = 'tap') {
  if (!soundEnabled || document.hidden) return;
  const context = unlockAudio(); if (!context) return;
  const now = performance.now();
  if (kind === 'tap' && now-lastTapSound < 45) return;
  if (kind === 'tap') lastTapSound = now;
  const notes = {
    tap: [[620,420,0,.045,.027,'sine']],
    flip: [[500,760,0,.075,.03,'triangle']],
    move: [[430,550,0,.055,.025,'sine']],
    weak: [[440,390,0,.085,.028,'sine']],
    known: [[660,660,0,.095,.032,'triangle'],[880,880,.065,.1,.029,'triangle'],[1046,1046,.13,.14,.026,'sine']],
    cat: [[720,1080,0,.11,.03,'sine'],[1080,620,.1,.16,.028,'sine']],
    sparkle: [[1250,850,0,.17,.025,'sine']],
    shuffle: [[420,780,0,.055,.026,'triangle'],[600,980,.065,.075,.024,'triangle']],
    milestone: [[523,523,0,.11,.032,'sine'],[659,659,.085,.11,.03,'sine'],[784,784,.17,.11,.029,'sine'],[1046,1046,.255,.18,.027,'sine']]
  }[kind] || [[620,420,0,.045,.027,'sine']];
  try {
    for (const [start,end,delay,duration,volume,type] of notes) {
      const oscillator = context.createOscillator(), gain = context.createGain(), at = context.currentTime+delay;
      oscillator.type = type; oscillator.frequency.setValueAtTime(start,at); oscillator.frequency.exponentialRampToValueAtTime(end,at+duration);
      gain.gain.setValueAtTime(.0001,at); gain.gain.exponentialRampToValueAtTime(volume,at+.006); gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at+duration+.015);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch {}
}
function tapSpark(button,event) {
  if (reduced) return;
  const rect=button.getBoundingClientRect(), particle=document.createElement('span');
  particle.className='neko-tap-ring'; particle.setAttribute('aria-hidden','true');
  particle.style.left=(event.clientX || rect.left+rect.width/2)+'px'; particle.style.top=(event.clientY || rect.top+rect.height/2)+'px';
  $('app').append(particle); setTimeout(() => particle.remove(),420);
}
// Little toys from Nekopon: bouncy cats, springy titles and scattered paws.
// These reactions never change study records or the number of remembered questions.
function bounce(element,className='neko-bounce',duration=780) {
  if(reduced)return; element.classList.add('neko-has-played'); element.classList.remove(className); void element.offsetWidth; element.classList.add(className);
  setTimeout(()=>element.classList.remove(className),duration);
}
function burst(element,icons=['🐾','✦','✨'],count=5) {
  if(reduced||playfulParticles>=28)return;
  const r=element.getBoundingClientRect();
  for(let i=0;i<count&&playfulParticles<28;i++) {
    const particle=document.createElement('span'); particle.className='neko-fun-particle'; particle.textContent=icons[i%icons.length];particle.setAttribute('aria-hidden','true');
    particle.style.left=(r.left+r.width/2)+'px';particle.style.top=(r.top+r.height/2)+'px';
    particle.style.setProperty('--dx',(Math.random()*120-60)+'px');particle.style.setProperty('--dy',(-35-Math.random()*85)+'px');particle.style.setProperty('--spin',(Math.random()*200-100)+'deg');
    $('app').append(particle);playfulParticles++;setTimeout(()=>{particle.remove();playfulParticles--;},1000);
  }
}
function sayAt(element,text) {
  const r=element.getBoundingClientRect(),message=document.createElement('span');message.className='neko-fun-message';message.textContent=text;message.setAttribute('aria-hidden','true');
  message.style.left=Math.max(90,Math.min((window.innerWidth||900)-90,r.left+r.width/2))+'px';message.style.top=Math.max(24,r.top-8)+'px';
  $('app').append(message);setTimeout(()=>message.remove(),1350);
}
function playNeko(element,kind='cat') {
  const now=performance.now();if(now-lastPlaySound>120){beep(kind);lastPlaySound=now;}
  bounce(element,element===$('mascotPlay')?'neko-cat-bounce':'neko-bounce');burst(element);
}
function playWithCat() {
  catTaps++;const special=catTaps%5===0;playNeko($('mascotPlay'),special?'milestone':'cat');
  const messages=['にゃ〜ん♪','もふもふにゃ🐾','呼んだかにゃ？','いっしょに覚えるにゃ♪'];
  sayAt($('mascotPlay'),special?'もふもふチャージ完了にゃ🐾':messages[(catTaps-1)%messages.length]);
  if(special)burst($('mascotPlay'),['🐾','💛','✨','🌟'],9);
}
// Unlock sound inside a user gesture on iPhone as well as desktop browsers.
document.addEventListener('pointerdown',unlockAudio,{passive:true});
document.addEventListener('keydown',unlockAudio,{passive:true});
document.addEventListener('click',event => {
  const control=event.target.closest('button,summary,a');
  if (!control || control.disabled) return;
  if (!control.dataset.nekoStat && !['mascotPlay','homePlayCards','knownButton','weakButton','prevButton','nextButton'].includes(control.id)) beep('tap');
  tapSpark(control,event);
},true);

function status(c) { return data.records[c.lessonId]?.[c.originalId]?.status || 'unmarked'; }
function counts(cards) { return cards.reduce((r,c) => { const s = status(c); r[s] = (r[s] || 0)+1; return r; }, { known: 0, weak: 0, unmarked: 0 }); }
function knownFor(m) {
  const valid = loaded.has(m.id) ? new Set(loaded.get(m.id).cards.map(c => c.id)) : null;
  return Math.min(m.count, Object.entries(data.records[m.id] || {}).filter(([id,r]) => r.status === 'known' && (!valid || valid.has(id))).length);
}
function stats() {
  const known = meta.reduce((n,m) => n + knownFor(m), 0);
  $('soundToggle').checked = soundEnabled;
  $('dailyCount').textContent = (data.neko.daily[dateKey()] || []).length;
  $('knownCount').textContent = known; $('levelCount').textContent = 1 + Math.floor(known/10);
  $('resumeStudy').hidden = !state.lessonIds.some(id => meta.some(m => m.id === id)) || !state.current;
}
function showScreen(next) {
  if (screen !== next) { pause(); imageView.cancel(); } screen = next; $('app').dataset.screen = next;
  for (const name of ['home','catalog','study']) $(name+'Screen').hidden = name !== next;
  $('appHeader').hidden = next === 'home'; $('returnToStudy').hidden = !lesson;
  if (next === 'catalog') renderCatalog(); stats();
  window.scrollTo?.({ top: 0, behavior: 'instant' });
  if (next === 'catalog') $('catalogTitle').focus({ preventScroll: true });
  if (next === 'study') { if (lesson && !state.loading) render(); else warmImages(); } else imageLoader.pause();
}
function gradeKey(m) { return String(m.grade || '').match(/中\s*([123])/)?.[1] || 'other'; }
function usesGrades() { return state.subject !== 'social' && browse === 'grade'; }
function groupKey(m) { return usesGrades() ? gradeKey(m) : (m.field || 'other'); }
function groupLabel(key) { return usesGrades() ? (key === 'other' ? '学年共通' : `中${key}`) : (fields[key]?.[0] || 'その他'); }
function groupIcon(key) { return usesGrades() ? '📖' : (fields[key]?.[1] || '📚'); }
function catalogChoices() { return meta.filter(m => m.subject === state.subject); }
function visibleLessons() {
  const query = $('catalogSearch').value.trim().toLocaleLowerCase();
  return catalogChoices().filter(m => (catalogFilter === 'all' || groupKey(m) === catalogFilter) && (!query || `${m.title} ${m.grade} ${fields[m.field]?.[0] || ''}`.toLocaleLowerCase().includes(query)));
}
function toggleGroup(items) {
  const all = items.length && items.every(m => selected.has(m.id));
  for (const m of items) { if (all) selected.delete(m.id); else selected.add(m.id); }
  renderCatalog();
}
function selectionSummary() {
  const choices = meta.filter(m => selected.has(m.id));
  $('selectionSummary').textContent = choices.length ? `選択中 ${choices.length}教材 · ${choices.reduce((n,m) => n+m.count,0)}問` : '教材を選ぶにゃ';
  $('startStudy').disabled = !choices.length || state.loading; $('clearSelection').disabled = !choices.length;
  $('selectedLessons').replaceChildren();
  for (const m of choices) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'selected-lesson';
    b.textContent = `${m.title} ×`; b.setAttribute('aria-label', `${m.title}の選択を外す`);
    b.onclick = () => { selected.delete(m.id); renderCatalog(); }; $('selectedLessons').append(b);
  }
}
function renderCatalog() {
  const social = state.subject === 'social';
  $('browseSwitch').hidden = social;
  document.querySelectorAll('[data-subject]').forEach(b => { const on = b.dataset.subject === state.subject; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  document.querySelectorAll('[data-browse]').forEach(b => { const on = b.dataset.browse === browse; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  const all = catalogChoices(), keys = social ? ['geography','history','civics'] : [...new Set(all.map(groupKey))];
  if (usesGrades()) keys.sort((a,b) => (a === 'other' ? 9 : Number(a)) - (b === 'other' ? 9 : Number(b)));
  else keys.sort((a,b) => Object.keys(fields).indexOf(a) - Object.keys(fields).indexOf(b));
  if (!keys.includes(catalogFilter)) catalogFilter = social ? (keys.find(key => all.some(m => groupKey(m) === key)) || 'geography') : 'all';
  $('catalogFilters').replaceChildren();
  $('catalogFilters').setAttribute('aria-label',social ? '地理・歴史・公民の切り替え' : '目次の絞り込み');
  for (const key of social ? keys : ['all',...keys]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = key === 'all' ? 'すべて' : groupLabel(key);
    b.className = catalogFilter === key ? 'active' : ''; b.setAttribute('aria-pressed',String(catalogFilter === key));
    b.onclick = () => { catalogFilter = key; renderCatalog(); }; $('catalogFilters').append(b);
  }
  const visible = visibleLessons(); $('visibleCount').textContent = `${visible.length}教材`;
  $('selectVisible').hidden = !visible.length; $('selectVisible').textContent = visible.length && visible.every(m => selected.has(m.id)) ? '選択を外すにゃ' : 'まとめて選ぶにゃ';
  $('catalogGroups').replaceChildren();
  for (const key of keys) {
    const items = visible.filter(m => groupKey(m) === key); if (!items.length) continue;
    const section = document.createElement('section'); section.className = 'catalog-group';
    const heading = document.createElement('div'); heading.className = 'group-heading';
    const h = document.createElement('h3'); h.textContent = `${groupIcon(key)} ${groupLabel(key)}`;
    heading.append(h); section.append(heading);
    const list = document.createElement('div'); list.className = 'lesson-grid';
    for (const m of items) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'lesson-choice'; row.dataset.lesson = m.id;
      const on = selected.has(m.id); row.classList.toggle('selected',on); row.setAttribute('aria-pressed',String(on));
      const check = document.createElement('span'); check.className = 'choice-check'; check.textContent = on ? '✓' : ''; check.setAttribute('aria-hidden','true');
      const copy = document.createElement('span'); copy.className = 'choice-copy';
      const title = document.createElement('strong'); title.textContent = m.title;
      const sub = document.createElement('span'); sub.className = 'choice-meta'; sub.textContent = social ? `${m.count}問` : `${m.grade || '学年共通'} · ${fields[m.field]?.[0] || 'その他'} · ${m.count}問`;
      const progress = document.createElement('span'); progress.className = 'choice-progress';
      const progressLine = document.createElement('i'); const known = knownFor(m); progressLine.style.width = `${m.count ? known/m.count*100 : 0}%`; progress.append(progressLine);
      const record = document.createElement('span'); record.className = 'choice-record'; record.textContent = `おぼえた ${known} / ${m.count}問`;
      copy.append(title,sub,progress,record); row.append(check,copy);
      row.onclick = () => { if (selected.has(m.id)) selected.delete(m.id); else selected.add(m.id); renderCatalog(); };
      list.append(row);
    }
    section.append(list); $('catalogGroups').append(section);
  }
  $('catalogEmpty').hidden = !!visible.length;
  const preparing = social ? !all.some(m => groupKey(m) === catalogFilter) : !all.length;
  $('catalogEmptyTitle').textContent = preparing ? `${social ? groupLabel(catalogFilter) : '理科'}の教材は準備中にゃ` : 'その教材は見つからないにゃ';
  $('catalogEmptyText').textContent = preparing ? '「＋ 教材追加にゃ」から新しい教材を入れられるにゃ。' : 'さがし方を変えてみてにゃ。';
  selectionSummary(); $('returnToStudy').hidden = !lesson;
}
function sourceVideoURL(source) {
  try { const u = new URL(source), host = u.hostname.toLowerCase(); if (u.protocol !== 'https:') return null;
    const id = host === 'youtu.be' ? u.pathname.slice(1) : ['youtube.com','www.youtube.com','m.youtube.com'].includes(host) && u.pathname === '/watch' ? u.searchParams.get('v') : null;
    return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube.com/watch?v='+id : null;
  } catch { return null; }
}
function renderSource(c) {
  const raw = loaded.get(c.lessonId), baseURL = sourceVideoURL(raw?.source); $('sourceLinks').hidden = !baseURL; if (!baseURL) return;
  const face = state.flipped ? 'answer' : 'question'; $('correctionNote').hidden = !c.correctedFaces?.includes(face);
  const time = c.sourceTimes?.[face], valid = typeof time === 'number' && Number.isFinite(time) && time >= 0;
  const moment = $('sourceMoment'); $('sourceVideo').href = baseURL; moment.hidden = !valid; moment.removeAttribute('href');
  if (valid) { const sec = Math.floor(time), stamp = Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'); moment.href = baseURL+'&t='+sec+'s'; moment.textContent = `この場面 ${stamp} ↗`; moment.setAttribute('aria-label',`${state.flipped ? '解答' : '問題'}の場面をYouTubeで見る・${stamp}`); }
}
function base() { return lesson?.cards.filter(c => state.chapter === 'all' || (state.chapter.startsWith('lesson:') ? c.lessonId === state.chapter.slice(7) : c.chapterKey === state.chapter)) || []; }
function deck() {
  const rank = new Map(state.order.map((id,i) => [id,i]));
  return base().filter(c => state.mode === 'all' || status(c) === state.mode).sort((a,b) => (rank.get(a.id) ?? 99999) - (rank.get(b.id) ?? 99999));
}
function current() { return deck().find(c => c.id === state.current) || null; }
// Follow the actual filtered/shuffled deck, including answer-first mode and wraparound.
function imageWindow() {
  if (!lesson || state.loading || state.finished || screen !== 'study' || document.hidden) return [];
  const cards=deck(), at=cards.findIndex(c => c.id===state.current);
  if (at<0) return [];
  const connection=navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const ahead=connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '') ? 2 : 5;
  const urls=[], add=(c,answerFirst) => {
    for (const face of answerFirst ? ['answer','question'] : ['question','answer']) urls.push(window.NekoImageURL(c[face]));
  };
  add(cards[at],state.flipped);
  for (let n=1;n<=Math.min(ahead,cards.length-1);n++) add(cards[(at+n)%cards.length],state.answerMode);
  if (cards.length>1) add(cards[(at-1+cards.length)%cards.length],state.answerMode);
  return [...new Set(urls)];
}
function warmImages() {
  const urls=imageWindow(); if (urls.length) imageLoader.plan(urls); else imageLoader.pause();
}
function shuffle(ids) { for (let i = ids.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [ids[i],ids[j]] = [ids[j],ids[i]]; } return ids; }
function markSeen() {
  const c = current(); if (screen !== 'study' || !state.flipped || !ready || !c || document.hidden) return;
  const entries = data.neko.daily[dateKey()] ??= [];
  if (!entries.includes(c.id)) {
    entries.push(c.id); const days = Object.keys(data.neko.daily).sort(); for (const d of days.slice(0,-31)) delete data.neko.daily[d];
    if (entries.length%10 === 0) { toast(`🐾 今日は${entries.length}問見たにゃ！えらいにゃ♪`); beep('milestone'); burst($('dailyCount'),['🐾','🌟','✨'],8); }
    save(); stats();
  }
}
function scopeChoices() {
  if (!lesson) return [{id:'all',title:'すべて'}];
  if (state.lessonIds.length > 1) return [{id:'all',title:'選んだ教材すべて'}, ...state.lessonIds.map(id => ({id:'lesson:'+id,title:loaded.get(id)?.title || ''}))];
  const raw = loaded.get(state.lessonIds[0]);
  return [{id:'all',title:'すべて'},...(raw?.chapters || []).filter(c => c.id !== 'all').map(ch => ({id:cardKey(raw.id,ch.id),title:ch.title}))];
}
function renderControls() {
  document.querySelectorAll('[data-face-mode]').forEach(b => { const on = (b.dataset.faceMode === 'answer') === state.answerMode; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  document.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === state.mode; b.classList.toggle('active',on); b.setAttribute('aria-pressed',String(on)); });
  $('shuffleButton').classList.toggle('is-on',state.shuffle); $('shuffleButton').textContent = state.shuffle ? '🔀 まぜるにゃ' : '🔀 順番にゃ'; $('shuffleButton').setAttribute('aria-pressed',String(state.shuffle));
  $('chapterChips').replaceChildren();
  for (const c of scopeChoices()) {
    const b = document.createElement('button'); b.textContent = c.title; b.classList.toggle('active',state.chapter === c.id); b.setAttribute('aria-pressed',String(state.chapter === c.id)); b.onclick = () => changeRange({chapter:c.id}); $('chapterChips').append(b);
  }
  const cards = base(), ct = counts(cards), n = cards.length, p = n ? Math.round(ct.known/n*100) : 0;
  $('progressLabel').textContent = `おぼえた ${ct.known} / ${n}問`; $('percentLabel').textContent = p+'%'; $('progressBar').style.width = p+'%'; $('progressTrack').setAttribute('aria-valuenow',p);
  $('breakdown').textContent = `まだ ${ct.unmarked} · おぼえてない ${ct.weak} · おぼえた ${ct.known}`;
  const raw = loaded.get(current()?.lessonId); $('lessonGrade').textContent = raw?.subject === 'social' ? (fields[raw.field]?.[0] || '') : (raw?.grade || '');
  $('sessionSummary').textContent = state.lessonIds.length === 1 ? (loaded.get(state.lessonIds[0])?.title || '') : `${state.lessonIds.length}教材をまとめて学習`;
  $('undoButton').disabled = !undo; stats();
}
function showEmpty(title,text,{restart=false,review=false,all=false} = {}) {
  pause(); imageLoader.pause(); $('stage').hidden = true; $('emptyState').hidden = false; $('emptyTitle').textContent = title; $('emptyText').textContent = text;
  $('restartButton').hidden = !restart; $('reviewButton').hidden = !review; $('allButton').hidden = !all;
}
function render() {
  clearTimer(); clearTimeout(imageWaitTimer); imageWaitTimer=null; ready = false; const token = ++imageToken; $('sourceLinks').hidden = true;
  if (lesson && !state.finished) { const d = deck(); if (d.length && !d.some(c => c.id === state.current)) { state.current = d[0].id; state.flipped = state.answerMode; } }
  if (current()) state.lessonId = current().lessonId;
  renderControls(); $('loadingMessage').hidden = !state.loading; $('emptyState').hidden = true; $('stage').hidden = true;
  if (state.loading) { imageLoader.pause(); return; }
  if (!lesson) { showEmpty('目次から教材を選ぶにゃ','好きな教材をまとめて選べるにゃ♪'); return; }
  if (state.finished) { showEmpty('選んだ範囲を一周したにゃ🎉',`今日見た問題 ${(data.neko.daily[dateKey()] || []).length}問 · この範囲の「おぼえた」 ${counts(base()).known} / ${base().length}問`,{restart:true,review:counts(base()).weak>0,all:state.mode!=='all'}); save(); return; }
  const d = deck();
  if (!d.length) { showEmpty(state.mode === 'all' ? 'この範囲には問題がないにゃ' : 'この分類には問題がないにゃ','分類を変えると、ほかの問題も見られるにゃ。',{all:state.mode!=='all'}); save(); return; }
  const c = current(), raw = loaded.get(c.lessonId); renderSource(c); $('stage').hidden = false;
  $('card').classList.toggle('is-back',state.flipped); $('faceLabel').textContent = state.flipped ? '解答' : '問題';
  const chapter = raw.chapters?.find(ch => ch.id === c.chapter)?.title || raw.title;
  $('cardUnit').textContent = `${state.lessonIds.length>1 ? raw.title+' / ' : ''}${chapter} · ${c.originalId}`;
  $('cardStatus').textContent = labels[status(c)] || 'まだ'; $('cardPosition').textContent = `${d.findIndex(x => x.id === c.id)+1} / ${d.length}問${state.mode !== 'all' ? ' · '+labels[state.mode] : ''}`;
  const url=window.NekoImageURL(state.flipped ? c.answer : c.question), cached=imageLoader.peek(url);
  $('slideTap').className = cached ? 'slide-wrap' : 'slide-wrap loading';
  $('slideTap').setAttribute('aria-label',state.flipped ? 'タップして問題を見る' : 'タップして解答を見る');
  $('imageStatus').hidden=true; $('imageStatus').textContent='ちょっと待ってにゃ🐾';
  $('knownButton').disabled = $('weakButton').disabled = true;
  const img = $('slideImage'); img.onload=img.onerror=null;
  img.alt = `${raw.title} ${c.originalId} ${state.flipped ? '解答' : '問題'}`;
  let settled=false;
  const fail=()=> {
    if (token!==imageToken || settled) return; settled=true;
    clearTimeout(imageWaitTimer); imageLoader.forget(url); ready=false; pause();
    $('slideTap').className='slide-wrap error'; $('imageStatus').hidden=false;
    $('imageStatus').textContent='画像が開けなかったにゃ。もう一度タップしてにゃ。';
  };
  const finish=()=> {
    if (token!==imageToken || settled) return; settled=true;
    clearTimeout(imageWaitTimer); ready=true; $('slideTap').classList.remove('loading'); $('imageStatus').hidden=true;
    $('knownButton').disabled = $('weakButton').disabled = !state.flipped;
    imageView.refresh(); markSeen(); resetTimer();
  };
  const display=e=> {
    if (!e || token!==imageToken) return;
    img.onload=finish; img.onerror=fail; img.fetchPriority='high';
    if (img.src!==url) img.src=url;
    if (img.complete && img.naturalWidth>0) finish();
  };
  imageView.setCard(c.id); $('originalImage').href=url;
  // No loading-message flash for fast/cached transitions; keep a truthful fallback on slow links.
  if (!cached) imageWaitTimer=setTimeout(()=> {
    if (token===imageToken && !ready && !settled) $('imageStatus').hidden=false;
  },300);
  warmImages();
  if (cached) display(cached); else imageLoader.get(url).then(display).catch(fail);
  save(); updateTimerUI();
}
async function getLesson(m) {
  if (loaded.has(m.id)) return loaded.get(m.id);
  if (!pending.has(m.id)) pending.set(m.id,fetch(m.data).then(r => { if (!r.ok) throw Error('教材が開けなかったにゃ'); return r.json(); }).then(raw => { loaded.set(m.id,raw); pending.delete(m.id); return raw; }).catch(e => { pending.delete(m.id); throw e; }));
  return pending.get(m.id);
}
async function selectLessons(ids,{resume=false} = {}) {
  pause(); const seq = ++request; const choices = meta.filter(m => ids.includes(m.id));
  if (!choices.length) { toast('目次から教材を選ぶにゃ'); showScreen('catalog'); return; }
  lesson = null; state.lessonIds = choices.map(m => m.id); state.loading = true;
  selected.clear(); for (const id of state.lessonIds) selected.add(id);
  if (!resume) Object.assign(state,{chapter:'all',mode:'all',current:null,flipped:state.answerMode,order:[],finished:false});
  undo = null; showScreen('study'); render(); $('resumeNote').hidden = true;
  try {
    const raws = await Promise.all(choices.map(getLesson)); if (seq !== request) return;
    lesson = { cards: raws.flatMap(raw => raw.cards.map(c => ({...c, id:cardKey(raw.id,c.id), originalId:c.id, lessonId:raw.id, chapterKey:cardKey(raw.id,c.chapter)}))) };
    state.loading = false; const allIds = lesson.cards.map(c => c.id);
    if (!resume || !state.order.length) state.order = state.shuffle ? shuffle([...allIds]) : allIds;
    else { const valid = new Set(allIds); state.order = [...new Set([...state.order.filter(id => valid.has(id)), ...allIds])]; }
    if (resume && state.chapter !== 'all' && !state.chapter.includes('/') && !state.chapter.startsWith('lesson:')) state.chapter = cardKey(state.lessonIds[0],state.chapter);
    if (!scopeChoices().some(c => c.id === state.chapter)) state.chapter = 'all';
    render(); if (screen === 'catalog') renderCatalog(); $('resumeNote').hidden = !resume || !state.current;
  } catch (e) {
    if (seq !== request) return; state.loading = false; render();
    showEmpty('教材が開けなかったにゃ','通信を確認して、目次から選び直してにゃ。'); toast(e.message);
  }
}
function changeRange(patch) { pause(); Object.assign(state,patch,{finished:false,current:null,flipped:state.answerMode}); $('resumeNote').hidden = true; render(); }
function flip() {
  if (!current() || state.loading || state.finished || screen !== 'study' || navBusy) return;
  if ($('slideTap').classList.contains('error')) { render(); return; }
  if (!ready) return; state.flipped = !state.flipped; beep('flip'); render();
  if (!reduced && imageView.state.scale<=1.015 && $('slideImage').animate) $('slideImage').animate([{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});
}
function navigate(delta,{end=false} = {}) {
  if (!lesson || state.loading || state.finished) return;
  const d = deck(); if (!d.length) return; const i = d.findIndex(c => c.id === state.current);
  if (end && i === d.length-1) { state.finished = true; render(); return; }
  state.current = d[(i+delta+d.length)%d.length].id; state.flipped = state.answerMode; $('resumeNote').hidden = true; render();
}
function assess(nextStatus) {
  if (!ready || !state.flipped || !current() || state.finished || navBusy) return;
  const c = current(), d = deck(), i = d.findIndex(x => x.id === c.id), prev = data.records[c.lessonId]?.[c.originalId];
  undo = {lessonId:c.lessonId,cardId:c.originalId,current:c.id,previous:prev ? {...prev} : null,chapter:state.chapter,mode:state.mode};
  data.records[c.lessonId] ??= {}; data.records[c.lessonId][c.originalId] = {...prev,status:nextStatus,attempts:(prev?.attempts||0)+1,updated:new Date().toISOString()};
  beep(nextStatus === 'known' ? 'known' : 'weak'); const after = new Set(deck().map(c => c.id)), next = d.slice(i+1).find(x => after.has(x.id));
  state.flipped = state.answerMode; if (next) state.current = next.id; else state.finished = true;
  render(); if (nextStatus === 'known') celebrate(); else sayAt($('weakButton'),'もう一回いくにゃ🐾');
}
function celebrate() {
  burst($('knownButton'),['🐾','✦','✨'],4);
  const cheers=['おぼえたにゃ♪','ばっちりにゃ🐾','その調子にゃ🌟'];sayAt($('knownButton'),cheers[Math.floor(Math.random()*cheers.length)]);
  if (reduced) return;
  $('knownButton').classList.remove('celebrate'); requestAnimationFrame(() => $('knownButton').classList.add('celebrate')); setTimeout(() => $('knownButton').classList.remove('celebrate'),650); const node = document.createElement('span'); node.className = 'remembered-paw'; node.textContent = '🐾'; node.setAttribute('aria-hidden','true'); $('app').append(node); setTimeout(() => node.remove(),900);
}
function undoAssessment() {
  if (!undo) return; pause(); const u = undo; undo = null;
  if (u.previous) data.records[u.lessonId][u.cardId] = u.previous; else delete data.records[u.lessonId][u.cardId];
  Object.assign(state,{current:u.current,chapter:u.chapter,mode:u.mode,flipped:true,finished:false}); render(); toast('ひとつ前の仕分けに戻したにゃ🐾');
}
function seconds(face) { const v = Number(data.neko[face+'Seconds']); return Number.isFinite(v) && v>=.5 && v<=120 ? v : (face === 'question' ? 3 : 2); }
function clearTimer() { if (timer) clearInterval(timer); timer = null; }
function resetTimer() { clearTimer(); remaining = seconds(state.flipped ? 'answer' : 'question')*1000; lastTick = performance.now(); if (playing && ready && screen === 'study' && !document.hidden && !document.querySelector('dialog[open]')) timer = setInterval(tick,50); updateTimerUI(); }
function tick() { if (document.hidden || !ready || screen !== 'study' || document.querySelector('dialog[open]')) { pause(); return; } const now = performance.now(); remaining = Math.max(0,remaining-(now-lastTick)); lastTick = now; updateTimerUI(); if (remaining<=0) { clearTimer(); if (state.flipped) navigate(1,{end:true}); else flip(); } }
function pause() { playing = false; clearTimer(); updateTimerUI(); }
function updateTimerUI() {
  const auto = $('autoMode').checked; $('timerOptions').hidden = $('timerTrack').hidden = $('playButton').hidden = !auto;
  $('playButton').textContent = playing ? 'Ⅱ 止めるにゃ' : '▶ めくるにゃ'; $('playButton').disabled = !lesson || state.loading || state.finished || !deck().length;
  $('timerLabel').textContent = !auto ? '' : playing ? (ready ? `${state.flipped ? '解答' : '問題'} ${(remaining/1000).toFixed(1)}秒` : '') : '停止中にゃ';
  const total = seconds(state.flipped ? 'answer' : 'question')*1000; $('timerBar').style.width = (auto ? Math.max(0,Math.min(100,remaining/total*100)) : 0)+'%';
}
function register(raw) {
  if (!['science','social'].includes(raw.subject) || !raw.cards?.length) throw Error('理科または社会の教材を選択してください。');
  const item = {...raw,count:raw.cards.length}, index = meta.findIndex(m => m.id === raw.id); if (index>=0) meta[index] = item; else meta.push(item);
  loaded.set(raw.id,raw); stats(); if (screen === 'catalog') renderCatalog();
}
window.NekoApp = {
  register, finishImports: async () => { stats(); if (screen === 'catalog') renderCatalog(); },
  selectImported: async id => { state.subject = meta.find(m => m.id === id).subject; await selectLessons([id]); }, pause, toast,
  get state() { return {...state,lessonIds:[...state.lessonIds],order:[...state.order]}; }, get current() { return current(); }, get records() { return data.records; }
};
const imageView = window.createNekoImageView({
  frame: $('slideTap'), image: $('slideImage'), resetButton: $('resetImageView'),
  isReady: () => screen === 'study' && ready && !navBusy && !state.finished,
  onTap: flip, onNavigate: animateNav, onPause: pause, onSnap: snapCard,
  suppressClicks: () => { suppressUntil = performance.now()+500; },
  onDrag: dx => { const el=$('card'); el.style.transition='none'; el.style.transform=`translateX(${dx}px) rotate(${Math.max(-7,Math.min(7,dx*.025))}deg)`; el.style.opacity=String(Math.max(.55,1-Math.abs(dx)/700)); }
});
for (const b of document.querySelectorAll('[data-face-mode]')) b.onclick = () => {
  pause(); state.answerMode = b.dataset.faceMode === 'answer'; state.flipped = state.answerMode;
  if (lesson) render(); else save();
};
$('mascotPlay').onclick=playWithCat;
$('homeTitle').onclick=()=>{playNeko($('homeTitle'),'milestone');sayAt($('homeTitle'),'Nekoponだにゃ〜♪');};
$('homePlayCards').onclick=()=>{playNeko($('homePlayCards'),'shuffle');bounce($('homePlayCards'),'neko-card-shuffle');sayAt($('homePlayCards'),'めくめくにゃ♪');};
for(const id of ['homeTitle','homePlayCards'])$(id).onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$(id).click();}};
for(const button of document.querySelectorAll('[data-neko-stat]'))button.onclick=()=>{
  const kind=button.dataset.nekoStat;playNeko(button,kind==='daily'?'sparkle':kind==='known'?'known':'milestone');
  const message=kind==='daily'?`今日は${$('dailyCount').textContent}問見たにゃ🐾`:kind==='known'?`${$('knownCount').textContent}問おぼえたにゃ！すごいにゃ♪`:`Lv.${$('levelCount').textContent}にゃ！10問おぼえるとレベルアップにゃ🏅`;
  toast(message);
};
// Screen navigation and the textbook-style table of contents.
$('chooseLessons').onclick = () => showScreen('catalog'); $('brandHome').onclick = () => {showScreen('home');playNeko($('mascotPlay'),'cat');sayAt($('mascotPlay'),'おかえりにゃ🐾');};
$('resumeStudy').onclick = () => lesson ? showScreen('study') : selectLessons(state.lessonIds,{resume:true});
$('openCatalog').onclick = () => showScreen('catalog'); $('returnToStudy').onclick = () => showScreen('study');
$('startStudy').onclick = () => selectLessons(meta.filter(m => selected.has(m.id)).map(m => m.id));
$('clearSelection').onclick = () => { selected.clear(); renderCatalog(); };
$('selectVisible').onclick = () => toggleGroup(visibleLessons()); $('catalogSearch').oninput = renderCatalog;
for (const b of document.querySelectorAll('[data-subject]')) b.onclick = () => { state.subject = b.dataset.subject; catalogFilter = 'all'; $('catalogSearch').value = ''; renderCatalog(); };
for (const b of document.querySelectorAll('[data-browse]')) b.onclick = () => { browse = b.dataset.browse; catalogFilter = 'all'; renderCatalog(); };
$('slideTap').onclick = () => { if (performance.now()<suppressUntil || navBusy) return; flip(); };
$('slideTap').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
for (const id of ['sourceVideo','sourceMoment','originalImage']) $(id).addEventListener('click',() => { pause(); save(); });
$('prevButton').onclick = () => { if (!navBusy) animateNav(-1); }; $('nextButton').onclick = () => { if (!navBusy) animateNav(1); };
$('knownButton').onclick = () => assess('known'); $('weakButton').onclick = () => assess('weak'); $('undoButton').onclick = undoAssessment;
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => changeRange({mode:b.dataset.mode});
$('shuffleButton').onclick = () => { state.shuffle = !state.shuffle; state.order = state.shuffle ? shuffle(lesson?.cards.map(c => c.id) || []) : lesson?.cards.map(c => c.id) || []; changeRange({}); };
$('restartButton').onclick = () => changeRange({}); $('reviewButton').onclick = () => changeRange({mode:'weak'}); $('allButton').onclick = () => changeRange({mode:'all'});
$('soundToggle').onchange = () => { soundEnabled = $('soundToggle').checked; save(); if (soundEnabled) beep('tap'); };
$('autoMode').checked = !!data.neko.auto; $('autoMode').onchange = () => { pause(); data.neko.auto = $('autoMode').checked; save(); resetTimer(); };
for (const face of ['question','answer']) { $(face+'Seconds').value = seconds(face); $(face+'Seconds').onchange = e => { pause(); const n = Number(e.target.value); data.neko[face+'Seconds'] = Number.isFinite(n) ? Math.round(Math.min(120,Math.max(.5,n))*10)/10 : (face==='question'?3:2); e.target.value = data.neko[face+'Seconds']; save(); resetTimer(); }; }
$('playButton').onclick = () => { if (playing) pause(); else { playing = true; resetTimer(); } };
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => $(b.dataset.close).close();
document.addEventListener('visibilitychange',() => { if (document.hidden) { pause(); imageLoader.pause(); } else { stats(); if (screen==='study' && lesson) render(); } }); window.addEventListener('pagehide',save);
document.addEventListener('keydown',e => {
  if (screen !== 'study' || navBusy || document.querySelector('dialog[open]') || ['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(e.target.tagName) || e.target === $('slideTap') || e.repeat) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); animateNav(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); animateNav(-1); } else if (e.code === 'Space') { e.preventDefault(); flip(); }
});
// Follow the finger, lock the direction, and preserve vertical page scrolling.
function snapCard() { const el = $('card'); el.style.transition = reduced ? 'none' : 'transform .24s ease, opacity .24s ease'; el.style.transform = ''; el.style.opacity = ''; }
function animateNav(direction) {
  if (!lesson || state.loading || state.finished || navBusy || deck().length < 2) { snapCard(); return; }
  beep('move'); pause(); navBusy = true; const el = $('card');
  if (reduced) { navigate(direction); snapCard(); navBusy = false; return; }
  const distance = Math.min(180, el.offsetWidth*.45 || 140);
  el.style.transition = 'transform .14s ease-in, opacity .14s ease-in'; el.style.transform = `translateX(${-direction*distance}px) rotate(${-direction*4}deg)`; el.style.opacity = '0';
  setTimeout(() => {
    navigate(direction); el.style.transition = 'none'; el.style.transform = `translateX(${direction*36}px)`; el.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { snapCard(); navBusy = false; }));
  },140);
}
$('backupButton').onclick = () => {
  const blob = new Blob([JSON.stringify({format:'nekopon-progress-v1',records:data.records,neko:data.neko},null,2)],{type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'nekopon-progress-'+dateKey()+'.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('restoreButton').onclick = () => { pause(); $('restoreInput').click(); };
$('restoreInput').onchange = async e => {
  try {
    const f = e.target.files[0]; if (!f) return; if (f.size>5e6) throw Error('記録ファイルが大きすぎます。'); const backup = JSON.parse(await f.text());
    if (backup.format !== 'nekopon-progress-v1' || !backup.records || typeof backup.records !== 'object') throw Error('Nekoponの学習記録ファイルを選んでください。');
    for (const [id,records] of Object.entries(backup.records)) {
      if (!meta.some(m => m.id === id) || !records || typeof records !== 'object') continue; data.records[id] ??= {};
      for (const [cid,r] of Object.entries(records)) {
        if (!r || !['known','weak','unmarked'].includes(r.status) || !/^[\w-]{1,100}$/.test(cid)) continue;
        const old = data.records[id][cid]; if (!old || Date.parse(r.updated)>Date.parse(old.updated||0)) data.records[id][cid] = {status:r.status,attempts:Math.max(0,Number(r.attempts)||0),updated:r.updated};
      }
    }
    undo = null; if (lesson) render(); save(); stats(); if (screen === 'catalog') renderCatalog(); toast('学習記録を読み込んだにゃ🐾');
  } catch (err) { toast(err.message || '読み込めなかったにゃ'); } finally { e.target.value = ''; }
};
showScreen('home');
})();


