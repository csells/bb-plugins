import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { Monitor, activityMessages, type View, type Activity } from './manager';
import { reviewPrompt, excerpt } from './instructions';

// Suppress literal echoes independently of the model's novelty judgment.
function repeatsAssistant(output:string,transcript:string){
  const normalize=(text:string)=>text.replace(/\[seq[^\]]*\]/gi,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const candidate=normalize(output);
  return !!candidate && transcript.split(/\n\n(?=\[seq \d+\] )/).some(entry=>{
    const match=entry.match(/^\[seq \d+\] Assistant: ([\s\S]*)$/);
    return match ? normalize(match[1]).includes(candidate) : false;
  });
}
const input=z.object({threadId:z.string().min(1),lease:z.string().uuid()}).strict();
const note=z.object({at:z.number(),through:z.number(),text:z.string()});
const view=z.object({active:z.boolean(),reviewing:z.boolean(),checkedAt:z.number().nullable(),outcome:z.enum(['findings','no-new-findings','unchanged']).nullable().default(null),activity:z.array(z.object({id:z.number(),at:z.number(),kind:z.enum(Object.keys(activityMessages) as [Activity['kind'],...Activity['kind'][]])})).max(20).default([]),nextAt:z.number().nullable(),through:z.number(),coverage:z.string(),error:z.string().nullable(),notes:z.array(note)});
export const contract=defineRpcContract({
  observe:{input,output:view},
  close:{input,output:z.object({ok:z.boolean()})},
});

