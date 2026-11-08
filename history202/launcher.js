/* JUKEN CAMP / history202 integration. Attach this script ONCE to himiko.html. */
(() => {
'use strict';
if (window.__history202LauncherInstalled) return;
window.__history202LauncherInstalled=true;
const style=document.createElement('style');style.textContent=`
#list-view .h202-entry{margin:10px 0 0;cursor:pointer;animation:none}
#list-view .h202-entry .card-inner{gap:10px}
#list-view .h202-entry .h202-card-avatar{display:grid;place-items:center;flex:none;width:50px;height:50px;border:1.5px dashed #d1a985;background:rgba(182,127,71,.06);border-radius:15px;font-size:26px}
#list-view .h202-entry .card-info{flex:1;min-width:0}
#list-view .h202-entry .h202-card-name{font-size:16px;font-weight:900;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1e293b}
#list-view .h202-entry .h202-card-caption{font-size:12px;font-weight:700;line-height:1.6;margin-top:4px;color:#a07960}
#list-view .h202-entry:focus-visible{outline:2px solid #bc8d59;outline-offset:3px}
html[data-persona=cyber] #list-view .h202-entry .h202-card-avatar{background:rgba(30,112,150,.08);border-color:#446e89}
html[data-persona=cyber] #list-view .h202-entry .h202-card-name{color:#e0eaff}
html[data-persona=cyber] #list-view .h202-entry .h202-card-caption{color:#92c7e5}
#history202-panel{position:fixed;inset:0;z-index:9550;display:flex;flex-direction:column;background:#fffcf7;overflow:hidden}
#history202-panel[hidden]{display:none!important}
html[data-persona=cyber] #history202-panel{background:#080d20}
#history202-frame{border:0;display:block;width:100%;height:100%;flex:1;min-height:0}
@media(max-width:390px){#list-view .h202-entry .h202-card-name{font-size:14px}#list-view .h202-entry .h202-card-caption{font-size:11px}}
`;document.head.append(style);
const list=document.getElementById('list-view');const sengokuEntry=list?.querySelector('.sengoku-chat-entry');
if(!list){console.error('history202: list-view is not available');return;}
const card=document.createElement('div');card.className='h202-entry char-card';card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-label','歴史の暗記202グルチャを開く');
card.innerHTML='<div class="card-inner"><span class="h202-card-avatar" aria-hidden="true"></span><div class="card-info"><div class="h202-card-name">歴史の暗記202グルチャ</div><div class="h202-card-caption">31の物語で、歴史の重要事項202を覚えよう！</div></div></div>';
if(sengokuEntry)sengokuEntry.insertAdjacentElement('afterend',card);
else list.querySelector('.shared-chat-join-entry')?.insertAdjacentElement('beforebegin',card) || list.prepend(card);
const panel=document.createElement('section');panel.id='history202-panel';panel.hidden=true;panel.setAttribute('aria-label','歴史の暗記202グルチャ');
const frame=document.createElement('iframe');frame.id='history202-frame';frame.title='歴史の暗記202グルチャ';frame.loading='lazy';panel.append(frame);document.body.append(panel);
let lastScroll=0;
const theme=()=>document.documentElement.dataset.persona==='cyber'?'cyber':'neko';
const notify=open=>{if(window.parent!==window)window.parent.postMessage({type:'himiko-chat-state',open},location.origin)};
const sendTheme=()=>{try{frame.contentWindow?.postMessage({type:'history202-theme',persona:theme()},location.origin)}catch(_){}};
function open(){if(!panel.hidden)return;lastScroll=window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0;document.documentElement.dataset.history202Open='true';document.documentElement.dataset.chatOpen='true';list.classList.add('hidden');panel.hidden=false;if(!frame.getAttribute('src'))frame.setAttribute('src','history202-chat.html?v=cyber-labels-20261108-v6');sendTheme();notify(true)}
function close(){if(panel.hidden)return;panel.hidden=true;delete document.documentElement.dataset.history202Open;delete document.documentElement.dataset.chatOpen;list.classList.remove('hidden');requestAnimationFrame(()=>{window.scrollTo(0,lastScroll);document.body.scrollTop=lastScroll;document.documentElement.scrollTop=lastScroll});notify(false)}
card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
frame.addEventListener('load',sendTheme);
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data)return;if(e.source===frame.contentWindow&&e.data.type==='history202-close')close();if(e.data.type==='himiko-return-top'&&!panel.hidden)close();if(e.data.type==='nekopon-persona')sendTheme()});
new MutationObserver(()=>{if(!panel.hidden)sendTheme()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-persona']});
})();
