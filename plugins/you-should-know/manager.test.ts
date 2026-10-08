import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Monitor, INTERVAL, LEASE_TTL } from './manager.ts';
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(review?: any) {
  let now = 1000, version = 1, calls = 0;
  const m = new Monitor({
    now: () => now,
    snapshot: async () => ({ key: String(version), text: 'evidence', through: version, coverage: 'recent transcript' }),
    review: review ?? (async () => { calls++; return 'A consequential finding'; }),
    save: async () => {},
  });
  for (const id of ['main','a','b']) m.setSourceActive(id,true);
  return { m, advance: (n: number) => {now += n;}, change: () => version++, calls: () => calls };
}
test('open reviews without a prompt; two tabs share one reviewer; unchanged checks cost no inference', async () => {
  const f = fixture();
  f.m.open('main', 'a'); f.m.open('main', 'b'); await flush();
  assert.equal(f.calls(), 1); assert.equal(f.m.state('main').notes.length, 1);
  f.advance(INTERVAL); f.m.open('main','a'); await flush();
  assert.equal(f.calls(), 1);
  f.change(); f.advance(INTERVAL); f.m.open('main','a'); await flush();
  assert.equal(f.calls(), 2); assert.equal(f.m.state('main').notes.length, 1);
});
test('five minutes throttle changes; different source threads stay separate', async () => {
  const f=fixture(); f.m.open('a','one'); await flush(); f.change();
  f.advance(INTERVAL-1); f.m.open('a','one'); await flush(); assert.equal(f.calls(),1);
  f.m.open('b','two'); await flush(); assert.equal(f.calls(),2);
  f.advance(1); f.m.tick(); await flush(); assert.equal(f.calls(),3);
  assert.equal(f.m.state('b').through,2);
});
test('switching panels preserves the running review and reuses it on return',async()=>{
 let signal:AbortSignal;let finish:(s:string)=>void;let calls=0;
 const f=fixture(async(_id:any,_snap:any,_previous:any,s:AbortSignal)=>{calls++;signal=s;return new Promise<string>(r=>finish=r)});
 f.m.open('main','a');await flush();f.m.close('main','a');
 assert.equal(signal!.aborted,false,'a brief panel switch must not cancel inference');
 f.m.open('main','b');await flush();assert.equal(calls,1);
 finish!('A new consequential finding');await flush();
 assert.equal(f.m.state('main').notes.length,1);assert.equal(f.m.state('main').reviewing,false);assert.equal(calls,1);
});
test('hidden or disconnected panel lets one review finish but schedules no more',async()=>{
 let signal:AbortSignal;let finish:(s:string)=>void;let calls=0;
 const f=fixture(async(_a:any,_b:any,_c:any,s:AbortSignal)=>{calls++;signal=s;return new Promise<string>(r=>finish=r)});
 f.m.open('main','a');await flush();f.advance(LEASE_TTL+1);f.m.tick();
 assert.equal(signal!.aborted,false);assert.equal(f.m.state('main').active,false);
 finish!('Completed while away');await flush();f.change();f.advance(INTERVAL*2);f.m.tick();await flush();
 assert.equal(calls,1);assert.equal(f.m.state('main').notes[0].text,'Completed while away');assert.equal(f.m.state('main').nextAt,null);
});
test('plugin shutdown still cancels inference and discards a late result',async()=>{
 let signal:AbortSignal;let finish:(s:string)=>void;
 const f=fixture(async(_a:any,_b:any,_c:any,s:AbortSignal)=>{signal=s;return new Promise<string>(r=>finish=r)});
 f.m.open('main','a');await flush();f.m.dispose();assert.equal(signal!.aborted,true);
 finish!('Late');await flush();assert.equal(f.m.state('main').notes.length,0);
});
test('errors are visible and retry at cadence; dispose cancels work', async()=>{
  let fail=true;
  const f=fixture(async()=>{if(fail)throw Error('review unavailable');return 'Recovered';});
  f.m.open('main','a'); await flush(); assert.match(f.m.state('main').error!,/unavailable/);
  fail=false; f.advance(INTERVAL); f.m.open('main','a'); await flush();
  assert.equal(f.m.state('main').error,null); assert.equal(f.m.state('main').notes[0].text,'Recovered');
  f.m.dispose(); assert.equal(f.m.state('main').active,false);
});

test('idle checks immediately, remains quiet, then waits five minutes from the next activity', async()=>{
 const f=fixture();f.m.open('main','tab');await flush();f.change();
 f.advance(10_000);f.m.setSourceActive('main',false);await flush();
 assert.equal(f.calls(),2);assert.equal(f.m.state('main').nextAt,null);
 f.change();f.advance(INTERVAL*2);f.m.open('main','tab');await flush();
 assert.equal(f.calls(),2,'idle heartbeat must not start a review');
 f.m.setSourceActive('main',true);const deadline=f.m.state('main').nextAt;
 f.advance(20_000);f.m.setSourceActive('main',true);
 assert.equal(f.m.state('main').nextAt,deadline,'duplicate active event must not postpone review');
 f.advance(INTERVAL-20_001);f.m.open('main','tab');await flush();assert.equal(f.calls(),2);
 f.advance(1);f.m.tick();await flush();assert.equal(f.calls(),3);
});
test('going idle before five minutes reviews early and cancels the active deadline',async()=>{
 const f=fixture();f.m.open('main','tab');await flush();f.m.setSourceActive('main',false);await flush();
 f.m.setSourceActive('main',true);f.change();f.advance(2000);f.m.setSourceActive('main',false);await flush();
 assert.equal(f.calls(),2);assert.equal(f.m.state('main').nextAt,null);
 f.advance(INTERVAL);f.m.open('main','tab');await flush();assert.equal(f.calls(),2);
});
test('idle during a review queues a fresh snapshot without overlapping workers',async()=>{
 let finish:(s:string)=>void;let calls=0;
 const f=fixture(async()=>{calls++;return new Promise<string>(r=>finish=r)});
 f.m.open('main','tab');await flush();f.change();f.m.setSourceActive('main',false);await flush();assert.equal(calls,1);
 finish!('First');await flush();assert.equal(calls,2);
 finish!('Final');await flush();assert.equal(f.m.state('main').through,2);assert.equal(f.m.state('main').nextAt,null);
});
test('initial idle open reviews once; closed or expired observers ignore source transitions',async()=>{
 const f=fixture();f.m.setSourceActive('main',false);f.m.open('main','tab');await flush();assert.equal(f.calls(),1);
 f.m.close('main','tab');f.change();f.m.setSourceActive('main',true);f.m.setSourceActive('main',false);await flush();assert.equal(f.calls(),1);
 f.m.open('main','tab');await flush();assert.equal(f.calls(),2);
 f.change();f.advance(LEASE_TTL+1);f.m.setSourceActive('main',true);f.m.setSourceActive('main',false);await flush();assert.equal(f.calls(),2);
});
