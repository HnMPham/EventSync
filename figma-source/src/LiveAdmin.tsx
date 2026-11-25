import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import type { AdminGroup, AdminSummary, AdminUser, SupportRequest, Publisher } from './lib/eventsync-api';

const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-50';
const field = 'rounded-lg border border-slate-300 bg-white text-slate-900 p-2 text-sm w-full';
const failure = (err:unknown) => err instanceof Error ? err.message : String(err);

export function LiveAdmin() {
  const [summary,setSummary]=useState<AdminSummary|null>(null);
  const [groups,setGroups]=useState<AdminGroup[]>([]);
  const [users,setUsers]=useState<AdminUser[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [addId,setAddId]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [working,setWorking]=useState(false);
  const [userNumbers,setUserNumbers]=useState<Record<string,string>>({});
  const [inbox,setInbox]=useState<SupportRequest[]>([]);
  const [ticketKindFilter,setTicketKindFilter]=useState<'ALL'|'ISSUE'|'REQUEST'>('ALL');
  const [ticketStatusFilter,setTicketStatusFilter]=useState<'ALL'|'OPEN'|'IN_PROGRESS'|'RESOLVED'|'REJECTED'>('ALL');
  const [publishers,setPublishers]=useState<Publisher[]>([]);
  const [orgNames,setOrgNames]=useState<Record<string,string>>({});
  const refresh=useCallback(async()=>{
    const [s,g,u]=await Promise.all([api.adminSummary(),api.adminGroups(),api.adminUsers()]);
    setSummary(s);setGroups(g);setUsers(u);
    setUserNumbers(prev=>Object.fromEntries(u.map(person=>[person.id,prev[person.id]??String(person.discriminator)])));
    const [tickets,accounts]=await Promise.all([api.adminSupport(),api.publishers()]);
    setInbox(tickets);setPublishers(accounts);
    setOrgNames(previous=>Object.fromEntries(accounts.map(account=>[account.id,previous[account.id]??account.organizationName??''])));
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(failure(e)))},[refresh]);
  const visibleTickets=inbox.filter(ticket=>(ticketKindFilter==='ALL'||ticket.kind===ticketKindFilter)&&(ticketStatusFilter==='ALL'||ticket.status===ticketStatusFilter));
  const group=groups.find(g=>g.id===selected);
  useEffect(()=>{if(group){setName(group.name);setDescription(group.description)}},[group?.id,group?.name,group?.description]);
  const run=async(task:()=>Promise<unknown>,notice:string)=>{
    setWorking(true);setError('');setMessage('');
    try {await task();await refresh();setMessage(notice)}catch(e){setError(failure(e))}finally{setWorking(false)}
  };
  return <section className="h-full overflow-y-auto space-y-5 p-2" style={{color:'var(--color-lagoon)'}}>
    <div><h2 className="text-2xl font-bold">System Administration</h2><p className="text-sm">Manage groups and memberships across EventSync. All changes are stored in MySQL.</p></div>
    {error&&<div role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</div>}
    {message&&<div role="status" className="rounded-lg bg-green-50 p-3 text-green-900">{message}</div>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {([['Registered users',summary?.users],['Groups',summary?.groups],['Events',summary?.events],['Pending invitations',summary?.pendingInvitations]] as const).map(([label,value])=>
        <div className="bg-white rounded-xl border p-4" key={label}><div className="text-xs opacity-70">{label}</div><div className="text-2xl font-bold">{value??'...'}</div></div>)}
    </div>
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <h3 className="font-bold">User account management</h3>
      <p className="text-xs opacity-70">Edit the public username#number (not the internal account UUID). Account deletion is permanent and removes meetings, public events, and groups owned by that account.</p>
      {users.length===0?<p className="text-sm">No users found.</p>:users.map(person=><div key={person.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3 text-sm">
        <div className="min-w-44 flex-1"><div className="font-semibold">{person.name} {person.systemAdmin&&<span className="text-xs">· System admin</span>}</div><div className="text-xs opacity-70 break-all">{person.email} · {person.username}#{String(person.discriminator).padStart(6,'0')}</div></div>
        <label className="text-xs">Public ID #
          <input aria-label={`Public ID number for ${person.name}`} className={`${field} w-28 block`} type="number" min={1} max={999999} step={1} value={userNumbers[person.id]??String(person.discriminator)} onChange={e=>setUserNumbers(prev=>({...prev,[person.id]:e.target.value}))}/>
        </label>
        <button className={button} disabled={working||!/^\d+$/.test(userNumbers[person.id]??'')||Number(userNumbers[person.id])<1||Number(userNumbers[person.id])>999999||Number(userNumbers[person.id])===person.discriminator} onClick={()=>void run(()=>api.adminChangeUserNumber(person.id,Number(userNumbers[person.id])),'Public ID updated')}>Save ID</button>
        <button className={`${button} text-red-800 border-red-300`} disabled={working} onClick={()=>{
          if(window.confirm(`PERMANENTLY delete ${person.name} (${person.email})? Their owned events, announcements and groups will also be deleted. This cannot be undone.`))
            void run(()=>api.adminDeleteUser(person.id),'Account deleted');
        }}>Delete account</button>
      </div>)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex justify-between items-center"><h3 className="font-bold">All Groups</h3><button className={button} onClick={()=>void refresh().catch(e=>setError(failure(e)))}>Refresh</button></div>
        {groups.length===0?<p className="text-sm opacity-70">No groups found.</p>:groups.map(g=><button key={g.id} onClick={()=>setSelected(g.id)}
          className={`w-full text-left p-3 border rounded-lg ${selected===g.id?'bg-indigo-50 border-indigo-400':'hover:bg-slate-50'}`}>
          <div className="font-semibold">{g.name}</div><div className="text-xs opacity-70">Owner: {g.ownerName} · {g.members.length} members · {g.eventCount} events</div>
        </button>)}
      </div>
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold">{group?`Manage ${group.name}`:'Select a group'}</h3>
        {group&&<>
          <label className="block text-sm">Name<input className={field} value={name} onChange={e=>setName(e.target.value)}/></label>
          <label className="block text-sm">Description<textarea className={field} value={description} onChange={e=>setDescription(e.target.value)}/></label>
          <button className={button} disabled={working||!name.trim()} onClick={()=>void run(()=>api.adminUpdateGroup(group.id,name,description),'Group updated')}>Save changes</button>
          <h4 className="font-semibold pt-2">Members</h4>
          {group.members.map(m=><div key={m.id} className="flex justify-between gap-2 border rounded-lg p-2 items-center text-sm">
            <div className="min-w-0"><div className="font-medium truncate">{m.name}</div><div className="text-xs opacity-70 truncate">{m.email}{m.id===group.ownerId?' · Owner':''}</div></div>
            {m.id===group.ownerId?<span className="text-xs">Owner</span>:<div className="flex gap-1 items-center">
              <select className="border rounded p-1 bg-white" disabled={working} value={m.role} onChange={e=>void run(()=>api.adminChangeMemberRole(group.id,m.id,e.target.value as 'ADMIN'|'MEMBER'),'Member role updated')}>
                <option value="MEMBER">Member</option><option value="ADMIN">Group admin</option>
              </select>
              <button className={button} disabled={working} onClick={()=>{if(window.confirm(`Remove ${m.name} from ${group.name}?`))void run(()=>api.adminRemoveMember(group.id,m.id),'Member removed')}}>Remove</button>
            </div>}
          </div>)}
          <label className="block text-sm">Add registered user
            <select className={field} value={addId} onChange={e=>setAddId(e.target.value)}><option value="">Select a user</option>{users.filter(u=>!group.members.some(m=>m.id===u.id)).map(u=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select>
          </label>
          <button className={button} disabled={working||!addId} onClick={()=>void run(async()=>{await api.adminAddMember(group.id,addId);setAddId('')},'Member added')}>Add member</button>
          <div className="border-t pt-3"><button className={`${button} text-red-800`} disabled={working} onClick={()=>{if(window.confirm(`Permanently delete group ${group.name}? Its events will remain but be detached from the group.`))void run(async()=>{await api.adminDeleteGroup(group.id);setSelected(null)},'Group deleted')}}>Delete group</button></div>
        </>}
      </div>
    </div>
    <div className="bg-white rounded-xl border p-4 space-y-3"><h3 className="font-bold">Issue reports and requests ({inbox.filter(x=>x.status==='OPEN').length} open)</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm flex-1 min-w-36 max-w-60">Type
          <select aria-label="Filter submissions by type" className={field} value={ticketKindFilter} onChange={e=>setTicketKindFilter(e.target.value as typeof ticketKindFilter)}>
            <option value="ALL">All types</option><option value="ISSUE">Issue reports</option><option value="REQUEST">Requests</option>
          </select>
        </label>
        <label className="block text-sm flex-1 min-w-36 max-w-60">Status
          <select aria-label="Filter submissions by status" className={field} value={ticketStatusFilter} onChange={e=>setTicketStatusFilter(e.target.value as typeof ticketStatusFilter)}>
            <option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="REJECTED">Rejected</option>
          </select>
        </label>
        <button className={button} disabled={ticketKindFilter==='ALL'&&ticketStatusFilter==='ALL'} onClick={()=>{setTicketKindFilter('ALL');setTicketStatusFilter('ALL')}}>Clear filters</button>
      </div>
      <p className="text-xs opacity-70" role="status">Showing {visibleTickets.length} of {inbox.length} submissions</p>
      {inbox.length===0?<p className="text-sm">No submissions yet.</p>:visibleTickets.length===0?<p className="text-sm">No submissions match these filters.</p>:visibleTickets.map(ticket=><div key={ticket.id} className="border rounded-lg p-3 space-y-2 text-sm">
        <div><strong>{ticket.subject}</strong> · {ticket.kind} · {ticket.status} · {ticket.email}</div>
        <p className="whitespace-pre-wrap">{ticket.description}</p>
        <div className="flex flex-wrap gap-2"><select aria-label={`Status for ${ticket.subject}`} className={field} style={{maxWidth:170}} value={ticket.status} disabled={working} onChange={e=>void run(()=>api.reviewSupport(ticket.id,e.target.value,ticket.adminReply||''),'Ticket updated')}>
          {['OPEN','IN_PROGRESS','RESOLVED','REJECTED'].map(s=><option key={s}>{s}</option>)}
        </select><button className={button} disabled={working} onClick={()=>{const reply=window.prompt('Admin reply (visible to submitter)',ticket.adminReply||'');if(reply!==null)void run(()=>api.reviewSupport(ticket.id,ticket.status,reply),'Reply saved')}}>Reply</button></div>
        {ticket.adminReply&&<p>Reply: {ticket.adminReply}</p>}
      </div>)}
    </div>
    <div className="bg-white rounded-xl border p-4 space-y-3"><h3 className="font-bold">Organization publisher approvals</h3>
      <p className="text-xs opacity-70">Publishers may create and edit their own public events but cannot manage users, other publishers, or the system dashboard.</p>
      {publishers.map(u=><div key={u.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-2 text-sm">
        <span className="min-w-40">{u.name} ({u.email})</span>
        <input aria-label={`Organization for ${u.name}`} className={field} style={{maxWidth:220}} maxLength={160} value={orgNames[u.id]??''} onChange={e=>setOrgNames(prev=>({...prev,[u.id]:e.target.value}))} placeholder="Organization name"/>
        <button className={button} disabled={working||!orgNames[u.id]?.trim()} onClick={()=>void run(()=>api.setPublisher(u.id,true,orgNames[u.id]),'Publisher approved')}>{u.approved?'Update organization':'Approve publisher'}</button>
        {u.approved&&<button className={button} disabled={working} onClick={()=>void run(()=>api.setPublisher(u.id,false,''),'Publisher revoked')}>Revoke</button>}
      </div>)}
    </div>
    <div className="bg-white rounded-xl border p-4"><h3 className="font-bold mb-3">Registered Users ({users.length})</h3>
      <div className="max-h-64 overflow-y-auto space-y-2">{users.map(u=><div className="flex justify-between gap-2 text-sm border-b py-1" key={u.id}>
        <span>{u.name} <span className="opacity-60">({u.email})</span></span>
        <span className="text-xs">{u.systemAdmin?'System admin · ':''}{u.groupCount} groups</span>
      </div>)}</div>
      <p className="mt-2 text-xs opacity-70">System administrator privileges can only be assigned from the server, not from this page.</p>
    </div>
  </section>;
}
