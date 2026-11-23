import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { LiveGroupInsights } from './LiveGroupInsights';
import type { Group, User } from './lib/eventsync-api';

const errorMessage=(err:unknown)=>err instanceof Error?err.message:String(err);
const btn='rounded-xl border px-3 py-2 text-sm font-semibold hover:opacity-80 disabled:opacity-40';
const inp='w-full rounded-lg border p-2 text-sm text-slate-900 bg-white';

export function LiveGroupManager({groupId,user,onClose,onUpdated}:{groupId:string;user:User;onClose:()=>void;onUpdated:()=>Promise<void>}) {
 const [group,setGroup]=useState<Group|null>(null);
 const [name,setName]=useState('');
 const [description,setDescription]=useState('');
 const [query,setQuery]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [working,setWorking]=useState(false);
 const refresh=async()=>{const g=await api.group(groupId);setGroup(g);setName(g.name);setDescription(g.description||'');};
 useEffect(()=>{void refresh().catch(err=>setError(errorMessage(err)))},[groupId]);
 const run=async(fn:()=>Promise<unknown>,close=false)=>{
   setWorking(true);setError('');setNotice('');
   try{await fn();await onUpdated();if(close)onClose();else await refresh();}
   catch(err){setError(errorMessage(err))}finally{setWorking(false)}
 };
 const invite=()=>run(async()=>{
   if(query.trim().length<3)throw Error('Enter at least three characters to find an existing EventSync user.');
   const results=await api.searchUsers(query);
   if(results.length===0)throw Error('No registered user was found.');
   if(results.length>1)throw Error('Multiple users matched. Enter a longer name or their complete email.');
   await api.addGroupMember(groupId,results[0].id);setQuery('');setNotice(`${results[0].name} added.`);
 });
 const admin=group?.myRole==='ADMIN';
 return <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-8 overflow-y-auto" style={{background:'rgba(26,32,60,.45)'}}>
  <div className="bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl space-y-4 shadow-xl" style={{color:'var(--color-lagoon)',border:'2px solid var(--color-lagoon-600)'}}>
   <div className="flex justify-between items-start"><div><h2 className="font-bold text-lg">Manage Group</h2><p className="text-xs opacity-70">Changes are saved to the EventSync database.</p></div><button className={btn} onClick={onClose}>Close</button></div>
   {error&&<p role="alert" className="text-sm bg-red-50 text-red-900 rounded-lg p-2">{error}</p>}
   {notice&&<p role="status" className="text-sm bg-green-50 text-green-900 rounded-lg p-2">{notice}</p>}
   {group? <>
     <label className="block text-sm font-semibold">Group name<input className={inp} value={name} disabled={!admin} onChange={e=>setName(e.target.value)}/></label>
     <label className="block text-sm font-semibold">Description<textarea className={inp} rows={2} value={description} disabled={!admin} onChange={e=>setDescription(e.target.value)}/></label>
     {admin&&<button disabled={working||!name.trim()} className={btn} onClick={()=>void run(()=>api.updateGroup(groupId,name,description))}>Save Group Details</button>}
     <div><h3 className="font-semibold">Members ({group.members.length})</h3>
       <div className="space-y-2 mt-2">{group.members.map(member=><div key={member.user.id} className="flex justify-between items-center border rounded-lg p-2 gap-2">
         <div className="text-sm"><p className="font-semibold">{member.user.name} {member.user.id===user.id?'(you)':''}</p><p className="text-xs opacity-70">{member.role}{group.ownerId===member.user.id?' · Owner':''}</p></div>
         {admin&&member.user.id!==group.ownerId&&<div className="flex flex-wrap gap-1">
           <select className="border rounded p-1 text-xs" aria-label={`Role for ${member.user.name}`} disabled={working} value={member.role} onChange={e=>void run(()=>api.setGroupMemberRole(groupId,member.user.id,e.target.value as 'ADMIN'|'MEMBER'))}>
              <option value="MEMBER">Member</option><option value="ADMIN">Admin</option>
           </select>
           <button className={`${btn} text-red-800`} disabled={working} onClick={()=>void run(()=>api.removeGroupMember(groupId,member.user.id))}>Remove</button>
         </div>}
       </div>)}</div>
     </div>
     {admin&&<div className="border rounded-lg p-3 space-y-2"><h3 className="font-semibold">Add a registered member</h3>
       <input className={inp} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Full name or email"/>
       <button className={btn} disabled={working} onClick={()=>void invite()}>Add Member</button>
     </div>}
     {admin&&<LiveGroupInsights groupId={groupId}/>}
     <div className="flex justify-end gap-2 border-t pt-3">
       {group.ownerId===user.id?<button className={`${btn} text-red-800`} disabled={working} onClick={()=>{if(window.confirm(`Delete ${group.name} and its membership records?`))void run(()=>api.deleteGroup(groupId),true)}}>Delete Group</button>
       :<button className={`${btn} text-red-800`} disabled={working} onClick={()=>void run(()=>api.removeGroupMember(groupId,user.id),true)}>Leave Group</button>}
     </div>
   </>:<p className="text-sm">Loading group…</p>}
  </div>
 </div>
}
