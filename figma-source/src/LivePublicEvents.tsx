import {useCallback,useEffect,useState} from 'react';
import {api} from './lib/api';
import type {PublicEvent,PublicEventInput} from './lib/eventsync-api';
const error=(e:unknown)=>e instanceof Error?e.message:String(e);
const button='border rounded-lg bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const input='border rounded-lg bg-white p-2 w-full text-sm text-slate-900';
const local=(iso:string)=>new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const empty:PublicEventInput={title:'',description:'',location:'',start:'',end:'',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
const toLocal=(iso:string)=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
export function LivePublicEvents({systemAdmin,userId}:{systemAdmin:boolean;userId:string}){
 const [publisher,setPublisher]=useState(false);
 useEffect(()=>{void api.identity().then(i=>setPublisher(i.organizationPublisher)).catch(()=>{})},[]);
 const canCreate=systemAdmin||publisher;
 const [events,setEvents]=useState<PublicEvent[]>([]);
 const [editing,setEditing]=useState<string|null>(null);
 const [form,setForm]=useState<PublicEventInput>(empty);
 const [startLocal,setStartLocal]=useState(''); const [endLocal,setEndLocal]=useState('');
 const [errorText,setErrorText]=useState('');const [working,setWorking]=useState(false);
 const [cancelTarget,setCancelTarget]=useState<PublicEvent|null>(null);
 const refresh=useCallback(async()=>setEvents(await api.publicEvents()),[]);
 useEffect(()=>{void refresh().catch(e=>setErrorText(error(e)))},[refresh]);
 const edit=(event?:PublicEvent)=>{setEditing(event?.id||'new');setForm(event?{title:event.title,description:event.description,location:event.location,start:event.start,end:event.end,timeZone:event.timeZone}:empty);setStartLocal(event?toLocal(event.start):'');setEndLocal(event?toLocal(event.end):'');setErrorText('')};
 const run=async(task:()=>Promise<unknown>)=>{setWorking(true);setErrorText('');try{await task();await refresh()}catch(e){setErrorText(error(e))}finally{setWorking(false)}};
 const save=()=>void run(async()=>{
  const start=new Date(startLocal),end=new Date(endLocal);
  if(!startLocal||!endLocal||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end)throw Error('Enter a valid start and end');
  const data={...form,start:start.toISOString(),end:end.toISOString()};
  if(editing&&editing!=='new')await api.updatePublicEvent(editing,data);else await api.createPublicEvent(data);
  setEditing(null);
 });
 return <section className="h-full overflow-y-auto p-2 space-y-4" style={{color:'var(--color-lagoon)'}}>
  <div className="flex items-center justify-between gap-2"><div><h2 className="text-2xl font-bold">Public Events</h2><p className="text-sm opacity-70">Announcements everyone with an EventSync account can see. Interested does not mean attended.</p></div>{canCreate&&<button className={button} onClick={()=>edit()}>Create public event</button>}</div>
  {errorText&&<p role="alert" className="bg-red-50 text-red-900 p-3 rounded-lg">{errorText}</p>}
  {editing&&canCreate&&<div className="bg-white border rounded-xl p-4 space-y-3"><h3 className="font-bold">{editing==='new'?'Create public event':'Edit public event'}</h3>
    <label className="block text-sm">Title<input className={input} maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label className="block text-sm">Description<textarea className={input} maxLength={5000} rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label className="block text-sm">Location<input className={input} maxLength={255} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">Start<input type="datetime-local" className={input} value={startLocal} onChange={e=>setStartLocal(e.target.value)}/></label><label className="text-sm">End<input type="datetime-local" className={input} value={endLocal} onChange={e=>setEndLocal(e.target.value)}/></label></div>
    <div className="flex gap-2"><button disabled={working||!form.title.trim()} className={button} onClick={save}>Save</button><button className={button} onClick={()=>setEditing(null)}>Cancel</button></div>
  </div>}
  {events.length===0?<p className="bg-white rounded-xl border p-5 text-sm">No upcoming public events.</p>:<div className="grid md:grid-cols-2 gap-3">{events.map(event=><article key={event.id} className="bg-white border rounded-xl p-4 space-y-2"><h3 className="font-bold text-lg">{event.title}</h3><p className="text-sm opacity-70">{local(event.start)} – {local(event.end)} · {event.location||'Location TBD'}</p><p className="text-sm whitespace-pre-wrap">{event.description}</p><p className="text-xs opacity-70">{event.interestedCount} interested</p><div className="flex flex-wrap gap-2"><button disabled={working} className={button} onClick={()=>void run(()=>api.setPublicEventInterest(event.id,!event.interested))}>{event.interested?'Not interested':'I’m interested'}</button>{(systemAdmin||(publisher&&event.createdBy===userId))&&<><button className={button} onClick={()=>edit(event)}>Edit</button><button disabled={working} className={button} onClick={()=>setCancelTarget(event)}>Cancel event</button></>}</div></article>)}</div>}
  {cancelTarget&&<div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation" style={{backgroundColor:'rgba(0,0,0,0.45)'}}>
    <div role="dialog" aria-modal="true" aria-labelledby="public-cancel-title" className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-4">
      <h3 id="public-cancel-title" className="font-bold text-lg">Cancel public event?</h3>
      <p className="text-sm">Cancel <strong>{cancelTarget.title}</strong> for everyone? This action cannot be undone.</p>
      <div className="flex justify-end gap-3">
        <button disabled={working} className={button} onClick={()=>setCancelTarget(null)}>Keep event</button>
        <button disabled={working} className={`${button} border-red-600 text-red-700`} onClick={()=>void run(async()=>{await api.deletePublicEvent(cancelTarget.id);setCancelTarget(null)})}>{working?'Cancelling…':'Cancel event'}</button>
      </div>
    </div>
  </div>}
 </section>
}
