/* Shared, deterministic three-day schedule. No AI/API, per-device conversations or storage. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SengokuSchedule=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY_MS=86400000, JST_MS=9*3600000;
  function startTime(startDate){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||''))return null;
    const [y,m,d]=startDate.split('-').map(Number);
    const utc=Date.UTC(y,m-1,d);
    const date=new Date(utc);
    if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
    return utc-JST_MS;
  }
  function seconds(time){
    const match=/^(\d{2}):(\d{2}):(\d{2})$/.exec(time||'');
    if(!match)return null;
    const [h,m,s]=match.slice(1).map(Number);
    if(h>23||m>59||s>59)return null;
    return h*3600+m*60+s;
  }
  function parseMessages(data){
    if(!data||!Array.isArray(data.messages))throw Error('台本のmessagesがありません');
    if(!Array.isArray(data.speakerCatalog)||!data.speakerCatalog.length)throw Error('台本の登場人物がありません');
    const catalog=new Map(data.speakerCatalog.map(p=>[p.speakerId,p]));
    const ids=new Set();
    const episodes=new Set((data.episodes||[]).map(e=>e.episodeId));
    const episodeCounts=new Map();
    const out=data.messages.map((message,index)=>{
      if(!message||typeof message.id!=='string'||ids.has(message.id))throw Error('発言IDが不正または重複しています: '+index);
      ids.add(message.id);
      const person=catalog.get(message.speakerId);
      if(!person||message.speakerName!==person.speakerName||message.speakerType!==person.speakerType)throw Error('人物IDと名前が一致しません: '+message.id);
      const day=/^Day ([1-3])$/.exec(message.day||'');
      const time=seconds(message.time);
      if(!day||time===null||message.timeZone!=='Asia/Tokyo')throw Error('日時が不正です: '+message.id);
      if(typeof message.text!=='string'||!message.text.trim()||typeof message.explanation!=='string'||!message.explanation.trim())throw Error('本文または解説がありません: '+message.id);
      if(!episodes.has(message.episodeId))throw Error('話数との対応がありません: '+message.id);
      episodeCounts.set(message.episodeId,(episodeCounts.get(message.episodeId)||0)+1);
      return {...message,role:person.speakerType==='modern'?'modern':'historical',name:person.speakerName,senderId:person.speakerId,dayNumber:Number(day[1]),offsetMs:(Number(day[1])-1)*DAY_MS+time*1000,index};
    });
    for(const e of data.episodes){if(e.messageCount!==episodeCounts.get(e.episodeId))throw Error('話数と発言数が一致しません: '+e.episodeId)}
    for(let i=1;i<out.length;i++)if(out[i].offsetMs<out[i-1].offsetMs)throw Error('発言順序が時刻順ではありません: '+out[i].id);
    return out;
  }
  function view(data,messages,now){
    const first=startTime(data.startDate);
    if(first===null)return {status:'unconfigured',cycle:0,visible:[],cycleStart:null};
    const duration=3*DAY_MS;
    const elapsed=now-first;
    if(elapsed<0)return {status:'waiting',cycle:0,visible:[],cycleStart:first};
    if(data.repeat===false&&elapsed>=duration)return {status:'finished',cycle:0,visible:messages,cycleStart:first};
    const cycle=data.repeat===false?0:Math.floor(elapsed/duration);
    const cycleStart=first+cycle*duration;
    const position=now-cycleStart;
    return {status:'running',cycle,visible:messages.filter(m=>m.offsetMs<=position),cycleStart};
  }
  return Object.freeze({DAY_MS,startTime,seconds,parseMessages,view});
});
