/** EventSync proposed-meeting workflow connected to the Spring Boot API. */
import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import type { Poll, PollRecommendation, PollInput, Group, Friend, User, Interval } from './lib/eventsync-api';

const localValue = (date: Date) => {
  const pad=(v:number)=>String(v).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const errText = (e:unknown) => e instanceof Error ? e.message : String(e);
const displayDate = (iso:string) => new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const button = 'px-3 py-2 rounded-xl text-sm font-semibold border transition hover:opacity-80 disabled:opacity-40';
const input = 'w-full rounded-lg border p-2 text-sm text-slate-900 bg-white';
const caption = 'text-xs font-semibold mb-1 text-slate-600 block';
const nowPlusHours = (hours:number)=>localValue(new Date(Date.now()+hours*3600000));

export function LiveScheduling({friends,groups,user}:{friends:Friend[];groups:Group[];user:User}) {
  const [polls,setPolls] = useState<Poll[]>([]);
  const [selected,setSelected] = useState<Poll|null>(null);
  const [recommendations,setRecommendations] = useState<PollRecommendation[]>([]);
  const [err,setErr] = useState('');
  const [message,setMessage] = useState('');
  const [working,setWorking] = useState(false);
  const [title,setTitle] = useState('');
  const [description,setDescription] = useState('');
  const [location,setLocation] = useState('');
  const [windowStart,setWindowStart] = useState(nowPlusHours(24));
  const [windowEnd,setWindowEnd] = useState(nowPlusHours(72));
  const [duration,setDuration] = useState(60);
  const [groupId,setGroupId] = useState('');
  const [invitedIds,setInvitedIds] = useState<string[]>([]);
  const [code,setCode] = useState('');
  const [joinId,setJoinId] = useState('');
  const [joinCode,setJoinCode] = useState('');
  const [inviteEmail,setInviteEmail] = useState('');
  const [manualStart,setManualStart] = useState(nowPlusHours(24));
  const [manualEnd,setManualEnd] = useState(nowPlusHours(25));
  const [draft,setDraft] = useState(false);
  const [filter,setFilter] = useState('all');
  const refresh = useCallback(async (activeId?:string) => {
    const result=await api.polls('all');setPolls(result);
    if(activeId) {
      try {setSelected(await api.poll(activeId));}catch {setSelected(null)}
    }
  },[]);
  useEffect(()=>{void refresh().catch(e=>setErr(errText(e)))},[refresh]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const id=params.get('join'), secret=params.get('code');
    if(!id || !secret)return;
    void (async()=>{
      try {
        const joined=await api.joinPoll(id,secret);
        setSelected(joined);setMessage('You joined the scheduling event. Submit your availability below.');
        await refresh(id);
      } catch(e){setErr('Could not join event: '+errText(e))}
      finally {window.history.replaceState({},'',window.location.pathname)}
    })();
  },[refresh]);
  const action=async(work:()=>Promise<unknown>,after?:()=>Promise<void>)=>{
    setWorking(true);setErr('');setMessage('');
    try {await work();if(after)await after()} catch(e){setErr(errText(e))}
    finally {setWorking(false)}
  };
  const makePoll = () => action(async()=>{
    const start=new Date(windowStart),end=new Date(windowEnd);
    if(!title.trim() || !(start<end) || start.getTime()<Date.now())throw new Error('Enter a title and future scheduling window.');
    const payload:PollInput={title:title.trim(),description,location,
      windowStart:start.toISOString(),windowEnd:end.toISOString(),durationMinutes:Number(duration),
      timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,groupId:groupId||null,
      inviteeIds:invitedIds,draft};
    const created=await api.createPoll(payload);
    setSelected(created.event);setCode(created.invitationCode);
    setMessage('Event saved in MySQL. Copy your invitation link before leaving this page.');
    await refresh(created.event.id);
  });
  const selectPoll=(id:string)=>action(async()=>{
    setSelected(await api.poll(id));setRecommendations([]);setCode('');
  });
  const doPoll = (command:()=>Promise<Poll>,notice:string) =>action(async()=>{
    if(!selected)return;
    const result=await command();setSelected(result);setMessage(notice);await refresh(result.id);
  });
  const submitManual=()=>{
    if(!selected)return;
    const start=new Date(manualStart), end=new Date(manualEnd);
    if(!(start<end)){setErr('End time must be after start time.');return;}
    const slots:Interval[]=[...selected.myAvailability,{start:start.toISOString(),end:end.toISOString()}];
    void doPoll(()=>api.submitPollAvailability(selected.id,slots),'Event availability saved.');
  };
  const removeManual=(i:number)=>{
    if(!selected)return;
    void doPoll(()=>api.submitPollAvailability(selected.id,selected.myAvailability.filter((_,idx)=>idx!==i)),'Availability updated.');
  };
  const fetchRecommendations=()=>action(async()=>{
    if(!selected)return;
    const result=await api.recommendPollTimes(selected.id);
    setRecommendations(result.suggestions);
    setMessage(`Checked ${result.suggestions.length} recommended time slots.`);
  });
  const rotateCode=()=>action(async()=>{
    if(!selected)return;
    const result=await api.rotatePollCode(selected.id);setCode(result.invitationCode);
    setMessage('Invitation code rotated. Older links no longer work.');
  });
  const copyLink=async()=>{
    if(!selected||!code)return;
    const link=`${locationOrigin()}?join=${encodeURIComponent(selected.id)}&code=${encodeURIComponent(code)}`;
    try{await navigator.clipboard.writeText(link);setMessage('Invitation link copied.')}catch{setMessage('Copy this link: '+link)}
  };
  const downloadCalendar=()=>action(async()=>{
    if(!selected)return;
    const blob=await api.downloadPollCalendar(selected.id);
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='eventsync-meeting.ics';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  });
  const visible=polls.filter(p=>filter==='all' || p.status.toLowerCase()===filter || (filter==='mine'&&p.organizerId===user.id));
  return <div className="h-full overflow-y-auto space-y-5 pb-8" style={{color:'var(--color-lagoon)'}}>
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div><h2 className="text-xl font-bold">Find a Meeting Time</h2><p className="text-sm opacity-75">Create a proposal, collect availability, and finalize the highest-overlap time.</p></div>
      <button className={button} onClick={()=>void refresh(selected?.id).catch(e=>setErr(errText(e)))}>Refresh</button>
    </div>
    {err&&<div role="alert" className="p-3 rounded-lg text-sm bg-red-50 text-red-900 border border-red-200">{err}</div>}
    {message&&<div role="status" className="p-3 rounded-lg text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">{message}</div>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border-2 p-5 bg-white space-y-3" style={{borderColor:'var(--color-lagoon-100)'}}>
        <h3 className="font-bold">Create a scheduling event</h3>
        <label className={caption}>Title<input className={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Study group, team meeting…" /></label>
        <label className={caption}>Description<input className={input} value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <label className={caption}>Meeting location<input className={input} value={location} onChange={e=>setLocation(e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-2">
          <label className={caption}>Earliest date/time<input type="datetime-local" className={input} value={windowStart} onChange={e=>setWindowStart(e.target.value)}/></label>
          <label className={caption}>Latest date/time<input type="datetime-local" className={input} value={windowEnd} onChange={e=>setWindowEnd(e.target.value)}/></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={caption}>Meeting length (minutes)<input type="number" min={30} max={480} step={30} className={input} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
          <label className={caption}>Group (optional)
            <select className={input} value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">No group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </label>
        </div>
        <label className={caption}>Invite friends (optional)</label>
        <div className="flex gap-2 flex-wrap">{friends.length===0?<span className="text-xs opacity-70">Add friends to invite them directly.</span>:friends.map(f=><label key={f.user.id} className="flex items-center gap-1 border rounded-lg px-2 py-1 text-xs"><input type="checkbox" checked={invitedIds.includes(f.user.id)} onChange={()=>setInvitedIds(prev=>prev.includes(f.user.id)?prev.filter(id=>id!==f.user.id):[...prev,f.user.id])}/>{f.user.name}</label>)}</div>
        <label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={draft} onChange={e=>setDraft(e.target.checked)}/>Save as draft instead of publishing immediately</label>
        <button disabled={working||!title.trim()} className={`${button} text-white w-full`} style={{background:'var(--color-lagoon)'}} onClick={()=>void makePoll()}>Create Scheduling Event</button>
      </section>
      <section className="rounded-2xl border-2 p-5 bg-white space-y-3" style={{borderColor:'var(--color-lagoon-100)'}}>
        <h3 className="font-bold">Your scheduling events</h3>
        <div className="flex items-center gap-2">
          <label className={caption}>Show<select className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option><option value="mine">Organized by me</option><option value="draft">Draft</option><option value="collecting">Collecting availability</option><option value="finalized">Finalized</option></select></label>
        </div>
        <div className="max-h-72 overflow-y-auto space-y-2">{visible.length===0?<p className="text-sm opacity-70">No scheduling events yet.</p>:visible.map(p=><button key={p.id} onClick={()=>void selectPoll(p.id)} className="w-full text-left rounded-xl border p-3 hover:bg-indigo-50" style={{borderColor:p.id===selected?.id?'var(--color-lagoon)':'#ddd'}}>
          <span className="font-semibold block">{p.title}</span><span className="text-xs opacity-75">{p.status} · {displayDate(p.windowStart)} · {p.participants.length} participant(s)</span>
        </button>)}</div>
        <div className="border-t pt-3"><p className="font-bold text-sm mb-2">Join with invitation code</p>
          <div className="flex gap-2"><input className={input} placeholder="Event ID" aria-label="Event ID" value={joinId} onChange={e=>setJoinId(e.target.value)}/><input className={input} placeholder="Code" aria-label="Invitation code" value={joinCode} onChange={e=>setJoinCode(e.target.value)}/></div>
          <button disabled={working||!joinId||!joinCode} className={`${button} mt-2`} onClick={()=>void action(async()=>{const p=await api.joinPoll(joinId,joinCode);setSelected(p);setMessage('Joined event.');await refresh(joinId)})}>Join Event</button>
        </div>
      </section>
    </div>
    {selected && <section className="rounded-2xl border-2 p-5 bg-white space-y-4" style={{borderColor:'var(--color-lagoon-100)'}}>
      <div className="flex flex-wrap justify-between gap-2 items-start"><div>
        <h3 className="text-lg font-bold">{selected.title}</h3>
        <p className="text-sm opacity-70">{selected.status} · {displayDate(selected.windowStart)} to {displayDate(selected.windowEnd)}</p>
        {selected.finalizedStart&&<p className="font-bold text-emerald-800">Final meeting: {displayDate(selected.finalizedStart)}</p>}
      </div><button className={button} onClick={()=>setSelected(null)}>Close</button></div>
      {selected.organizerId===user.id&&<div className="flex flex-wrap gap-2">
        {selected.status==='DRAFT'&&<button className={button} disabled={working} onClick={()=>void doPoll(()=>api.publishPoll(selected.id),'Scheduling opened.')}>Publish</button>}
        {['DRAFT','COLLECTING'].includes(selected.status)&&<button className={button} disabled={working} onClick={()=>void rotateCode()}>Generate new invitation link</button>}
        {selected.status==='FINALIZED'&&<button className={button} disabled={working} onClick={()=>void doPoll(()=>api.reopenPoll(selected.id),'Reopened.')}>Reopen</button>}
        {selected.status!=='CANCELLED'&&<button className={button} disabled={working} onClick={()=>void doPoll(()=>api.cancelPoll(selected.id),'Event cancelled.')}>Cancel</button>}
      </div>}
      {code&&selected.organizerId===user.id&&<div className="rounded-lg bg-yellow-50 p-3 text-sm"><p className="font-semibold mb-1">Invitation code (shown only now): {code}</p><button className={button} onClick={()=>void copyLink()}>Copy invitation link</button></div>}
      {selected.organizerId===user.id&&['DRAFT','COLLECTING'].includes(selected.status)&&<div className="flex flex-wrap gap-2 items-end">
        <label className={caption}>Invite registered user by email<input type="email" className={input} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="person@example.com"/></label>
        <button className={button} disabled={working||!inviteEmail} onClick={()=>void doPoll(()=>api.inviteEmailToPoll(selected.id,inviteEmail),'Invitation recorded in EventSync.')}>Invite</button>
      </div>}
      <div><h4 className="font-bold text-sm mb-2">Participants</h4>
        <div className="flex flex-wrap gap-2">{selected.participants.map(p=><span key={p.user.id} className="px-3 py-2 rounded-lg text-xs border bg-slate-50">{p.user.name} · {p.response} {p.submitted?'· submitted':''}</span>)}</div>
      </div>
      {selected.groupId && selected.status==='COLLECTING' && selected.organizerId!==user.id && !selected.participants.some(p=>p.user.id===user.id)&&<button className={button} disabled={working} onClick={()=>void doPoll(()=>api.joinGroupPoll(selected.id),'Joined group event.')}>Join this group event</button>}
      {selected.status==='COLLECTING'&&<div className="space-y-3 rounded-xl p-3" style={{background:'var(--color-lagoon-50)'}}>
        {selected.organizerId!==user.id&&<div className="flex gap-2">
          <button className={button} disabled={working} onClick={()=>void doPoll(()=>api.respondToPoll(selected.id,true),'Accepted invitation.')}>Accept</button>
          <button className={button} disabled={working} onClick={()=>void doPoll(()=>api.respondToPoll(selected.id,false),'Declined invitation.')}>Decline</button>
        </div>}
        <h4 className="font-bold">Your availability for this event</h4>
        <button className={button} disabled={working} onClick={()=>void doPoll(()=>api.prefillPollWeekly(selected.id),'Copied your weekly availability.')}>Copy my weekly availability</button>
        <div className="flex flex-wrap gap-2">{selected.myAvailability.map((span,i)=><button className={`${button} bg-white`} title="Remove this availability" key={span.start+i} disabled={working} onClick={()=>removeManual(i)}>{displayDate(span.start)} – {displayDate(span.end)} ✕</button>)}</div>
        <div className="grid gap-2 sm:grid-cols-2"><label className={caption}>Available from<input className={input} type="datetime-local" value={manualStart} onChange={e=>setManualStart(e.target.value)}/></label><label className={caption}>Available until<input className={input} type="datetime-local" value={manualEnd} onChange={e=>setManualEnd(e.target.value)}/></label></div>
        <button disabled={working} className={`${button} text-white`} style={{background:'var(--color-lagoon)'}} onClick={submitManual}>Add available period</button>
      </div>}
      {selected.organizerId===user.id && selected.status==='COLLECTING'&&<div className="space-y-3">
        <button disabled={working} className={button} onClick={()=>void fetchRecommendations()}>Calculate optimal meeting times</button>
        {recommendations.length>0&&<div className="grid gap-2 md:grid-cols-2">{recommendations.slice(0,12).map(rec=><div key={rec.start} className="p-3 border rounded-xl flex items-center justify-between gap-2">
          <div className="text-sm"><p className="font-semibold">{displayDate(rec.start)}</p><p className="text-xs opacity-70">{rec.availableCount}/{rec.totalParticipants} available</p></div>
          <button disabled={working} className={button} onClick={()=>void doPoll(()=>api.finalizePoll(selected.id,rec.start),'Meeting finalized!')}>Finalize</button>
        </div>)}</div>}
      </div>}
      {selected.status==='FINALIZED'&&<button disabled={working} className={button} onClick={()=>void downloadCalendar()}>Download calendar file (.ics)</button>}
    </section>}
  </div>;
}
function locationOrigin(){return window.location.origin+window.location.pathname}
