import { useState } from 'react';
import { api } from './lib/api';
import type { User } from './lib/eventsync-api';
const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const inp='w-full rounded-lg border bg-white p-2 text-sm';
const btn='rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90';
export function LiveProfile({user,onClose,onUpdated}:{user:User;onClose:()=>void;onUpdated:(user:User)=>void}) {
 const [name,setName]=useState(user.name);
 const [timeZone,setTimeZone]=useState(user.timeZone);
 const [newEmail,setNewEmail]=useState(user.email);
 const [emailPassword,setEmailPassword]=useState('');
 const [oldPassword,setOldPassword]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 const run=async(action:()=>Promise<unknown>,message:string)=>{
  setWorking(true);setNotice('');setError('');
  try{await action();setNotice(message)}catch(e){setError(errorText(e))}finally{setWorking(false)}
 };
 return <div className="fixed inset-0 z-50 flex justify-center items-center p-3" style={{background:'rgba(31,38,64,.5)'}}>
   <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl p-6 space-y-5" style={{color:'var(--color-lagoon)',border:'2px solid var(--color-lagoon-600)'}}>
    <div className="flex justify-between"><h2 className="text-lg font-bold">Account Settings</h2><button className={btn} onClick={onClose}>Close</button></div>
    {error&&<p role="alert" className="text-sm p-2 bg-red-50 text-red-900 rounded-lg">{error}</p>}
    {notice&&<p role="status" className="text-sm p-2 bg-green-50 text-green-900 rounded-lg">{notice}</p>}
    <div className="space-y-2"><h3 className="font-semibold">Profile</h3>
      <label className="text-sm block">Display name<input value={name} onChange={e=>setName(e.target.value)} className={inp}/></label>
      <label className="text-sm block">Time zone<input value={timeZone} onChange={e=>setTimeZone(e.target.value)} className={inp} placeholder="America/Chicago"/></label>
      <button disabled={working} className={btn} onClick={()=>void run(async()=>onUpdated(await api.updateProfile(name,timeZone)),'Profile updated.')}>Save Profile</button>
    </div>
    <div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Change email</h3>
      <input aria-label="New email" value={newEmail} type="email" className={inp} onChange={e=>setNewEmail(e.target.value)}/>
      <input aria-label="Current password for email change" type="password" placeholder="Current password" className={inp} value={emailPassword} onChange={e=>setEmailPassword(e.target.value)}/>
      <button disabled={working||!emailPassword} className={btn} onClick={()=>void run(async()=>{onUpdated(await api.changeEmail(newEmail,emailPassword));setEmailPassword('')},'Email updated.')}>Update Email</button>
    </div>
    <div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Change password</h3>
      <input aria-label="Current password" type="password" placeholder="Current password" className={inp} value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/>
      <input aria-label="New password" type="password" placeholder="New password" className={inp} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
      <button disabled={working||!oldPassword||!newPassword} className={btn} onClick={()=>void run(async()=>{await api.changePassword(oldPassword,newPassword);setOldPassword('');setNewPassword('')},'Password changed.')}>Change Password</button>
    </div>
   </div>
 </div>;
}
