'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const core=require('../sengoku-chat/schedule-core.js');
const file=path.resolve(__dirname,'../sengoku-chat/schedule.json');
const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../sengoku-chat/config.json'),'utf8'));
const EXPECTED_MESSAGE_HASH='929555a61bd9a5aec65548e803fb8b8b53e223bd6b1e520578ba6d06cf7cc159';
const script=JSON.parse(fs.readFileSync(file,'utf8'));
const messages=core.parseMessages(script);
const jst=(str)=>Date.parse(str+'+09:00');
test('12 episodes and all 314 messages preserve source id, text, explanation, speaker and timestamp',()=>{
 assert.equal(script.episodes.length,12);assert.equal(messages.length,314);
 assert.equal(createHash('sha256').update(JSON.stringify(script.messages)).digest('hex'),EXPECTED_MESSAGE_HASH);
 assert.deepEqual([1,2,3].map(d=>messages.filter(m=>m.dayNumber===d).length),[97,95,122]);
});
test('all speakers have valid room mapping; modern right, historic left',()=>{
 assert.equal(Object.keys(config.participants).length,7);
 const people=new Map(script.speakerCatalog.map(p=>[p.speakerId,{name:p.speakerName,role:p.speakerType,...config.participants[p.speakerId]}]));
 assert.deepEqual([...new Set(messages.map(m=>m.senderId))].sort(),[...people.keys()].sort());
 for(const m of messages){const p=people.get(m.senderId);assert.equal(p.name,m.name);assert.equal(p.role,m.role);assert.equal(p.role==='modern',m.senderId==='modern_student');}
});
test('start date begins at Japanese midnight and rejects bad dates',()=>{
 assert.equal(core.startTime('2026-11-15'),jst('2026-11-15T00:00:00'));
 assert.equal(core.startTime('2026-02-29'),null);assert.equal(core.startTime('today'),null);
});
test('no public messages before start date, nobody starts personally on app open',()=>{
 const data={...script,...config,startDate:'2026-11-15'};
 assert.equal(core.view(data,messages,jst('2026-11-14T23:59:59')).visible.length,0);
 assert.equal(core.view(data,messages,jst('2026-11-15T07:34:59')).visible.length,0);
 assert.equal(core.view(data,messages,jst('2026-11-15T07:35:00')).visible.length,1);
 assert.equal(core.view(data,messages,jst('2026-11-15T23:59:59')).visible.length,97);
 assert.equal(core.view(data,messages,jst('2026-11-16T23:59:59')).visible.length,192);
 assert.equal(core.view(data,messages,jst('2026-11-17T23:59:59')).visible.length,314);
});
test('day 4 repeats from Day 1, not one timeline per device',()=>{
 const data={...script,...config,startDate:'2026-11-15',repeat:true};
 const second=core.view(data,messages,jst('2026-11-18T07:35:00'));
 assert.equal(second.status,'running');assert.equal(second.cycle,1);
 assert.equal(second.visible.length,1);assert.equal(second.visible[0].id,messages[0].id);
 assert.equal(core.view(data,messages,jst('2026-11-19T23:00:00')).visible.length,192);
});
test('repeat=false keeps the completed 314 messages',()=>{
 const data={...script,...config,startDate:'2026-11-15',repeat:false};
 const state=core.view(data,messages,jst('2026-11-23T10:00:00'));
 assert.equal(state.status,'finished');assert.equal(state.visible.length,314);
});
test('production start date is 2026-11-07 JST for every viewer',()=>{
 assert.equal(config.startDate,'2026-11-07');
 assert.equal(core.view({...script,...config},messages,jst('2026-11-07T07:35:00')).visible.length,1);
 assert.equal(core.view({...script,...config},messages,jst('2026-11-10T07:35:00')).visible.length,1);
});
test('tampered speaker/empty explanation/duplicate id errors do not silently mix messages',()=>{
 const copy=JSON.parse(JSON.stringify(script));copy.messages[0].speakerId='oda_nobunaga';assert.throws(()=>core.parseMessages(copy),/人物ID/);
 const copy2=JSON.parse(JSON.stringify(script));copy2.messages[2].explanation='';assert.throws(()=>core.parseMessages(copy2),/解説/);
 const copy3=JSON.parse(JSON.stringify(script));copy3.messages[1].id=copy3.messages[0].id;assert.throws(()=>core.parseMessages(copy3),/重複/);
});

test('Date-header clock sync references exported day length, never an undefined variable',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../sengoku-chat/room.js'),'utf8');
 assert.match(source,/3\*core\.DAY_MS/);
 assert.doesNotMatch(source,/3\*DAY_MS(?![A-Za-z])/);
});
