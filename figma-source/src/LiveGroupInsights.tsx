import {useEffect,useState} from 'react';
import {api} from './lib/api';
import type {AttendanceMark,GroupInsights} from './lib/eventsync-api';
const button='border rounded-lg bg-white px-2 py-1 text-sm disabled:opacity-50';
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
export function LiveGroupInsights({groupId}:{groupId:string}){
 const [data,setData]=useState<GroupInsights|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [roster,setRoster]=useState<AttendanceMark[]>([]),[problem,setProblem]=useState(''),[working,setWorking]=useState(false);
 const reload=async()=>setData(await api.groupInsights(groupId));
 useEffect(()=>{setSelected(null);setRoster([]);void reload().catch(e=>setProblem(err(e)))},[groupId]);
 const select=async(id:string)=>{setProblem('');setSelected(id);try{setRoster(await api.groupAttendance(groupId,id))}catch(e){setProblem(err(e))}};
 const change=async(userId:string,status:'PRESENT'|'ABSENT'|null)=>{if(!selected)return;setWorking(true);setProblem('');try{setRoster(status?await api.markAttendance(groupId,selected,userId,status):await api.clearAttendance(groupId,selected,userId));await reload()}catch(e){setProblem(err(e))}finally{setWorking(false)}};
 return <div className="space-y-4 border-t pt-4"><div><h3 className="font-bold text-lg">Group Insights</h3><p className="text-xs opacity-70">Only group admins can view these statistics. Attendance is verified manually after meetings, not inferred from invitations.</p></div>
 {problem&&<div role="alert" className="text-red-800 bg-red-50 p-2 rounded">{problem}</div>}
 {data?<><div className="grid grid-cols-2 gap-2">{[['Members',data.totalMembers],['Completed events',data.pastEvents],['Verified records',data.verifiedMarks],['Attendance rate',data.verifiedMarks?`${data.attendanceRate}%`:'Not available']].map(([k,v])=><div className="border p-2 rounded-lg bg-slate-50" key={k}><p className="text-xs opacity-70">{k}</p><p className="font-bold">{v}</p></div>)}</div>
 <h4 className="font-semibold">Member attendance</h4><div className="overflow-x-auto"><table className="text-xs w-full text-left"><thead><tr><th>Name</th><th>Attended</th><th>Verified rate</th><th>Last attended</th></tr></thead><tbody>{data.members.map(m=><tr key={m.userId} className="border-t"><td className="py-2">{m.name}</td><td>{m.present}/{m.verified}</td><td>{m.verified?`${m.attendanceRate}%`:'N/A'}</td><td>{m.lastAttended?new Date(m.lastAttended).toLocaleDateString():'Never recorded'}</td></tr>)}</tbody></table></div>
 <h4 className="font-semibold">Completed group events</h4><div className="max-h-40 overflow-y-auto space-y-1">{data.events.length===0?<p className="text-sm opacity-70">No completed events to verify yet.</p>:data.events.map(event=><button className={`${button} w-full text-left`} key={event.id} onClick={()=>void select(event.id)}>{event.title} · {new Date(event.start).toLocaleDateString()} · {event.markedPresent} present, {event.markedAbsent} absent{selected===event.id?' ✓':''}</button>)}</div>
 {selected&&<div className="space-y-2"><h4 className="font-semibold">Mark attendance</h4>{roster.map(m=><div key={m.userId} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-2 text-xs"><span>{m.name} {m.response?`(${m.response.toLowerCase()})`:'(organizer)'}</span><div className="flex gap-1"><button disabled={working} className={`${button} ${m.status==='PRESENT'?'bg-green-100':''}`} onClick={()=>void change(m.userId,'PRESENT')}>Present</button><button disabled={working} className={`${button} ${m.status==='ABSENT'?'bg-rose-100':''}`} onClick={()=>void change(m.userId,'ABSENT')}>Absent</button><button disabled={working||!m.status} className={button} onClick={()=>void change(m.userId,null)}>Clear</button></div></div>)}</div>}
 </>:<p className="text-sm">Loading insights…</p>}</div>
}
