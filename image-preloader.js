'use strict';
// Small, in-memory image window. This never reads or writes study records.
window.createNekoImageLoader = function ({maxReady = 16, concurrency = 2} = {}) {
  const entries = new Map();
  let order = [], wanted = new Set(), paused = true, clock = 0;
  const loading = () => [...entries.values()].filter(e => e.state === 'loading').length;

  function trim() {
    const ready = [...entries.values()].filter(e => e.state === 'ready');
    const removable = ready.filter(e => !wanted.has(e.url)).sort((a,b) => a.used-b.used);
    while (ready.length > maxReady && removable.length) {
      const e = removable.shift(); entries.delete(e.url); ready.splice(ready.indexOf(e),1);
    }
    for (const e of entries.values()) if (e.state === 'error' && !wanted.has(e.url)) entries.delete(e.url);
  }
  function entry(url) {
    let e = entries.get(url);
    if (!e) {
      e = {url,state:'queued',image:null,used:++clock};
      e.promise = new Promise((resolve,reject) => { e.resolve=resolve; e.reject=reject; });
      // Background failures must never become unhandled rejections.
      e.promise.catch(() => {}); entries.set(url,e);
    }
    e.used=++clock; return e;
  }
  function cancel(e) {
    if (!['queued','loading'].includes(e.state)) return;
    e.state='cancelled';
    if (e.image) { e.image.onload=e.image.onerror=null; e.image.removeAttribute('src'); }
    entries.delete(e.url); e.resolve(null);
  }
  function start(e,urgent) {
    e.state='loading'; e.urgent=urgent;
    const img = e.image = new Image();
    img.decoding='async'; img.fetchPriority=urgent ? 'high' : 'low';
    const finish = ok => {
      if (e.state !== 'loading') return;
      img.onload=img.onerror=null;
      if (ok) { e.state='ready'; e.used=++clock; e.resolve(e); }
      else { e.state='error'; e.image=null; e.reject(new Error('Image could not be loaded')); }
      trim(); pump();
    };
    img.onerror=()=>finish(false);
    img.onload=()=> {
      if (!img.naturalWidth) { finish(false); return; }
      if (typeof img.decode === 'function') {
        try { Promise.resolve(img.decode()).then(()=>finish(true),()=>finish(img.complete && img.naturalWidth>0)); }
        catch { finish(img.complete && img.naturalWidth>0); }
      } else finish(true);
    };
    img.src=e.url;
  }
  function pump() {
    if (paused || !order.length) return;
    const current=entries.get(order[0]);
    // The visible image always goes first, even if two older preloads are busy.
    if (current?.state === 'queued') start(current,true);
    if (current?.state === 'loading') {
      current.urgent=true; if (current.image) current.image.fetchPriority='high'; return;
    }
    for (const url of order.slice(1)) {
      if (loading() >= concurrency) break;
      const e=entries.get(url); if (e?.state === 'queued') start(e,false);
    }
  }
  return {
    plan(urls) {
      order=[...new Set(urls.filter(u => typeof u === 'string' && u))];
      wanted=new Set(order); paused=!order.length;
      for (const e of [...entries.values()]) if (!wanted.has(e.url)) cancel(e);
      for (const e of entries.values()) e.urgent=e.url===order[0];
      // A failed visible image can be retried by the existing tap-to-retry action.
      if (entries.get(order[0])?.state === 'error') entries.delete(order[0]);
      for (const url of order) entry(url);
      trim(); pump();
    },
    get(url) { const e=entries.get(url); return e ? e.promise : Promise.resolve(null); },
    peek(url) { const e=entries.get(url); if (e?.state === 'ready') { e.used=++clock; return e; } return null; },
    forget(url) { const e=entries.get(url); if (e) { cancel(e); entries.delete(url); } },
    pause() {
      paused=true; order=[]; wanted=new Set();
      for (const e of [...entries.values()]) if (!e.urgent) cancel(e);
      trim();
    }
  };
};
