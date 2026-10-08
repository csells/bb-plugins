export const INTERVAL = 5 * 60_000;
export const LEASE_TTL = 90_000;
export type Snapshot = {key: string; text: string; through: number; coverage: string};
export type Note = {at: number; through: number; text: string};
export type View = {active: boolean; reviewing: boolean; checkedAt: number|null; nextAt: number|null; through: number; coverage: string; error: string|null; notes: Note[]};
type RecordState = View & {key: string; sourceActive: boolean; leases: Map<string,number>; job?: AbortController};
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
    if(!r){r={active:false,reviewing:false,checkedAt:null,nextAt:null,through:0,coverage:'',error:null,notes:[],key:'',sourceActive:false,leases:new Map()};this.records.set(id,r);}
    return r;
  }
  restore(id:string, saved: View & {key:string}) {
    Object.assign(this.record(id),saved,{active:false,reviewing:false,nextAt:null,error:null});
  }
  state(id:string): View {
    const {leases,job,key,sourceActive,...view}=this.record(id);
    return structuredClone(view);
  }
  open(id:string,lease:string) {
    if(this.disposed) throw Error('Observer is stopped');
    const r=this.record(id); r.leases.set(lease,this.adapter.now()+LEASE_TTL);
    if(!r.active){r.active=true;r.nextAt=0;}
    this.tick(); return this.state(id);
  }
  setSourceActive(id:string, active:boolean) {
    if(this.disposed)return;
    const r=this.record(id);
    if(r.sourceActive===active)return;
    r.sourceActive=active;
    if(r.active){
      // Keep an already-due idle review if a new turn starts before it can run.
      r.nextAt=active ? Math.min(r.nextAt??Infinity,this.adapter.now()+INTERVAL) : this.adapter.now();
      this.tick();
    }
  }
  close(id:string,lease:string) {
    const r=this.record(id);r.leases.delete(lease);
    if(!r.leases.size)this.stop(r);
  }
  private stop(r:RecordState){
    // Losing visibility pauses scheduling, not the bounded review already paid for.
    // A returning panel reconnects to that job instead of repeatedly restarting it.
    r.active=false;r.nextAt=null;
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
    r.nextAt=r.sourceActive ? this.adapter.now()+INTERVAL : null;
    try{
      const snap=await this.adapter.snapshot(id,job.signal);
      if(job.signal.aborted)return;
      if(snap.key!==r.key){
        const text=await this.adapter.review(id,snap,r.notes,job.signal);
        if(job.signal.aborted)return;
        if(text && text!==r.notes.at(-1)?.text)r.notes=[...r.notes,{at:this.adapter.now(),through:snap.through,text}].slice(-20);
        r.key=snap.key;
      }
      r.checkedAt=this.adapter.now();r.through=snap.through;r.coverage=snap.coverage;
      await this.adapter.save(id,{...this.state(id),key:r.key});
    }catch(error){if(!job.signal.aborted)r.error=error instanceof Error?error.message:String(error);}
    finally{if(r.job===job){r.job=undefined;r.reviewing=false;this.tick();}}
  }
  dispose(){this.disposed=true;for(const r of this.records.values()){r.leases.clear();this.stop(r);r.job?.abort();r.reviewing=false;}}
}
