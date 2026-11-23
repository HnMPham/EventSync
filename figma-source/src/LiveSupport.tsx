import {useEffect,useState} from 'react';
import {api} from './lib/api';
import type {SupportRequest} from './lib/eventsync-api';
const css='w-full rounded-lg border bg-white p-2 text-sm';
export function LiveSupport(){
 const [kind,setKind]=useState<'ISSUE'|'REQUEST'>('ISSUE');const [subject,setSubject]=useState('');const [description,setDescription]=useState('');
 const [mine,setMine]=useState<SupportRequest[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const reload=()=>api.mySupport().then(setMine);
 useEffect(()=>{void reload().catch(e=>setError(String(e)))},[]);
 const send=async()=>{setBusy(true);setError('');setNotice('');try{await api.submitSupport(kind,subject,description);setSubject('');setDescription('');setNotice('Your submission was delivered to the system administrators.');await reload()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <section className="h-full overflow-y-auto space-y-4 p-3" style={{color:'var(--color-lagoon)'}}><h2 className="text-2xl font-bold">Help &amp; Requests</h2>
  <div className="bg-white border rounded-xl p-4 space-y-3"><h3 className="font-semibold">Contact EventSync administrators</h3>
   {error&&<p role="alert" className="text-red-800">{error}</p>}{notice&&<p role="status" className="text-green-800">{notice}</p>}
   <label className="block text-sm">Submission type<select className={css} value={kind} onChange={e=>setKind(e.target.value as 'ISSUE'|'REQUEST')}><option value="ISSUE">Report an issue</option><option value="REQUEST">Submit a request</option></select></label>
   <label className="block text-sm">Subject<input maxLength={160} className={css} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
   <label className="block text-sm">Description<textarea maxLength={5000} rows={5} className={css} value={description} onChange={e=>setDescription(e.target.value)}/></label>
   <button className="border rounded-lg px-4 py-2 font-semibold" disabled={busy||!subject.trim()||!description.trim()} onClick={()=>void send()}>{busy?'Sending…':kind==='ISSUE'?'Report issue':'Submit request'}</button>
  </div>
  <div className="bg-white border rounded-xl p-4 space-y-3"><h3 className="font-semibold">Your submissions</h3>{mine.length===0?<p className="text-sm">Nothing submitted yet.</p>:mine.map(r=><div key={r.id} className="border-b py-2"><strong>{r.subject}</strong> · {r.kind} · {r.status}<p className="text-sm whitespace-pre-wrap">{r.description}</p>{r.adminReply&&<p className="text-sm mt-2">Admin response: {r.adminReply}</p>}</div>)}</div>
 </section>
}
