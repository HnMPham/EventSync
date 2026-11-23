/**
 * Working reference screens for Figma Make (React).
 * Put frontend/eventsync-api.ts in src/lib/, then change this import path to match.
 * Usage:
 *   const api = useMemo(() => createEventSyncApi("https://YOUR-API/api"), []);
 *   return <EventSyncDashboard api={api}/>;
 */
import React, { useCallback, useEffect, useState } from "react";
import type { Group, Interval, ManualOverride, Notification, Poll, PollInput, PollRecommendations, User } from "../frontend/eventsync-api";
import { createEventSyncApi } from "../frontend/eventsync-api";

type Api = ReturnType<typeof createEventSyncApi>;
const field: React.CSSProperties = { padding: 9, border: "1px solid #cbd5e1", borderRadius: 6, margin: 4, minWidth: 165, color: "#111827", backgroundColor: "#ffffff" };
const button: React.CSSProperties = { ...field, cursor: "pointer", background: "#dbeafe", borderColor: "#93c5fd" };
const card: React.CSSProperties = { padding: 18, margin: "12px 0", border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc" };
function iso(local: string): string { return new Date(local).toISOString(); }
function local(date?: string | null): string { return date ? new Date(date).toLocaleString() : "Not selected"; }
function toInputDate(utc: string): string {
  const d=new Date(utc);
  const pad=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function mondayLocal(): string {
  const date=new Date();date.setDate(date.getDate()-((date.getDay()+6)%7));
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function nextLocal(dayOffset: number, hour: number): string {
  const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(hour).padStart(2,"0")}:00`;
}
export function EventSyncDashboard({ api }: { api: Api }) {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<"events" | "groups" | "calendar" | "notifications" | "account">("events");
  const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Poll | null>(null);
  const [suggested, setSuggested] = useState<PollRecommendations | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [outlook, setOutlook] = useState(false);
  const [code, setCode] = useState("");
  const [loginEmail, setLoginEmail] = useState("");const [loginPassword, setLoginPassword] = useState("");const [loginName, setLoginName] = useState("");
  const [groupName, setGroupName] = useState("");const [memberId, setMemberId] = useState("");const [pickedGroup, setPickedGroup] = useState<Group | null>(null);
  const [joinId, setJoinId] = useState("");const [joinCode, setJoinCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState(nextLocal(1, 9));
  const [availabilityEnd, setAvailabilityEnd] = useState(nextLocal(1, 17));
  const [ranges, setRanges] = useState<Interval[]>([]);
  const [overrideStart, setOverrideStart] = useState(nextLocal(1, 10));
  const [overrideEnd, setOverrideEnd] = useState(nextLocal(1, 11));
  const [overrideState, setOverrideState] = useState<"AVAILABLE"|"BUSY">("BUSY");
  const [overrides, setOverrides] = useState<ManualOverride[]>([]);
  const [weekStart,setWeekStart]=useState(mondayLocal());
  const [weekGrid,setWeekGrid]=useState<(Interval&{localTime:string})[]>([]);
  const [weekChosen,setWeekChosen]=useState<string[]>([]);
  const [pollForm, setPollForm] = useState({title:"", description:"",location:"",windowStart:nextLocal(1,9),windowEnd:nextLocal(2,17),duration:60,groupId:"",draft:false});
  const [editId, setEditId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");const [profileZone, setProfileZone] = useState("");
  const [oldPassword, setOldPassword] = useState("");const [newPassword, setNewPassword] = useState("");

  const run = async (job: () => Promise<unknown>, message = "Updated") => {
    setBusy(true);setError("");setInfo("");
    try { await job();setInfo(message); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const reload = useCallback(async () => {
    const [p,g,n,status] = await Promise.all([api.polls(),api.groups(),api.notifications(),api.outlookStatus()]);
    setPolls(p);setGroups(g);setNotifications(n);setOutlook(status.connected);
  },[api]);
  useEffect(() => {
    void api.me().then(async u => {
      setUser(u);setProfileName(u.name);setProfileZone(u.timeZone);
      if(new URLSearchParams(window.location.search).has("state")) await api.finishOutlookConnection();
      await reload();
    }).catch(() => { /* login form will be displayed */ });
  },[api,reload]);
  const open = async (id: string) => {
    const event=await api.poll(id);setSelected(event);setRanges(event.myAvailability);setSuggested(null);setCode("");setTab("events");
  };
  const refresh = async () => {
    await reload(); if(selected) { const event=await api.poll(selected.id);setSelected(event);setRanges(event.myAvailability); }
  };
  const formInput = (): PollInput => ({ title:pollForm.title,description:pollForm.description,location:pollForm.location,
    windowStart:iso(pollForm.windowStart),windowEnd:iso(pollForm.windowEnd),durationMinutes:Number(pollForm.duration),
    timeZone:user?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    groupId:pollForm.groupId || null,draft:pollForm.draft });

  if(!user) return <main style={{maxWidth:500,margin:"40px auto",fontFamily:"sans-serif",color:"#111827"}}>
    <h1>EventSync</h1><p>Sign in or create an account to schedule meetings.</p>
    <input style={field} placeholder="Email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}/>
    <input style={field} placeholder="Password" type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)}/>
    <input style={field} placeholder="Name (for sign up)" value={loginName} onChange={e=>setLoginName(e.target.value)}/>
    <p style={{color:"#b91c1c"}} role="alert">{error}</p>
    <button style={button} disabled={busy} onClick={()=>void run(async()=>{
      const result=await api.login(loginEmail,loginPassword);setUser(result.user);await reload();},"Signed in")}>Log in</button>
    <button style={button} disabled={busy} onClick={()=>void run(async()=>{
      const result=await api.signup(loginName,loginEmail,loginPassword);setUser(result.user);await reload();},"Account created")}>Sign up</button>
  </main>;

  return <main style={{maxWidth:1080,margin:"24px auto",padding:16,fontFamily:"system-ui, sans-serif",color:"#0f172a"}}>
    <header style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <h1 style={{marginRight:"auto"}}>EventSync</h1><span>{user.name}</span>
      {(["events","groups","calendar","notifications","account"] as const).map(t=><button key={t} style={{...button,background:tab===t?"#bfdbfe":"#f1f5f9"}} onClick={()=>setTab(t)}>{t}</button>)}
      <button style={button} onClick={()=>void run(async()=>{await api.logout();setUser(null);},"Logged out")}>Log out</button>
    </header>
    {error&&<p role="alert" style={{padding:12,color:"#991b1b",background:"#fee2e2"}}>{error}</p>}
    {info&&<p style={{padding:12,color:"#166534",background:"#dcfce7"}}>{info}</p>}
    {busy&&<p>Saving...</p>}
    {tab==="events"&&<>
      <section style={card}><h2>Create or edit a meeting</h2>
        <input style={field} placeholder="Event title" value={pollForm.title} onChange={e=>setPollForm({...pollForm,title:e.target.value})}/>
        <input style={field} placeholder="Description" value={pollForm.description} onChange={e=>setPollForm({...pollForm,description:e.target.value})}/>
        <input style={field} placeholder="Location or Teams link" value={pollForm.location} onChange={e=>setPollForm({...pollForm,location:e.target.value})}/>
        <label>Earliest time <input style={field} type="datetime-local" value={pollForm.windowStart} onChange={e=>setPollForm({...pollForm,windowStart:e.target.value})}/></label>
        <label>Latest time <input style={field} type="datetime-local" value={pollForm.windowEnd} onChange={e=>setPollForm({...pollForm,windowEnd:e.target.value})}/></label>
        <label>Meeting length (minutes) <input style={{...field,width:75,minWidth:75}} type="number" min={30} max={480} step={30} value={pollForm.duration} onChange={e=>setPollForm({...pollForm,duration:Number(e.target.value)})}/></label>
        <select style={field} value={pollForm.groupId} onChange={e=>setPollForm({...pollForm,groupId:e.target.value})}>
          <option value="">Personal event</option>{groups.filter(g=>g.myRole==="ADMIN").map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label><input type="checkbox" checked={pollForm.draft} onChange={e=>setPollForm({...pollForm,draft:e.target.checked})}/> Save as draft</label>
        <button style={button} disabled={busy} onClick={()=>void run(async()=>{
          if(editId){await api.updatePoll(editId,formInput());await open(editId);}else{
            const created=await api.createPoll(formInput());await open(created.event.id);setCode(created.invitationCode);}
          setEditId(null);await reload();},editId?"Event updated":"Event created")}>{editId?"Save changes":"Create meeting"}</button>
      </section>
      <section style={card}><h2>Join a meeting</h2>
        <input style={field} placeholder="Event ID" value={joinId} onChange={e=>setJoinId(e.target.value)}/>
        <input style={field} placeholder="Invitation code" value={joinCode} onChange={e=>setJoinCode(e.target.value)}/>
        <button style={button} onClick={()=>void run(async()=>{const p=await api.joinPoll(joinId,joinCode);await open(p.id);await reload();},"Joined meeting")}>Join</button>
      </section>
      <section style={card}><h2>My meetings</h2><button style={button} onClick={()=>void run(reload,"Refreshed")}>Refresh</button>
        {polls.map(p=><button key={p.id} style={{...button,display:"block",textAlign:"left",width:"100%"}} onClick={()=>void run(()=>open(p.id),"Loaded")}>{p.title} • {p.status} • {local(p.finalizedStart || p.windowStart)}</button>)}
      </section>
      {selected&&<section style={card}>
        <h2>{selected.title} <small>({selected.status})</small></h2>
        <p>{selected.description} • {selected.location}</p>
        <p>Scheduling window: {local(selected.windowStart)} to {local(selected.windowEnd)}. Meeting length: {selected.durationMinutes} minutes.</p>
        <p>Participants: {selected.participants.map(p=>`${p.user.name} (${p.submitted?"submitted":p.response})`).join(", ") || "No invitees yet"}</p>
        {code&&<p><strong>Shareable invitation code (shown once):</strong> <code>{code}</code><br/>Event ID: <code>{selected.id}</code></p>}
        {selected.organizerId===user.id&&<>
          <button style={button} onClick={()=>void run(async()=>{const out=await api.rotatePollCode(selected.id);setCode(out.invitationCode);},"New invitation code generated")}>Regenerate join code</button>
          {selected.status==="DRAFT"&&<button style={button} onClick={()=>void run(async()=>{await api.publishPoll(selected.id);await refresh();},"Published")}>Publish</button>}
          {(selected.status==="DRAFT"||selected.status==="COLLECTING")&&<>
            <input style={field} placeholder="Invite registered email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/>
            <button style={button} onClick={()=>void run(async()=>{await api.inviteEmailToPoll(selected.id,inviteEmail);await refresh();},"Invite sent in app")}>Invite</button>
            <button style={button} onClick={()=>{setEditId(selected.id);setPollForm({title:selected.title,description:selected.description,location:selected.location,windowStart:toInputDate(selected.windowStart),windowEnd:toInputDate(selected.windowEnd),duration:selected.durationMinutes,groupId:selected.groupId||"",draft:selected.status==="DRAFT"});setInfo("Edit the event form above, including its date window.");}}>Edit event</button>
          </>}
          {selected.status==="FINALIZED"&&<button style={button} onClick={()=>void run(async()=>{await api.reopenPoll(selected.id);await refresh();},"Scheduling reopened")}>Reopen</button>}
          {selected.status!=="CANCELLED"&&<button style={button} onClick={()=>void run(async()=>{await api.cancelPoll(selected.id);await refresh();},"Cancelled")}>Cancel</button>}
          <button style={button} onClick={()=>void run(async()=>{await api.deletePoll(selected.id);setSelected(null);await reload();},"Deleted")}>Delete</button>
        </>}
        {selected.organizerId!==user.id&&selected.groupId&&<button style={button} onClick={()=>void run(async()=>{await api.joinGroupPoll(selected.id);await refresh();},"Joined group event")}>Join group event</button>}
        {selected.organizerId!==user.id&&selected.status==="COLLECTING"&&selected.participants.some(x=>x.user.id===user.id)&&<>
          <button style={button} onClick={()=>void run(async()=>{await api.respondToPoll(selected.id,true);await refresh();},"Invitation accepted")}>Accept invitation</button>
          <button style={button} onClick={()=>void run(async()=>{await api.respondToPoll(selected.id,false);await refresh();},"Invitation declined")}>Decline invitation</button>
        </>}
        {selected.status==="COLLECTING"&&<>
          <h3>My availability</h3>
          <label>Available from <input style={field} type="datetime-local" value={availabilityStart} onChange={e=>setAvailabilityStart(e.target.value)}/></label>
          <label>To <input style={field} type="datetime-local" value={availabilityEnd} onChange={e=>setAvailabilityEnd(e.target.value)}/></label>
          <button style={button} onClick={()=>void run(async()=>{setRanges([...ranges,{start:iso(availabilityStart),end:iso(availabilityEnd)}]);},"Time added")}>Add time range</button>
          {ranges.map((r,i)=><p key={i}>{local(r.start)} to {local(r.end)} <button style={button} onClick={()=>setRanges(ranges.filter((_,n)=>i!==n))}>Remove</button></p>)}
          <button style={button} onClick={()=>void run(async()=>{await api.submitPollAvailability(selected.id,ranges);await refresh();},"Availability saved")}>Submit availability</button>
          <button style={button} onClick={()=>void run(async()=>{await api.prefillPollWeekly(selected.id);await refresh();},"Copied weekly availability")}>Use my weekly schedule</button>
          <h3>Recommended meeting times</h3>
          <button style={button} onClick={()=>void run(async()=>{setSuggested(await api.recommendPollTimes(selected.id));},"Recommendations updated")}>Find best times</button>
          {suggested?.suggestions.map(s=><p key={s.start}>{local(s.start)} • {s.availableCount}/{s.totalParticipants} available
            {selected.organizerId===user.id&&<button style={button} onClick={()=>void run(async()=>{await api.finalizePoll(selected.id,s.start);await refresh();},"Meeting finalized")}>Finalize this time</button>}
          </p>)}
        </>}
        {selected.status==="FINALIZED"&&<p>Meeting scheduled for {local(selected.finalizedStart)} to {local(selected.finalizedEnd)}.
          <button style={button} onClick={()=>void run(async()=>{
            const blob=await api.downloadPollCalendar(selected.id);
            const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download="eventsync.ics";
            anchor.click();URL.revokeObjectURL(url);
          },"Calendar file ready")}>Export .ics</button></p>}
      </section>}
    </>}
    {tab==="groups"&&<section style={card}><h2>Groups and organizations</h2>
      <input style={field} value={groupName} placeholder="Group name" onChange={e=>setGroupName(e.target.value)}/>
      <button style={button} onClick={()=>void run(async()=>{await api.createGroup(groupName);setGroupName("");await reload();},"Group created")}>Create group</button>
      {groups.map(g=><button key={g.id} style={button} onClick={()=>setPickedGroup(g)}>{g.name} ({g.myRole})</button>)}
      {pickedGroup&&<div style={card}><h3>{pickedGroup.name}</h3><p>{pickedGroup.description}</p>
        {pickedGroup.members.map(m=><p key={m.user.id}>{m.user.name}: {m.role}
          {pickedGroup.myRole==="ADMIN"&&m.user.id!==pickedGroup.ownerId&&<>
            <button style={button} onClick={()=>void run(async()=>{setPickedGroup(await api.setGroupMemberRole(pickedGroup.id,m.user.id,m.role==="ADMIN"?"MEMBER":"ADMIN"));await reload();},"Role changed")}>Change role</button>
            <button style={button} onClick={()=>void run(async()=>{await api.removeGroupMember(pickedGroup.id,m.user.id);setPickedGroup(await api.group(pickedGroup.id));await reload();},"Member removed")}>Remove</button>
          </>}
        </p>)}
        {pickedGroup.myRole==="ADMIN"&&<><input style={field} placeholder="Member's EventSync user ID" value={memberId} onChange={e=>setMemberId(e.target.value)}/>
        <button style={button} onClick={()=>void run(async()=>{setPickedGroup(await api.addGroupMember(pickedGroup.id,memberId));await reload();},"Member added")}>Add member</button>
        {pickedGroup.ownerId===user.id&&<button style={button} onClick={()=>void run(async()=>{await api.deleteGroup(pickedGroup.id);setPickedGroup(null);await reload();},"Group deleted")}>Delete group</button>}</>}
      </div>}
    </section>}
    {tab==="calendar"&&<section style={card}><h2>Outlook / Microsoft Teams calendar</h2>
      <p>Connected: {outlook?"Yes":"No"}. Graph imports meeting conflicts into SQL, but does not expose meeting titles to other participants.</p>
      {!outlook?<button style={button} onClick={()=>void run(()=>api.connectOutlook(),"Redirecting to Microsoft")}>Connect Outlook</button>:<>
        <button style={button} onClick={()=>void run(async()=>{await api.syncDefaultOutlook(new Date().toISOString(),new Date(Date.now()+14*86400000).toISOString());await reload();},"Outlook calendar synchronized")}>Sync next 14 days</button>
        <button style={button} onClick={()=>void run(async()=>{await api.disconnectOutlook();await reload();},"Disconnected")}>Disconnect</button>
      </>}
      <h3>Weekly availability calendar</h3>
      <p>Select the hour-long blocks when you normally have time to meet. This availability can be copied into any event.</p>
      <label>Monday of week <input style={field} type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)}/></label>
      <button style={button} onClick={()=>void run(async()=>{
        const [grid,week]=await Promise.all([api.weekSlots(weekStart,user.timeZone),api.week(weekStart,user.timeZone)]);
        setWeekGrid(grid);setWeekChosen(week.selectedStarts);
      },"Week loaded")}>Load weekly calendar</button>
      {weekGrid.length>0&&<>
        <div style={{maxHeight:280,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:4}}>
          {weekGrid.map(slot=><label key={slot.start} style={{...card,margin:2,padding:8,background:weekChosen.includes(slot.start)?"#bbf7d0":"#ffffff",cursor:"pointer"}}>
            <input type="checkbox" checked={weekChosen.includes(slot.start)} onChange={e=>setWeekChosen(e.target.checked?[...weekChosen,slot.start]:weekChosen.filter(x=>x!==slot.start))}/>
            {new Intl.DateTimeFormat("en-US",{timeZone:user.timeZone,weekday:"short",hour:"numeric",minute:"2-digit"}).format(new Date(slot.start))}
          </label>)}
        </div>
        <button style={button} onClick={()=>void run(async()=>{
          const saved=await api.saveAvailability(weekStart,user.timeZone,weekChosen);
          setWeekChosen(saved.selectedStarts);
        },"Weekly availability saved")}>Save weekly availability</button>
      </>}
      <h3>Manually override Outlook busy/free time</h3>
      <label>Start <input style={field} type="datetime-local" value={overrideStart} onChange={e=>setOverrideStart(e.target.value)}/></label>
      <label>End <input style={field} type="datetime-local" value={overrideEnd} onChange={e=>setOverrideEnd(e.target.value)}/></label>
      <select style={field} value={overrideState} onChange={e=>setOverrideState(e.target.value as "AVAILABLE"|"BUSY")}>
        <option value="BUSY">Mark busy</option><option value="AVAILABLE">Override as available</option>
      </select>
      <button style={button} onClick={()=>void run(async()=>{await api.addManualOverride(iso(overrideStart),iso(overrideEnd),overrideState);setOverrides(await api.manualOverrides(new Date().toISOString(),new Date(Date.now()+31*86400000).toISOString()));},"Manual override saved")}>Save override</button>
      <button style={button} onClick={()=>void run(async()=>setOverrides(await api.manualOverrides(new Date().toISOString(),new Date(Date.now()+31*86400000).toISOString())),"Loaded overrides")}>List overrides</button>
      {overrides.map(o=><p key={o.id}>{o.status}: {local(o.start)} – {local(o.end)}
        <button style={button} onClick={()=>void run(async()=>{await api.removeManualOverride(o.id);setOverrides(overrides.filter(x=>x.id!==o.id));},"Override removed")}>Delete</button>
      </p>)}
    </section>}
    {tab==="notifications"&&<section style={card}><h2>Notifications</h2>
      <button style={button} onClick={()=>void run(async()=>setNotifications(await api.notifications()),"Refreshed")}>Refresh</button>
      {notifications.map(n=><p key={n.id}><strong>{n.category}</strong>: {n.message} ({local(n.createdAt)})
        {!n.readAt&&<button style={button} onClick={()=>void run(async()=>{await api.markNotificationRead(n.id);setNotifications(await api.notifications());},"Read")}>Mark read</button>}
      </p>)}
    </section>}
    {tab==="account"&&<section style={card}><h2>Account settings</h2>
      <label>Name <input style={field} value={profileName||user.name} onChange={e=>setProfileName(e.target.value)}/></label>
      <label>Time zone <input style={field} value={profileZone||user.timeZone} onChange={e=>setProfileZone(e.target.value)}/></label>
      <button style={button} onClick={()=>void run(async()=>setUser(await api.updateProfile(profileName,profileZone)),"Profile updated")}>Save profile</button>
      <h3>Email</h3><p>Current email: {user.email}. To update it, use <code>api.changeEmail(newEmail, currentPassword)</code> in your account form.</p>
      <h3>Change password</h3>
      <input style={field} type="password" placeholder="Current password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/>
      <input style={field} type="password" placeholder="New password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
      <button style={button} onClick={()=>void run(async()=>{await api.changePassword(oldPassword,newPassword);setOldPassword("");setNewPassword("");},"Password changed")}>Change password</button>
    </section>}
  </main>;
}