export default async function plugin(bb:BbPluginApi){
  const initialized=new Map<string,Promise<void>>();
  const workers=new Set<string>();
  const lifecycleRevision=new Map<string,number>();
  // Recover only workers created by this plugin after a server crash/reload.
  async function cleanup(threadId:string){
    await bb.sdk.threads.stop({threadId});
    await bb.sdk.threads.archive({threadId});
    await bb.storage.kv.delete(`worker:${threadId}`);
    workers.delete(threadId);
  }
  const monitor=new Monitor({
    now:Date.now,
    async snapshot(threadId,signal){
      const [events,firstRequests,lastRequests]=await Promise.all([
        bb.sdk.threads.events.list({threadId,order:'desc',limit:'100',types:['item/completed','client/turn/requested','system/error'],signal}),
        bb.sdk.threads.events.list({threadId,order:'asc',limit:'100',types:['client/turn/requested'],signal}),
        bb.sdk.threads.events.list({threadId,order:'desc',limit:'100',types:['client/turn/requested'],signal}),
      ]);
      // Reserve user context independently: tool-heavy work must not evict the goal.
      const requests=[...firstRequests.filter(e=>e.type==='client/turn/requested'&&e.data.initiator==='user').slice(0,2),
        ...lastRequests.filter(e=>e.type==='client/turn/requested'&&e.data.initiator==='user').slice(0,8)];
      const unique=[...new Map(requests.map(e=>[e.seq,e])).values()].sort((a,b)=>a.seq-b.seq);
      const context=unique.flatMap(e=>e.type==='client/turn/requested'
        ?[`[seq ${e.seq}] User: ${excerpt(e.data.input.flatMap(b=>b.type==='text'?[b.text]:[]).join('\n'),1800)}`]:[]);
      const lines:string[]=[];
      let size=0,tools=0,limited=events.length===100;
      for(const e of events){
        let text='';
        if(e.type==='client/turn/requested')text=`Request from ${e.data.initiator}: `+e.data.input.flatMap(b=>b.type==='text'?[b.text]:[]).join('\n');
        if(e.type==='item/completed'){
          const item=e.data.item;
          if(item.type==='agentMessage')text='Assistant: '+item.text;
          if(item.type==='commandExecution'&&tools++<12){
            // Never forward known credential-reading commands or their output.
            const sensitive=/(?:auth\.json|credentials|printenv|security\s+find-|(?:^|[;&|])\s*env(?:\s|$))/i.test(item.command);
            text=sensitive?'Command evidence omitted: credential-sensitive operation.'
              :`Command: ${excerpt(item.command,500)}\nResult: status=${item.status}; exit=${item.exitCode??'unknown'}\n${excerpt(item.aggregatedOutput??'',1800)}`;
          }
        }
        if(e.type==='system/error')text='System error occurred (details not included).';
        if(!text)continue;
        if(text.length>6000)limited=true;
        text=excerpt(text,6000);
        if(size+text.length>32000){limited=true;break;}
        lines.push(`[seq ${e.seq}] ${text}`);size+=text.length;
      }
      const recent=lines.reverse().join('\n\n');
      const text=context.length||recent?`USER GOALS AND CONSTRAINTS (selected early and recent requests; latest takes precedence)\n${context.join('\n\n')}\n\nRECENT ACTIVITY\n\n${recent}`:'';
      return {text,key:createHash('sha256').update(text).digest('hex'),through:Math.max(events[0]?.seq??0,...unique.map(e=>e.seq)),coverage:`${context.length} user requests retained separately; ${lines.length} recent messages/tool excerpts${limited?' · limited window; older context omitted':''}. Credential patterns redacted. No artifact inspection.`};
    },
    async review(threadId,snapshot,previous,signal){
      if(!snapshot.text)return null;
      const personal=(await bb.sdk.projects.list({includePersonal:true})).find(p=>p.kind==='personal');
      if(!personal)throw Error('BB personal workspace project is unavailable');
      signal.throwIfAborted();
      const worker=await bb.sdk.threads.spawn({
        projectId:personal.id,providerId:'codex',model:'gpt-6-sol',reasoningLevel:'medium',permissionMode:'auto',
        title:'You should know review',visibility:'hidden',lifecycleOwnerThreadId:threadId,
        environment:{type:'host',workspace:{type:'personal'}},
        prompt:reviewPrompt(snapshot,previous),
      });
      workers.add(worker.id);
      try{
        await bb.storage.kv.set(`worker:${worker.id}`,true);
        signal.throwIfAborted();
        await bb.sdk.threads.wait({threadId:worker.id,status:'idle',timeoutMs:120000,signal});
        const {output}=await bb.sdk.threads.output({threadId:worker.id,signal});
        if(!output?.trim())throw Error('Reviewer finished without an assessment');
        return output.trim()==='NO_NEW_FINDINGS'||repeatsAssistant(output,snapshot.text)?null:output.trim().slice(0,5000);
      } finally {await cleanup(worker.id);}
    },
    save:(id,state)=>bb.storage.kv.set(`view:${id}`,state),
  });
  async function initialize(id:string){
    let pending=initialized.get(id);
    if(!pending){pending=(async()=>{
      const revision=lifecycleRevision.get(id)??0;
      const source=await bb.sdk.threads.get({threadId:id});
      if(source.originPluginId===bb.pluginId)throw Error('Choose the main conversation to observe');
      const saved=await bb.storage.kv.get<unknown>(`view:${id}`);
      if(saved!==undefined)monitor.restore(id,view.extend({key:z.string()}).parse(saved) as View & {key:string});
      // A lifecycle event during either await is newer than the initial DTO.
      if((lifecycleRevision.get(id)??0)===revision)monitor.setSourceActive(id,source.status==='active');
    })();initialized.set(id,pending);pending.catch(()=>initialized.delete(id));}
    await pending;
  }
  function sourceChanged(id:string,active:boolean){
    if(!initialized.has(id))return;
    lifecycleRevision.set(id,(lifecycleRevision.get(id)??0)+1);
    monitor.setSourceActive(id,active);
  }
  bb.events.on('thread.active',({thread})=>sourceChanged(thread.id,true));
  bb.events.on('thread.idle',({thread})=>sourceChanged(thread.id,false));
  bb.events.on('thread.failed',({thread})=>sourceChanged(thread.id,false));
  bb.rpc.register(contract,{
    async observe({threadId,lease}){await initialize(threadId);return monitor.open(threadId,lease);},
    async close({threadId,lease}){monitor.close(threadId,lease);return {ok:true};},
  });
  bb.background.service('visible-panel-observer',{async start(signal){
    for(const key of await bb.storage.kv.list('worker:'))await cleanup(key.slice(7));
    while(!signal.aborted){monitor.tick();try{await delay(1000,undefined,{signal});}catch(e){if(!signal.aborted)throw e;}}
  }});
  bb.onDispose(async()=>{monitor.dispose();await Promise.all([...workers].map(cleanup));});
}
