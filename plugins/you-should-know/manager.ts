export const INTERVAL = 5 * 60_000;
export const LEASE_TTL = 90_000;
export type Snapshot = {key: string; text: string; through: number; coverage: string};
export type Note = {at: number; through: number; text: string};
export const activityMessages = {
  opened: 'Panel opened. Checking the conversation.',
  resumed: 'Panel reopened. Continuing the current check.',
  active: 'Conversation active. Watching for idle or the next 5-minute check.',
  idle: 'Conversation went idle. Checking now.',
  'idle-queued': 'Conversation went idle. Another check is queued after this review.',
  interval: '5 minutes of activity elapsed. Checking now.',
  reading: 'Reading recent conversation activity…',
  reviewing: 'Reviewing with GPT-6-Sol…',
  findings: 'New findings added.',
  'no-new-findings': 'No new findings.',
  unchanged: 'Conversation unchanged. No new review needed.',
  failed: 'Check failed. See the error for details.',
  paused: 'Panel hidden or disconnected. New checks paused.',
} as const;
export type Activity = {id: number; at: number; kind: keyof typeof activityMessages};
export type View = {active: boolean; reviewing: boolean; checkedAt: number|null; outcome: 'findings'|'no-new-findings'|'unchanged'|null; activity: Activity[]; nextAt: number|null; through: number; coverage: string; error: string|null; notes: Note[]};
type RecordState = View & {key: string; sourceActive: boolean; nextReason: 'opened'|'idle'|'interval'|null; leases: Map<string,number>; job?: AbortController};
type Adapter = {
  now(): number;
  snapshot(id: string, signal: AbortSignal): Promise<Snapshot>;
  review(id: string, snapshot: Snapshot, previous: Note[], signal: AbortSignal): Promise<string|null>;
  save(id: string, state: View & {key: string}): Promise<void>;
};
export class Monitor {
  private records = new Map<string,RecordState>();
  private adapter: Adapter;
  private disposed = false;
  constructor(adapter: Adapter) {this.adapter=adapter;}
  private record(id:string) {
    let r=this.records.get(id);
    if(!r){r={active:false,reviewing:false,checkedAt:null,outcome:null,activity:[],nextAt:null,through:0,coverage:'',error:null,notes:[],key:'',sourceActive:false,nextReason:null,leases:new Map()};this.records.set(id,r);}
    return r;
  }
  restore(id:string, saved: View & {key:string}) {
    Object.assign(this.record(id),saved,{active:false,reviewing:false,nextAt:null,error:null});
  }
  state(id:string): View {
    const {leases,job,key,sourceActive,nextReason,...view}=this.record(id);
    return structuredClone(view);
  }
  open(id:string,lease:string) {
    if(this.disposed) throw Error('Observer is stopped');
    const r=this.record(id); r.leases.set(lease,this.adapter.now()+LEASE_TTL);
    if(!r.active){r.active=true;r.nextAt=0;r.nextReason='opened';this.event(r,r.job?'resumed':'opened');}
    this.tick(); return this.state(id);
  }
  setSourceActive(id:string, active:boolean) {
    if(this.disposed)return;
    const r=this.record(id);
    if(r.sourceActive===active)return;
    r.sourceActive=active;
    if(r.active){
      this.event(r,active?'active':r.job?'idle-queued':'idle');
      if(!active)r.nextReason='idle';
      else if(r.nextAt===null)r.nextReason='interval';
      // Keep an already-due idle review if a new turn starts before it can run.
      r.nextAt=active ? Math.min(r.nextAt??Infinity,this.adapter.now()+INTERVAL) : this.adapter.now();
      this.tick();
    }
  }
  close(id:string,lease:string) {
    const r=this.record(id);r.leases.delete(lease);
    if(!r.leases.size)this.stop(r);
  }
  private event(r:RecordState,kind:Activity['kind']){
    r.activity=[...r.activity,{id:(r.activity.at(-1)?.id??0)+1,at:this.adapter.now(),kind}].slice(-20);
  }
  private stop(r:RecordState){
    // Losing visibility pauses scheduling, not the bounded review already paid for.
    // A returning panel reconnects to that job instead of repeatedly restarting it.
    if(r.active)this.event(r,'paused');
    r.active=false;r.nextAt=null;r.nextReason=null;
  }
  tick(){
    if(this.disposed)return;
    const now=this.adapter.now();
    for(const [id,r] of this.records){
      for(const [lease,expiry] of r.leases)if(expiry<=now)r.leases.delete(lease);
      if(!r.leases.size){this.stop(r);continue;}
      if(!r.job && r.nextAt!==null && r.nextAt<=now)void this.check(id,r);
    }
  }
  private async check(id:string,r:RecordState){
    const job=new AbortController();r.job=job;r.reviewing=true;r.error=null;
    if(r.nextReason==='interval')this.event(r,'interval');
    this.event(r,'reading');
    r.nextAt=r.sourceActive ? this.adapter.now()+INTERVAL : null;
    r.nextReason=r.sourceActive?'interval':null;
    try{
      const snap=await this.adapter.snapshot(id,job.signal);
      if(job.signal.aborted)return;
      if(snap.key!==r.key){
        if(snap.text)this.event(r,'reviewing');
        const text=await this.adapter.review(id,snap,r.notes,job.signal);
        if(job.signal.aborted)return;
        const added=!!text && text!==r.notes.at(-1)?.text;
        if(added)r.notes=[...r.notes,{at:this.adapter.now(),through:snap.through,text:text!}].slice(-20);
        r.outcome=added?'findings':'no-new-findings';
        this.event(r,r.outcome);
        r.key=snap.key;
      }else{r.outcome='unchanged';this.event(r,'unchanged');}
      r.checkedAt=this.adapter.now();r.through=snap.through;r.coverage=snap.coverage;
      await this.adapter.save(id,{...this.state(id),key:r.key});
    }catch(error){if(!job.signal.aborted){r.error=error instanceof Error?error.message:String(error);this.event(r,'failed');}}
    finally{if(r.job===job){r.job=undefined;r.reviewing=false;this.tick();}}
  }
  dispose(){this.disposed=true;for(const r of this.records.values()){r.leases.clear();this.stop(r);r.job?.abort();r.reviewing=false;}}
}
