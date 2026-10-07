import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFakePluginHost,makeThreadResponse,experimental_scanPublicSdkOnly} from '@get-bb/plugin-sdk/testing';
import plugin from './dist/server.js';
const flush=()=>new Promise(r=>setTimeout(r,20));
test('reviews use hidden unparented workers, personal workspace, and never send to main',async()=>{
 let sequence=7;
 const host=createFakePluginHost({pluginId:'you-should-know',sdk:{
  projects:{list:async()=>[{id:'personal',kind:'personal'}]},
  threads:{get:async({threadId})=>makeThreadResponse({id:threadId,projectId:'project'}),
   events:{list:async()=>[{seq:sequence,type:'item/completed',data:{item:{type:'agentMessage',text:`Tests passed; approval remains. Revision ${sequence}.`}}}]},
   spawn:async()=>makeThreadResponse({id:'review'}),wait:async()=>({matched:true}),output:async()=>({output:'The transcript has no artifact evidence for the test claim [seq 7].'}),
   stop:async()=>({ok:true}),archive:async()=>({ok:true}),
  }
 }});
 try{
  await plugin(host.bb);
  const input={threadId:'main',lease:'11111111-1111-4111-8111-111111111111'};
  await host.harness.behavior.callRpc('observe',input);await flush();
  const state=await host.harness.behavior.callRpc('observe',input);
  assert.equal(state.notes.length,1);
  const calls=host.harness.inspection.sdk.callsTo('threads.spawn');
  assert.equal(calls.length,1);
  const a=calls[0][0];
  assert.equal(a.visibility,'hidden');assert.equal(a.parentThreadId,undefined);
  assert.equal(a.lifecycleOwnerThreadId,'main');assert.equal(a.projectId,'personal');
  assert.deepEqual(a.environment,{type:'host',workspace:{type:'personal'}});
  assert.equal(a.model,'gpt-6-luna');
  assert.equal(host.harness.inspection.sdk.callsTo('threads.send').length,0);
  assert.equal(host.harness.inspection.sdk.callsTo('threads.stop').length,1);
  assert.equal(host.harness.inspection.sdk.callsTo('threads.archive').length,1);
  assert.equal(state.nextAt,null,'initial idle thread must not have a timer');
  sequence++;
  await host.harness.behavior.emitThreadEvent('thread.active',{thread:makeThreadResponse({id:'main',status:'active'})});
  await flush();
  assert.equal(host.harness.inspection.sdk.callsTo('threads.spawn').length,1,'activity starts a timer, not a review');
  const active=await host.harness.behavior.callRpc('observe',input);
  assert(active.nextAt>Date.now()+290000);
  await host.harness.behavior.emitThreadEvent('thread.idle',{thread:makeThreadResponse({id:'main',status:'idle'}),lastAssistantText:'Done'});
  await flush();
  const idle=await host.harness.behavior.callRpc('observe',input);
  assert.equal(host.harness.inspection.sdk.callsTo('threads.spawn').length,2,'idle must review without waiting five minutes');
  assert.equal(idle.through,8);assert.equal(idle.nextAt,null);
  await host.harness.behavior.emitThreadEvent('thread.idle',{thread:makeThreadResponse({id:'main',status:'idle'}),lastAssistantText:'Done'});
  await flush();assert.equal(host.harness.inspection.sdk.callsTo('threads.spawn').length,2);
  assert.equal(host.harness.inspection.sdk.callsTo('threads.send').length,0);
  await host.harness.behavior.callRpc('close',input);
 }finally{await host.harness.lifecycle.dispose();}
});
test('uses only public SDK interfaces',async()=>{
 const result=await experimental_scanPublicSdkOnly(process.cwd(),{allow:[/^react$/]});
 assert.deepEqual(result.violations,[]);assert.deepEqual(result.privateDependencies,[]);
});

test('first review stays silent when nothing is missing; empty conversations create no card or worker',async()=>{
 let empty=false,echo=false;
 const host=createFakePluginHost({pluginId:'you-should-know',sdk:{
  projects:{list:async()=>[{id:'personal',kind:'personal'}]},
  threads:{get:async({threadId})=>makeThreadResponse({id:threadId}),
   events:{list:async()=>empty?[]:[{seq:1,type:'item/completed',data:{item:{type:'agentMessage',text:'The tests passed. This is staging only; approval is still required before promotion.'}}}]},
   spawn:async()=>makeThreadResponse({id:'quiet-review'}),wait:async()=>({matched:true}),
   output:async()=>({output:echo?'The tests passed. This is staging only; approval is still required before promotion.':'NO_NEW_FINDINGS'}),stop:async()=>({ok:true}),archive:async()=>({ok:true})}
 }});
 try{
  await plugin(host.bb);
  const input={threadId:'covered-main',lease:'11111111-1111-4111-8111-111111111111'};
  await host.harness.behavior.callRpc('observe',input);await flush();
  const view=await host.harness.behavior.callRpc('observe',input);
  assert.deepEqual(view.notes,[]);assert(view.checkedAt);
  const prompt=host.harness.inspection.sdk.callsTo('threads.spawn')[0][0].prompt;
  assert.match(prompt,/main agent has not already communicated/);
  assert.doesNotMatch(prompt,/first review and nothing consequential is apparent, say so/);
  echo=true;
  const repeated={...input,threadId:'repeated-main'};
  await host.harness.behavior.callRpc('observe',repeated);await flush();
  const duplicate=await host.harness.behavior.callRpc('observe',repeated);
  assert.deepEqual(duplicate.notes,[],'literal echoes must be suppressed even if the reviewer disobeys');
  empty=true;
  const other={...input,threadId:'empty-main'};
  await host.harness.behavior.callRpc('observe',other);await flush();
  const blank=await host.harness.behavior.callRpc('observe',other);
  assert.deepEqual(blank.notes,[]);assert(blank.checkedAt);
  assert.equal(host.harness.inspection.sdk.callsTo('threads.spawn').length,2);
 }finally{await host.harness.lifecycle.dispose();}
});
