import { useEffect, useRef, useState } from 'react';
import { definePluginApp, Markdown, useRpc, type PluginThreadPanelProps } from '@get-bb/plugin-sdk/app';
import type { contract } from './server';
import { activityMessages, type View } from './manager';

function Observer({threadId}:PluginThreadPanelProps){
  const rpc=useRpc<typeof contract>();
  const [view,setView]=useState<View|null>(null);
  const [error,setError]=useState<string|null>(null);
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const lease=crypto.randomUUID();let gone=false;let busy=false;let visible=false;
    setView(null);setError(null);
    const close=()=>{void rpc.call('close',{threadId,lease}).catch(()=>{/* Server lease expires if disconnected. */});};
    async function observe(){
      if(gone||!visible||document.hidden||busy)return;
      busy=true;
      try{const next=await rpc.call('observe',{threadId,lease});if(!gone&&visible&&!document.hidden){setView(next);setError(null);}else close();}
      catch(e){if(!gone)setError(e instanceof Error?e.message:String(e));}
      finally{busy=false;}
    }
    const visibility=()=>{if(document.hidden||!visible)close();else void observe();};
    const intersection=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting&&e.intersectionRect.width>0&&e.intersectionRect.height>0);
      visibility();
    });
    if(panelRef.current)intersection.observe(panelRef.current);
    const interval=setInterval(()=>void observe(),5000);
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',close);
    return()=>{gone=true;intersection.disconnect();clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);close();};
  },[threadId,rpc]);
  return <section ref={panelRef} className="h-full overflow-y-auto p-4 text-sm" aria-label="You should know perspective">
    <p className="mb-1 font-medium">A second set of eyes</p>
    <p className="mb-4 text-muted-foreground">Watching this conversation while this panel is open. Checks when work goes idle, or every 5 minutes while active. Adds only consequential points the main agent hasn’t covered; shows “No new findings” with the check time when there’s nothing to add.</p>
    <div role="status" className="mb-4 text-muted-foreground">
      {!view?'Connecting to the observer…':view.error?'Check failed':view.reviewing?(activityMessages[view.activity.at(-1)?.kind??'reading']):view.checkedAt?`${view.outcome==='no-new-findings'?'No new findings · checked at':view.outcome==='unchanged'?'Conversation unchanged · checked at':view.outcome==='findings'?'New findings · checked at':'Last checked'} ${new Date(view.checkedAt).toLocaleTimeString()}`:'Waiting for the first review…'}
      {view?.nextAt&&!view.reviewing&&<div>Next check {new Date(view.nextAt).toLocaleTimeString()}</div>}
      {view?.checkedAt&&!view.reviewing&&!view.error&&view.nextAt===null&&<div>Waiting for more activity.</div>}
    </div>
    {(error||view?.error)&&<div role="alert" className="mb-4 rounded border border-border p-3 text-destructive">Review unavailable: {error||view?.error}. The next review will retry when work resumes or finishes.</div>}
    {!!view?.activity.length&&<section aria-label="Observer activity" className="mb-4 text-xs text-muted-foreground">
      <p className="mb-2 font-medium">Observer activity</p>
      <ol className="space-y-1">
        {view.activity.slice(-8).map(event=><li key={event.id} className="flex gap-2">
          <time className="shrink-0" dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString()}</time>
          <span>{activityMessages[event.kind]}</span>
        </li>)}
      </ol>
    </section>}
    <div aria-live="polite" className="space-y-4">
      {view?.notes.slice().reverse().map(n=><article key={`${n.at}-${n.through}`} className="rounded-lg border border-border p-3">
        <p className="mb-2 text-xs text-muted-foreground">{new Date(n.at).toLocaleTimeString()} · through event {n.through}</p>
        <Markdown content={n.text}/>
      </article>)}
    </div>
    {view?.coverage&&<p className="mt-4 text-xs text-muted-foreground">{view.coverage}</p>}
  </section>;
}
export default definePluginApp(app=>{
  app.slots.threadPanelAction({id:'you-should-know',title:'You should know',icon:'Eye',component:Observer,layout:'flush'});
});
