import { useEffect, useRef, useState } from 'react';
import { definePluginApp, Markdown, useRpc, type PluginThreadPanelProps } from '@get-bb/plugin-sdk/app';
import type { contract } from './server';
import type { View } from './manager';

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
    <p className="mb-4 text-muted-foreground">Watching this conversation while this panel is open. Checks when work goes idle, or every 5 minutes while active. Adds only consequential points the main agent hasn’t covered; otherwise stays silent.</p>
    <div role="status" className="mb-4 text-muted-foreground">
      {!view?'Connecting to the observer…':view.reviewing?'Reviewing with GPT-6-Sol…':view.checkedAt?`Last checked ${new Date(view.checkedAt).toLocaleTimeString()}`:'Waiting for the first review…'}
      {view?.nextAt&&!view.reviewing&&<div>Next check {new Date(view.nextAt).toLocaleTimeString()}</div>}
      {view?.checkedAt&&!view.reviewing&&view.nextAt===null&&<div>Waiting for the conversation to become active.</div>}
    </div>
    {(error||view?.error)&&<div role="alert" className="mb-4 rounded border border-border p-3 text-destructive">Review unavailable: {error||view?.error}. The next review will retry when work resumes or finishes.</div>}
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
