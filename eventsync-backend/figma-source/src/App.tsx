import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { UserRound, UsersRound } from "lucide-react";
import { LiveScheduling } from "./LiveScheduling";
import { LiveGroupManager } from "./LiveGroups";
import { LiveProfile } from "./LiveProfile";
import { api } from "./lib/api";
import type { User as ApiUser, Event as ApiEvent, Friend as ApiFriend, Group as ApiGroup, Poll, PollRecommendation, Notification as ApiNotification } from "./lib/eventsync-api";

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dateYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase() || '').join('');
const mappedFriend = (f: ApiFriend, index: number): Friend => ({
  id:f.user.id, name:f.user.name, initials:initialsOf(f.user.name), status:"unknown", availability:[], colorIdx:index
});
const mappedGroup = (g: ApiGroup): Group => ({
  id:g.id, name:g.name, createdAt:"", useExistingDates:false, commonBlocks:[],
  members:g.members.map((m,index) => ({
    id:m.user.id, name:m.user.name, initials:initialsOf(m.user.name), colorIdx:index, status:"unknown", availability:[]
  }))
});
const mappedInvitation = (e: ApiEvent): Invitation => ({
  id:e.id, title:e.title, date:dateYMD(new Date(e.start)),
  time:new Date(e.start).toLocaleTimeString("en-US", {hour12:false,hour:"2-digit",minute:"2-digit"}),
  location:e.location, organizer:"Event organizer", attendees:e.guests.map(g=>g.user.name), description:e.description
});
const mappedEvent = (e: ApiEvent): Event => ({
  id:e.id, title:e.title, date:dateYMD(new Date(e.start)),
  time:new Date(e.start).toLocaleTimeString("en-US", {hour12:false, hour:"2-digit", minute:"2-digit"}),
  location:e.location, organizer:e.myResponse==="ORGANIZER"?"me":"EventSync organizer", attendees:e.guests.map(g=>g.user.name),
  description:e.description, type:e.myResponse==="ORGANIZER"?"organized":"attending"
});


// ─── Theme system ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
}
function generateScale(base: string): Record<string,string> {
  const [r,g,b] = hexToRgb(base);
  const mix = (f: number): [number,number,number] => {
    const bg = f > 0 ? 255 : 0; const a = Math.abs(f);
    return [r+(bg-r)*a, g+(bg-g)*a, b+(bg-b)*a];
  };
  return {
    "--color-lagoon-700": rgbToHex(...mix(-0.45)),
    "--color-lagoon-600": rgbToHex(...mix(-0.28)),
    "--color-lagoon":     base,
    "--color-lagoon-400": rgbToHex(...mix(0.25)),
    "--color-lagoon-300": rgbToHex(...mix(0.45)),
    "--color-lagoon-200": rgbToHex(...mix(0.62)),
    "--color-lagoon-100": rgbToHex(...mix(0.78)),
    "--color-lagoon-50":  rgbToHex(...mix(0.90)),
  };
}

interface PresetTheme { id: string; name: string; emoji: string; swatch: string; vars: Record<string,string>; }
const PRESET_THEMES: PresetTheme[] = [
  { id:"indigo", name:"Indigo", emoji:"💜", swatch:"#525B98",
    vars:{ "--color-lagoon-700":"#2A3168","--color-lagoon-600":"#3D4580","--color-lagoon":"#525B98",
           "--color-lagoon-400":"#7179B0","--color-lagoon-300":"#9297E8","--color-lagoon-200":"#B4B8F2",
           "--color-lagoon-100":"#D4D6F8","--color-lagoon-50":"#EDEEF8" } },
  { id:"ocean", name:"Ocean", emoji:"🌊", swatch:"#1E7A8A",
    vars:{ "--color-lagoon-700":"#0D4A58","--color-lagoon-600":"#155E70","--color-lagoon":"#1E7A8A",
           "--color-lagoon-400":"#3A96A8","--color-lagoon-300":"#60B4C4","--color-lagoon-200":"#92CDD6",
           "--color-lagoon-100":"#C0E5EA","--color-lagoon-50":"#E5F5F7" } },
  { id:"forest", name:"Forest", emoji:"🌿", swatch:"#2D6A4F",
    vars:{ "--color-lagoon-700":"#163D2E","--color-lagoon-600":"#225240","--color-lagoon":"#2D6A4F",
           "--color-lagoon-400":"#4D8A6E","--color-lagoon-300":"#6EAA8E","--color-lagoon-200":"#95C9B0",
           "--color-lagoon-100":"#C0E3D2","--color-lagoon-50":"#E5F4EE" } },
  { id:"rose", name:"Rose", emoji:"🌸", swatch:"#8B3A52",
    vars:{ "--color-lagoon-700":"#5A1E30","--color-lagoon-600":"#742840","--color-lagoon":"#8B3A52",
           "--color-lagoon-400":"#A85870","--color-lagoon-300":"#C4788C","--color-lagoon-200":"#D9A0AE",
           "--color-lagoon-100":"#EDCAD2","--color-lagoon-50":"#FAECF0" } },
  { id:"midnight", name:"Midnight", emoji:"🌙", swatch:"#1E2A5E",
    vars:{ "--color-lagoon-700":"#0C1230","--color-lagoon-600":"#141E48","--color-lagoon":"#1E2A5E",
           "--color-lagoon-400":"#3A4880","--color-lagoon-300":"#5E6CA8","--color-lagoon-200":"#8E98C8",
           "--color-lagoon-100":"#BFC4E0","--color-lagoon-50":"#E4E6F4" } },
  { id:"plum", name:"Plum", emoji:"🍇", swatch:"#6B3FA0",
    vars:{ "--color-lagoon-700":"#3E1E68","--color-lagoon-600":"#542D84","--color-lagoon":"#6B3FA0",
           "--color-lagoon-400":"#8860B8","--color-lagoon-300":"#A882CC","--color-lagoon-200":"#C4A8E0",
           "--color-lagoon-100":"#DDD0EF","--color-lagoon-50":"#F1EDF9" } },
  { id:"ember", name:"Ember", emoji:"🔥", swatch:"#A0432A",
    vars:{ "--color-lagoon-700":"#622314","--color-lagoon-600":"#822F1C","--color-lagoon":"#A0432A",
           "--color-lagoon-400":"#BC6448","--color-lagoon-300":"#D4896C","--color-lagoon-200":"#E5B09C",
           "--color-lagoon-100":"#F0D0C4","--color-lagoon-50":"#FAF0EC" } },
  { id:"slate", name:"Slate", emoji:"🩶", swatch:"#445566",
    vars:{ "--color-lagoon-700":"#243040","--color-lagoon-600":"#324455","--color-lagoon":"#445566",
           "--color-lagoon-400":"#607080","--color-lagoon-300":"#809098","--color-lagoon-200":"#A4B0B8",
           "--color-lagoon-100":"#C8D0D8","--color-lagoon-50":"#E8ECED" } },
];

function applyThemeVars(vars: Record<string,string>) {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k,v]) => root.style.setProperty(k,v));
}

// ─── Friend colour palette ────────────────────────────────────────────────────
const FRIEND_PALETTE = [
  { bg: "#C8EEF5", text: "#1A6A7A", dot: "#59C2B3", border: "#59C2B3",  label: "Teal"    },
  { bg: "#E0E2F8", text: "#2A2F6A", dot: "#9297E8", border: "#9297E8",  label: "Lavender"},
  { bg: "#FFD9EF", text: "#7A1A4A", dot: "#E070AA", border: "#F5A6CD",  label: "Pink"    },
  { bg: "#C8F0E5", text: "#1A5A45", dot: "#3E9888", border: "#9BE3CE",  label: "Mint"    },
  { bg: "#FFFBD0", text: "#5A4A10", dot: "#C4A800", border: "#FFF59D",  label: "Yellow"  },
];
const fp = (idx: number) => FRIEND_PALETTE[idx % FRIEND_PALETTE.length];

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen  = "auth" | "dashboard" | "mgmt";
type AuthMode = "login" | "signup";
type Tab     = "calendar" | "events" | "friends" | "groups" | "schedule";

interface Friend {
  id: string; name: string; initials: string;
  status: "online" | "offline" | "unknown"; availability: string[];
  colorIdx: number;
}
interface Event {
  id: string; title: string; date: string; time: string;
  location: string; organizer: string; attendees: string[];
  description: string; type: "organized" | "attending";
}
interface Invitation {
  id: string; title: string; date: string; time: string;
  location: string; organizer: string; attendees: string[]; description: string;
}
interface FriendRequest { id: string; name: string; initials: string; mutualFriends: number; colorIdx: number; }
interface Group {
  id: string; name: string; members: Friend[];
  useExistingDates: boolean; commonBlocks: string[]; createdAt: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 (midnight) → 23 (11 PM)

// The exported Figma prototype contained hard-coded sample friends, events, and invitations.
// Connected screens load all such records from the Java/MySQL API instead.
const INITIAL_FRIENDS: Friend[] = [];
const INITIAL_EVENTS: Event[] = [];
const INITIAL_INVITATIONS: Invitation[] = [];
const INITIAL_FRIEND_REQUESTS: FriendRequest[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const blockKey = (day: string, hour: number) => `${day}-${hour.toString().padStart(2,"0")}`;

const formatHour = (h: number) => {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return `${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;
};

const formatDate = (ds: string) =>
  new Date(ds + "T00:00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });

function getMonday(offset: number): Date {
  const t = new Date(); const d = t.getDay();
  const m = new Date(t); m.setDate(t.getDate() + (d===0?-6:1-d) + offset*7); m.setHours(0,0,0,0);
  return m;
}
const getWeekDates = (offset: number) =>
  Array.from({ length:7 }, (_,i) => { const d = new Date(getMonday(offset)); d.setDate(d.getDate()+i); return d; });

const formatWeekRange = (dates: Date[]) => {
  const o: Intl.DateTimeFormatOptions = { month:"short", day:"numeric" };
  return `${dates[0].toLocaleDateString("en-US",o)} – ${dates[6].toLocaleDateString("en-US",o)}, ${dates[0].getFullYear()}`;
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
function FriendAvatar({ friend, size="md" }: { friend: Friend; size?: "sm"|"md"|"lg" }) {
  const c = fp(friend.colorIdx);
  const sz = size==="sm" ? "w-7 h-7 text-xs" : size==="lg" ? "w-11 h-11 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
      style={{ backgroundColor: c.bg, color: c.text, border: `2px solid ${c.border}` }}>
      {friend.initials}
    </div>
  );
}

function PlainAvatar({ initials, colorIdx, size="md" }: { initials:string; colorIdx:number; size?:"sm"|"md"|"lg" }) {
  const c = fp(colorIdx);
  const sz = size==="sm" ? "w-7 h-7 text-xs" : size==="lg" ? "w-11 h-11 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
      style={{ backgroundColor: c.bg, color: c.text, border: `2px solid ${c.border}` }}>
      {initials}
    </div>
  );
}

function StatusDot({ status }: { status:"online"|"offline"|"unknown" }) {
  return <span className="w-2 h-2 rounded-full flex-shrink-0"
    style={{ backgroundColor: status==="online" ? "#59C2B3" : "#C4B8D8" }} />;
}

function EmptyState({ icon, title, desc }: { icon:string; title:string; desc:string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="text-4xl mb-2">{icon}</div>
      <p className="font-semibold" style={{ color:"var(--color-lagoon)" }}>{title}</p>
      <p className="text-sm mt-1" style={{ color:"var(--color-misty-400)" }}>{desc}</p>
    </div>
  );
}

// ─── Retro Window Chrome ──────────────────────────────────────────────────────
function RetroWindow({ title, children, className="", style={} }:
  { title:string; children:React.ReactNode; className?:string; style?:React.CSSProperties }) {
  return (
    <div className={`flex flex-col overflow-hidden ${className}`}
      style={{ borderRadius:16, border:"2.5px solid var(--color-lagoon-600)",
        boxShadow:"4px 4px 0 var(--color-lagoon-600)", ...style }}>
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ backgroundColor:"var(--color-lagoon)", borderBottom:"2.5px solid var(--color-lagoon-600)" }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#F5A6CD" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#FFF59D" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#9BE3CE" }} />
        </div>
        <span className="text-xs font-bold tracking-wide ml-1 truncate"
          style={{ color:"rgba(255,255,255,0.92)", fontFamily:"'DM Sans',sans-serif" }}>
          {title}
        </span>
      </div>
      <div className="flex-1 overflow-hidden" style={{ backgroundColor:"#FDFBFD" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel="Confirm", onConfirm, onCancel, danger=false }:
  { title:string; message:string; confirmLabel?:string; onConfirm:()=>void; onCancel:()=>void; danger?:boolean }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor:"rgba(82,91,152,0.35)", backdropFilter:"blur(4px)" }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-sm p-7"
        style={{ backgroundColor:"var(--color-cream-50)", border:"2.5px solid var(--color-lagoon-600)",
          boxShadow:"5px 5px 0 var(--color-lagoon-600)" }}>
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
            style={{ backgroundColor: danger ? "#FFD9EF" : "var(--color-lagoon-50)",
              border: danger ? "2px solid #F5A6CD" : "2px solid var(--color-lagoon-100)" }}>
            {danger ? "⚠️" : "❓"}
          </div>
          <h2 className="text-lg font-bold mb-1" style={{ color:"var(--color-lagoon)" }}>{title}</h2>
          <p className="text-sm leading-relaxed" style={{ color:"var(--color-lagoon-300)" }}>{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition"
            style={{ borderColor:"var(--color-lagoon-200)", color:"var(--color-lagoon-400)" }}
            onMouseEnter={e=>e.currentTarget.style.backgroundColor="var(--color-lagoon-50)"}
            onMouseLeave={e=>e.currentTarget.style.backgroundColor="transparent"}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition"
            style={{ backgroundColor: danger ? "var(--color-blush)" : "var(--color-lagoon)",
              border: danger ? "2px solid #C0508A" : "2px solid var(--color-lagoon-600)",
              boxShadow: danger ? "2px 2px 0 #C0508A" : "2px 2px 0 var(--color-lagoon-600)" }}
            onMouseEnter={e=>e.currentTarget.style.opacity="0.88"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function Star({ x, y, size=14, color="#9297E8", rot=0 }: { x:number; y:number; size?:number; color?:string; rot?:number }) {
  return (
    <div className="absolute pointer-events-none select-none"
      style={{ left:x, top:y, fontSize:size, color, transform:`rotate(${rot}deg)`, opacity:0.55 }}>✦</div>
  );
}

function AuthScreen({ onLogin }: { onLogin: (mode: AuthMode, email: string, password: string, name: string) => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!email.trim() || !password || (mode === "signup" && !name.trim())) { setAuthError("Enter all required fields."); return; }
    if (mode === "signup" && password !== confirm) { setAuthError("Passwords do not match."); return; }
    setSubmitting(true); setAuthError("");
    try { await onLogin(mode,email.trim(),password,name.trim()); }
    catch (err) { setAuthError(errorMessage(err)); }
    finally { setSubmitting(false); }
  };

  const inp = (val: string, onChange: (v:string)=>void, type="text", placeholder="") => (
    <input type={type} value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition"
      style={{ backgroundColor:"var(--color-misty-100)", border:"2px solid var(--color-misty-200)",
        color:"var(--color-lagoon-700)", fontWeight:500 }} />
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background:"linear-gradient(135deg, #EDF8FC 0%, #FFF9FB 45%, #EEF0F8 100%)" }}>
      <div className="absolute pointer-events-none" style={{ width:340, height:340, borderRadius:"50%", top:-80, left:-100,
        background:"radial-gradient(circle, #BCEAF360 0%, transparent 70%)" }} />
      <div className="absolute pointer-events-none" style={{ width:260, height:260, borderRadius:"50%", bottom:-60, right:-60,
        background:"radial-gradient(circle, #F5A6CD40 0%, transparent 70%)" }} />
      <div className="absolute pointer-events-none" style={{ width:180, height:180, borderRadius:"50%", top:"30%", right:"15%",
        background:"radial-gradient(circle, #9BE3CE35 0%, transparent 70%)" }} />

      <div className="w-full max-w-5xl grid grid-cols-2 overflow-hidden relative z-10"
        style={{ borderRadius:20, border:"2.5px solid var(--color-lagoon-600)",
          boxShadow:"6px 6px 0 var(--color-lagoon-600)" }}>

        <div className="flex flex-col justify-between p-12 relative overflow-hidden"
          style={{ background:"linear-gradient(160deg, var(--color-lagoon) 0%, var(--color-lagoon-700) 100%)" }}>
          <div className="absolute" style={{ width:200, height:200, borderRadius:"50%", top:-60, right:-60,
            border:"24px solid rgba(255,255,255,0.08)" }} />
          <div className="absolute" style={{ width:120, height:120, borderRadius:"50%", bottom:80, left:-30,
            border:"16px solid rgba(255,255,255,0.06)" }} />
          <Star x={30}  y={60}  size={18} color="#FFF59D" rot={10} />
          <Star x={200} y={30}  size={12} color="#9BE3CE" rot={-5} />
          <Star x={80}  y={200} size={10} color="#F5A6CD" rot={20} />
          <Star x={160} y={280} size={16} color="#BCEAF3" rot={-15} />
          <Star x={250} y={180} size={9}  color="#FFF59D" rot={30} />

          <div>
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor:"rgba(255,255,255,0.15)", border:"2px solid rgba(255,255,255,0.2)" }}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white tracking-tight">EventSync</span>
            </div>
            <h1 className="text-3xl font-bold leading-snug text-white mb-3">
              Find the perfect time,<br />every time.
            </h1>
            <p className="text-sm leading-relaxed" style={{ color:"var(--color-misty-200)" }}>
              Coordinate with friends and classmates. See when everyone's free, plan events, and never miss a moment.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon:"🗓️", text:"Visualize group availability at a glance",  color:"#BCEAF3" },
              { icon:"👥", text:"Find the best time for the most people",     color:"#9BE3CE" },
              { icon:"🎉", text:"Manage events and invitations in one place",  color:"#F5A6CD" },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{ backgroundColor:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.1)" }}>
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs font-medium" style={{ color:item.color }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center p-10 relative"
          style={{ backgroundColor:"var(--color-cream-50)" }}>
          <div className="absolute top-4 right-4 flex gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor:"#F5A6CD", border:"1.5px solid var(--color-lagoon-200)" }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor:"#FFF59D", border:"1.5px solid var(--color-lagoon-200)" }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor:"#9BE3CE", border:"1.5px solid var(--color-lagoon-200)" }} />
          </div>
          <Star x={20}  y={20}  size={12} color="#9297E8" rot={15} />
          <Star x={280} y={280} size={10} color="#F5A6CD" rot={-10} />
          <Star x={260} y={40}  size={8}  color="#59C2B3" rot={25} />

          <div className="mb-7 relative z-10">
            <h2 className="text-2xl font-bold mb-1" style={{ color:"var(--color-lagoon)" }}>
              {mode==="login" ? "Welcome back ✦" : "Join EventSync ✦"}
            </h2>
            <p className="text-sm" style={{ color:"var(--color-misty-400)" }}>
              {mode==="login" ? "Sign in to your account" : "Create your free account"}
            </p>
          </div>

          <div className="space-y-3.5 relative z-10">
            {mode==="signup" && (
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Full Name</label>
                {inp(name, setName, "text", "Your name")}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Email</label>
              {inp(email, setEmail, "email", "you@university.edu")}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Password</label>
              {inp(password, setPassword, "password", "••••••••")}
            </div>
            {mode==="signup" && (
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Confirm Password</label>
                {inp(confirm, setConfirm, "password", "••••••••")}
              </div>
            )}
            {mode==="login" && (
              <div className="flex justify-end">
                <button className="text-xs font-semibold hover:underline transition"
                  onClick={() => setAuthError("Password reset by email is not configured. Contact the EventSync administrator.")}
                  style={{ color:"var(--color-blush-300)" }}>Forgot password?</button>
              </div>
            )}
            <button disabled={submitting} onClick={submit}
              className="w-full py-3 font-bold text-white rounded-xl transition mt-1"
              style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
                boxShadow:"3px 3px 0 var(--color-lagoon-600)" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-400)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor="var(--color-lagoon)"}>
              {submitting ? "Please wait…" : mode==="login" ? "Sign In →" : "Create Account →"}
            </button>
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor:"var(--color-cream-200)" }} />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 text-xs" style={{ backgroundColor:"var(--color-cream-50)", color:"var(--color-misty-400)" }}>
                  or continue with
                </span>
              </div>
            </div>
            <p className="text-xs mt-3" style={{color:"var(--color-lagoon-300)"}}>
              Sign in with an EventSync account. Microsoft Outlook can be connected after signing in.
            </p>
            {authError && <p role="alert" className="rounded-lg px-3 py-2 text-xs" style={{color:"#8b2338",backgroundColor:"#ffe9ee"}}>{authError}</p>}
          </div>

          <p className="text-center text-sm mt-5 relative z-10" style={{ color:"var(--color-misty-400)" }}>
            {mode==="login" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setMode(mode==="login"?"signup":"login")}
              className="font-bold hover:underline transition" style={{ color:"var(--color-lagoon)" }}>
              {mode==="login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ friends }: { friends: Friend[] }) {
  const [userAvail, setUserAvail] = useState<Set<string>>(new Set());
  const [matchesByBlock,setMatchesByBlock] = useState<Record<string,string[]>>({});
  const [calendarError,setCalendarError] = useState("");
  const [calendarNotice,setCalendarNotice] = useState("");
  const [outlookConnected,setOutlookConnected] = useState(false);
  const [loadingWeek,setLoadingWeek] = useState(true);
  const [validSlotStarts,setValidSlotStarts] = useState<Set<string>>(new Set());
  const dirtyRef=useRef(false);
  const loadCounter=useRef(0);
  const savedRef=useRef(0);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const isDragging = useRef(false);
  const dragMode  = useRef<"add"|"remove">("add");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to current hour on first render
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const hour = new Date().getHours();
      const rowHeight = el.scrollHeight / 24;
      el.scrollTop = Math.max(0, hour * rowHeight - el.clientHeight / 3);
    });
  }, []);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const monday = dateYMD(weekDates[0]);
  const slotToKey = useCallback((iso:string) => {
    const d=new Date(iso);
    const idx=(d.getDay()+6)%7;
    return blockKey(DAYS[idx],d.getHours());
  },[]);
  const keyToSlot = useCallback((key:string) => {
    const [day,hour] = key.split("-");
    const date=new Date(weekDates[DAYS.indexOf(day)]);
    date.setHours(parseInt(hour,10),0,0,0);
    return date.toISOString();
  },[weekDates]);
  const reloadCalendar = useCallback(async () => {
    const id=++loadCounter.current;
    dirtyRef.current=false;
    setLoadingWeek(true); setCalendarError("");
    try {
      const [week, slots, matches, outlook]=await Promise.all([
        api.week(monday,zone), api.weekSlots(monday,zone),
        api.matches(monday,zone,friends.map(f=>f.id)),api.outlookStatus()
      ]);
      if(id!==loadCounter.current)return;
      setValidSlotStarts(new Set(slots.map(s=>new Date(s.start).toISOString())));
      setUserAvail(new Set(week.selectedStarts.map(slotToKey)));
      const byBlock:Record<string,string[]>={};
      for(const slot of matches.slots)byBlock[slotToKey(slot.start)] = slot.availableFriends.map(f=>f.id);
      setMatchesByBlock(byBlock);
      setOutlookConnected(outlook.connected);
    } catch(err){if(id===loadCounter.current)setCalendarError(errorMessage(err));}
    finally {if(id===loadCounter.current)setLoadingWeek(false);}
  },[monday,friends,slotToKey]);
  useEffect(()=>{void reloadCalendar();return ()=>{loadCounter.current++}},[reloadCalendar]);
  useEffect(()=>{
    if(!dirtyRef.current || loadingWeek)return;
    const changedWeek=monday;
    const selected=[...userAvail].map(keyToSlot).filter(s=>validSlotStarts.has(s));
    const timer=window.setTimeout(async()=>{
      dirtyRef.current=false;
      try {
        await api.saveAvailability(changedWeek,zone,selected);
        setCalendarNotice("Saved to MySQL");
        // Fetch the latest matches after saving the new availability.
        const currentMatches=await api.matches(changedWeek,zone,friends.map(f=>f.id));
        if(changedWeek!==dateYMD(getWeekDates(weekOffset)[0]))return;
        const byBlock:Record<string,string[]>={};
        currentMatches.slots.forEach(slot=>byBlock[slotToKey(slot.start)] = slot.availableFriends.map(f=>f.id));
        setMatchesByBlock(byBlock);
      }catch(err){setCalendarError("Could not save availability: "+errorMessage(err));}
    },550);
    return ()=>window.clearTimeout(timer);
  },[userAvail,monday,weekOffset,keyToSlot,loadingWeek,validSlotStarts,friends,slotToKey]);
  const toggleAvailability = (key:string, state:boolean) => {
    dirtyRef.current=true;setCalendarNotice("Saving changes…");
    setUserAvail(prev=>{const next=new Set(prev);if(state)next.add(key);else next.delete(key);return next;});
  };
  const connectOutlook = async () => {
    try { setCalendarError("");await api.connectOutlook(); }
    catch(err){setCalendarError("Outlook connection: "+errorMessage(err));}
  };
  const syncOutlook = async () => {
    setCalendarNotice("Importing Outlook calendar…");setCalendarError("");
    try {
      const start=weekDates[0].toISOString();
      const nextMonday=new Date(weekDates[0]);nextMonday.setDate(nextMonday.getDate()+7);const end=nextMonday.toISOString();
      const result=await api.syncDefaultOutlook(start,end);
      setCalendarNotice(`Imported ${result.importedBusyIntervals} busy periods`);
      await reloadCalendar();
    }catch(err){setCalendarError("Outlook sync: "+errorMessage(err));}
  };

  const friendsPerBlock = useMemo(() => {
    const map: Record<string, Friend[]> = {};
    for (const [key, ids] of Object.entries(matchesByBlock)) {
      map[key]=friends.filter(f=>ids.includes(f.id));
    }
    return map;
  }, [friends,matchesByBlock]);

  const overlapCount = useMemo(() => {
    const m: Record<string, number> = {};
    Object.entries(friendsPerBlock).forEach(([k,v]) => { m[k] = v.length; });
    return m;
  }, [friendsPerBlock]);

  const bestBlocks = useMemo(() => {
    const vals = Object.values(overlapCount);
    const max = vals.length ? Math.max(...vals) : 0;
    return new Set(Object.entries(overlapCount).filter(([,v]) => v===max && max>=2).map(([k])=>k));
  }, [overlapCount]);

  const friendsAtBlock = useMemo(() =>
    selectedBlock ? (friendsPerBlock[selectedBlock] ?? []) : [],
    [selectedBlock, friendsPerBlock]);

  const handleMouseDown = useCallback((key: string) => {
    if(loadingWeek)return;
    isDragging.current = true;
    dragMode.current = userAvail.has(key) ? "remove" : "add";
    toggleAvailability(key,dragMode.current==="add");
    setSelectedBlock(key);
  }, [userAvail,loadingWeek]);

  const handleMouseEnter = useCallback((key: string) => {
    if (!isDragging.current || loadingWeek) return;
    toggleAvailability(key,dragMode.current==="add");
  }, []);

  const [showEditModal, setShowEditModal] = useState(false);

  const selDay    = selectedBlock?.split("-")[0];
  const selHour   = selectedBlock ? parseInt(selectedBlock.split("-")[1]) : null;
  const selDayIdx = selDay ? DAYS.indexOf(selDay) : -1;
  const selDate   = selDayIdx >= 0 ? weekDates[selDayIdx] : null;
  const selDateStr = selDate
    ? selDate.toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })
    : "";

  const rBtn = (active=false): React.CSSProperties => ({
    border:"1.5px solid var(--color-lagoon-600)", borderRadius:8,
    backgroundColor: active ? "var(--color-lagoon)" : "white",
    color: active ? "white" : "var(--color-lagoon)",
    fontWeight:600, fontSize:11, padding:"4px 10px", cursor:"pointer",
    boxShadow: active ? "none" : "2px 2px 0 var(--color-lagoon-200)",
  });

  const DAY_FULL: Record<string,string> = {
    Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",
    Fri:"Friday",Sat:"Saturday",Sun:"Sunday",
  };

  return (
    <div className="h-full no-select relative overflow-hidden"
      style={{ background:"linear-gradient(140deg, #EDF8FC 0%, #FFF9FB 55%, #EEF0F8 100%)" }}
      onMouseUp={() => { isDragging.current=false; }}
      onMouseLeave={() => { isDragging.current=false; }}>

      <div className="flex gap-3 h-full" style={{ padding:"8px 8px 8px 8px" }}>
        <RetroWindow title="Weekly Availability — click or drag to mark your free times" className="flex-1 min-w-0">
          <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
            <div className="flex items-center justify-between px-4 py-2 flex-shrink-0"
              style={{ backgroundColor:"var(--color-lagoon-50)", borderBottom:"1.5px solid var(--color-lagoon-100)" }}>
              <div className="flex items-center gap-2">
                <button style={rBtn()} onClick={() => setWeekOffset(o=>o-1)}>← Prev</button>
                <button style={rBtn(weekOffset===0)} onClick={() => setWeekOffset(0)}>Today</button>
                <button style={rBtn()} onClick={() => setWeekOffset(o=>o+1)}>Next →</button>
              </div>
              <span className="text-xs font-bold" style={{ color:"var(--color-lagoon)" }}>
                {formatWeekRange(weekDates)}
              </span>
              <div className="flex items-center gap-3">
                <button style={rBtn()} onClick={() => outlookConnected ? void syncOutlook() : void connectOutlook()}>
                  {outlookConnected ? "↻ Sync Outlook" : "+ Connect Outlook"}
                </button>
                {outlookConnected&&<button style={rBtn()} onClick={async()=>{
                  if(!window.confirm("Disconnect your Microsoft Outlook calendar?"))return;
                  try{await api.disconnectOutlook();setOutlookConnected(false);setCalendarNotice("Outlook disconnected.");await reloadCalendar();}
                  catch(err){setCalendarError(errorMessage(err));}
                }}>Disconnect</button>}
                {[
                  { c:"var(--color-lagoon)",    l:"You" },
                  { c:"#FFF59D",                l:"Best" },
                  { c:"var(--color-misty-200)", l:"Some overlap" },
                ].map(({ c, l }) => (
                  <div key={l} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor:c, border:"1px solid var(--color-lagoon-200)" }} />
                    <span className="text-xs font-medium" style={{ color:"var(--color-lagoon-400)" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {(calendarError || calendarNotice || loadingWeek) && <div className="flex justify-between px-4 py-1 text-xs" style={{background:"white",color:calendarError?"#9c2649":"#25645b"}}>
               <span role={calendarError?"alert":"status"}>{calendarError || (loadingWeek?"Loading saved availability…":calendarNotice)}</span>
               {calendarError && <button className="underline" onClick={()=>void reloadCalendar()}>Retry</button>}
            </div>}
            <div style={{ flex:1, overflow:"hidden" }}>
              <div ref={scrollContainerRef} style={{ height:"100%", overflowY:"auto" }}>
                <div className="grid sticky top-0 z-10 flex-shrink-0"
                  style={{ gridTemplateColumns:"56px repeat(7, 1fr)",
                    backgroundColor:"var(--color-lagoon-50)", borderBottom:"2px solid var(--color-lagoon-200)" }}>
                  <div />
                  {DAYS.map((day, i) => {
                    const d = weekDates[i];
                    const dow = d.getDay();
                    const isToday = weekOffset===0 && new Date().getDay()===dow;
                    return (
                      <div key={day} className="py-1.5 text-center">
                        <div className="text-xs font-bold uppercase tracking-widest"
                          style={{ color: isToday ? "var(--color-lagoon)" : "var(--color-lagoon-400)" }}>{day}</div>
                        <div className="w-7 h-7 mx-auto mt-0.5 flex items-center justify-center rounded-full text-sm font-bold"
                          style={{ backgroundColor: isToday ? "var(--color-lagoon)" : "transparent",
                            color: isToday ? "white" : "var(--color-lagoon-300)" }}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display:"flex", flexDirection:"column", minHeight:"calc(100% - 52px)" }}>
                  {HOURS.map(hour => (
                    <div key={hour} className="grid"
                      style={{ gridTemplateColumns:"56px repeat(7, 1fr)", flex:1, minHeight:44,
                        borderBottom:"1px solid var(--color-lagoon-50)" }}>
                      <div className="flex items-start justify-end pr-2 pt-1 flex-shrink-0"
                        style={{ fontSize:10, fontWeight:700, color:"var(--color-lagoon-300)",
                          borderRight:"1px solid var(--color-lagoon-100)", lineHeight:1.2 }}>
                        {formatHour(hour)}
                      </div>
                      {DAYS.map(day => {
                        const key = blockKey(day, hour);
                        const isUser   = userAvail.has(key);
                        const fHere    = friendsPerBlock[key] ?? [];
                        const isBest   = bestBlocks.has(key);
                        const isSelected = selectedBlock === key;

                        let bg = "white";
                        if (isUser) bg = "var(--color-lagoon)";
                        else if (isBest) bg = "#FFF59D";
                        else if (fHere.length >= 2) bg = "var(--color-misty-100)";
                        else if (fHere.length >= 1) bg = "var(--color-sage-50)";

                        return (
                          <div key={key} className="relative cursor-pointer transition-colors duration-75"
                            style={{ backgroundColor:bg, borderLeft:"1px solid var(--color-lagoon-50)",
                              outline: isSelected ? "2.5px solid var(--color-lagoon-600)" : "none",
                              outlineOffset:"-2px" }}
                            onMouseDown={() => handleMouseDown(key)}
                            onMouseEnter={() => handleMouseEnter(key)}>
                            {isBest && !isUser && (
                              <span className="absolute" style={{ top:1, right:2, fontSize:8, lineHeight:1, color:"#C4A800" }}>⭐</span>
                            )}
                            {!isUser && fHere.length > 0 && (
                              <div className="absolute flex gap-px" style={{ bottom:2, left:2 }}>
                                {fHere.map(f => (
                                  <div key={f.id} style={{ width:5, height:5, borderRadius:"50%",
                                    backgroundColor: fp(f.colorIdx).dot }} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </RetroWindow>

        <div className="flex flex-col gap-2 flex-shrink-0" style={{ width:236 }}>
          <RetroWindow title="Selected Time">
            <div className="flex flex-col h-full">
              {selectedBlock ? (
                <>
                  {/* Date + time */}
                  <div className="px-3 pt-3 pb-2 flex-shrink-0"
                    style={{ borderBottom:"1.5px solid var(--color-lagoon-50)" }}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div>
                        <p className="font-bold text-sm leading-tight" style={{ color:"var(--color-lagoon)" }}>
                          {selDateStr}
                        </p>
                        <p className="text-xs mt-0.5 font-semibold" style={{ color:"var(--color-lagoon-300)" }}>
                          {selHour !== null ? `${formatHour(selHour)} – ${formatHour(selHour + 1)}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedBlock(null)}
                        title="Clear selection"
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition mt-0.5"
                        style={{ backgroundColor:"var(--color-lagoon-100)", color:"var(--color-lagoon-400)" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor="var(--color-lagoon)"; e.currentTarget.style.color="white"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor="var(--color-lagoon-100)"; e.currentTarget.style.color="var(--color-lagoon-400)"; }}
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1.5 mt-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: userAvail.has(selectedBlock) ? "#59C2B3" : "#C4B8D8" }} />
                        <span className="text-xs font-medium" style={{ color:"var(--color-misty-400)" }}>
                          {userAvail.has(selectedBlock) ? "You are available" : "You are not available"}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition flex-shrink-0"
                        style={{ backgroundColor:"var(--color-lagoon-50)", color:"var(--color-lagoon)",
                          border:"1.5px solid var(--color-lagoon-100)" }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-100)"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-50)"}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Friend count + list */}
                  <div className="px-3 pt-2 pb-1 flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color:"var(--color-lagoon-400)" }}>
                      {friendsAtBlock.length === 0
                        ? "No friends available"
                        : `${friendsAtBlock.length} friend${friendsAtBlock.length === 1 ? "" : "s"} available`}
                    </p>
                  </div>
                  <div className="px-3 pb-3 space-y-1.5 overflow-y-auto flex-1">
                    {friendsAtBlock.length === 0 ? (
                      <p className="text-xs pt-1" style={{ color:"var(--color-misty-300)" }}>
                        None of your friends marked this time as free.
                      </p>
                    ) : (
                      friendsAtBlock.map(f => {
                        const c = fp(f.colorIdx);
                        return (
                          <div key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                            style={{ backgroundColor:c.bg, border:`1.5px solid ${c.border}` }}>
                            <FriendAvatar friend={f} size="sm" />
                            <p className="flex-1 text-xs font-semibold truncate" style={{ color:c.text }}>{f.name}</p>
                            <StatusDot status={f.status} />
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-5 px-3 text-center">
                  <div className="text-2xl mb-2">🖱️</div>
                  <p className="text-xs font-semibold" style={{ color:"var(--color-lagoon-300)" }}>No time selected</p>
                  <p className="text-xs mt-1" style={{ color:"var(--color-misty-400)" }}>Click any block to see the date, time, and who is free.</p>
                </div>
              )}
            </div>
          </RetroWindow>

          <RetroWindow title="Best Group Times">
            <div className="p-3 space-y-1.5">
              {Object.entries(overlapCount).sort(([,a],[,b])=>b-a).slice(0,5).map(([key,count]) => {
                const [d, h] = key.split("-");
                const isSel = selectedBlock===key;
                return (
                  <button key={key} onClick={() => setSelectedBlock(key)}
                    className="w-full text-left rounded-lg px-2.5 py-1.5 transition"
                    style={{ backgroundColor: isSel ? "var(--color-lagoon)" : "#FFFDE0",
                      border:`1.5px solid ${isSel ? "var(--color-lagoon-600)" : "#E8D800"}`,
                      boxShadow: isSel ? "none" : "1px 1px 0 #E8D800" }}>
                    <span className="text-xs font-bold block" style={{ color:isSel?"white":"var(--color-lagoon)" }}>
                      ⭐ {DAY_FULL[d]??d} at {formatHour(parseInt(h))}
                    </span>
                    <span className="text-xs" style={{ color:isSel?"rgba(255,255,255,0.75)":"var(--color-lagoon-300)" }}>
                      {count} {count===1?"friend":"friends"} available
                    </span>
                  </button>
                );
              })}
            </div>
          </RetroWindow>

          <RetroWindow title="Available Friends" className="flex-1">
            <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
              <div className="px-3 pt-2.5 pb-2 flex-shrink-0"
                style={{ borderBottom:"1px solid var(--color-lagoon-50)" }}>
                <p className="text-xs font-bold mb-1.5" style={{ color:"var(--color-lagoon-400)" }}>Colour legend</p>
                <div className="flex flex-wrap gap-1.5">
                  {friends.map(f => {
                    const c = fp(f.colorIdx);
                    return (
                      <div key={f.id} className="flex items-center gap-1 rounded-full px-2 py-0.5"
                        style={{ backgroundColor:c.bg, border:`1.5px solid ${c.border}` }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor:c.dot }} />
                        <span className="text-xs font-semibold" style={{ color:c.text }}>{f.initials}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
                {friends.map(f => {
                  const c = fp(f.colorIdx);
                  const freeNow = selectedBlock ? (matchesByBlock[selectedBlock]||[]).includes(f.id) : false;
                  return (
                    <div key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{ backgroundColor: freeNow ? c.bg : "white",
                        border:`1.5px solid ${freeNow ? c.border : "var(--color-lagoon-100)"}` }}>
                      <div className="relative flex-shrink-0">
                        <FriendAvatar friend={f} size="sm" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                          style={{ backgroundColor: f.status==="online" ? "#59C2B3" : "#C4B8D8" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: freeNow ? c.text : "var(--color-lagoon)" }}>
                          {f.name}
                        </p>
                        <p className="text-xs" style={{ color:"var(--color-misty-400)" }}>
                          {freeNow ? "✓ Free then" : "No confirmed overlap"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </RetroWindow>
        </div>
      </div>

      {/* Edit Availability Modal */}
      {showEditModal && selectedBlock && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor:"rgba(82,91,152,0.35)", backdropFilter:"blur(4px)" }}>
          <div className="rounded-2xl w-full max-w-sm overflow-hidden"
            style={{ backgroundColor:"white", border:"2.5px solid var(--color-lagoon-600)",
              boxShadow:"5px 5px 0 var(--color-lagoon-600)" }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ backgroundColor:"var(--color-lagoon)", borderBottom:"2.5px solid var(--color-lagoon-600)" }}>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#F5A6CD" }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#FFF59D" }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#9BE3CE" }} />
                </div>
                <span className="text-white text-sm font-bold">Edit Availability</span>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-white opacity-60 hover:opacity-100 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Time info */}
              <div className="rounded-xl px-4 py-3"
                style={{ backgroundColor:"var(--color-lagoon-50)", border:"1.5px solid var(--color-lagoon-100)" }}>
                <p className="text-sm font-bold" style={{ color:"var(--color-lagoon)" }}>{selDateStr}</p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color:"var(--color-lagoon-300)" }}>
                  {selHour !== null ? `${formatHour(selHour)} – ${formatHour(selHour + 1)}` : ""}
                </p>
              </div>

              <div className="rounded-lg p-2 text-xs" style={{background:"#fffbea",color:"#725a18"}}>
                Outlook busy periods are respected unless you explicitly override them here.
                <div className="flex gap-2 mt-2">
                  {(["AVAILABLE","BUSY"] as const).map(status=><button key={status}
                    className="rounded px-2 py-1 border font-semibold"
                    onClick={async()=>{
                      try {
                        const start=keyToSlot(selectedBlock);
                        await api.addManualOverride(start,new Date(new Date(start).getTime()+3600000).toISOString(),status);
                        setShowEditModal(false);setCalendarNotice("Outlook override saved");await reloadCalendar();
                      }catch(err){setCalendarError(errorMessage(err));}
                    }}>
                    Override: {status==="AVAILABLE"?"Free":"Busy"}
                  </button>)}
                </div>
              </div>
              {/* Current status */}
              <div>
                <p className="text-xs font-bold mb-2" style={{ color:"var(--color-lagoon-400)" }}>Your status for this slot</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleAvailability(selectedBlock,true)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl transition border-2"
                    style={{
                      backgroundColor: userAvail.has(selectedBlock) ? "#C8EEF5" : "white",
                      borderColor: userAvail.has(selectedBlock) ? "#59C2B3" : "var(--color-lagoon-100)",
                      color: userAvail.has(selectedBlock) ? "#1A6A7A" : "var(--color-lagoon-300)",
                    }}>
                    <span className="text-2xl">✅</span>
                    <span className="text-xs font-bold">Available</span>
                  </button>
                  <button
                    onClick={() => toggleAvailability(selectedBlock,false)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl transition border-2"
                    style={{
                      backgroundColor: !userAvail.has(selectedBlock) ? "#FFD9EF" : "white",
                      borderColor: !userAvail.has(selectedBlock) ? "#F5A6CD" : "var(--color-lagoon-100)",
                      color: !userAvail.has(selectedBlock) ? "#7A1A4A" : "var(--color-lagoon-300)",
                    }}>
                    <span className="text-2xl">🚫</span>
                    <span className="text-xs font-bold">Not Available</span>
                  </button>
                </div>
              </div>

              {/* Confirm */}
              <button
                onClick={() => setShowEditModal(false)}
                className="w-full py-3 font-bold text-white rounded-xl transition"
                style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
                  boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-400)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor="var(--color-lagoon)"}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────
function EventsTab({ onCreateEvent, invitations, setInvitations, openInvId, onClearOpenInv, reloadKey }: {
  onCreateEvent: () => void;
  invitations: Invitation[];
  setInvitations: React.Dispatch<React.SetStateAction<Invitation[]>>;
  openInvId?: string | null;
  onClearOpenInv?: () => void;
  reloadKey: number;
}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventError,setEventError] = useState("");
  useEffect(() => {
    let active=true;
    Promise.all([api.events("upcoming"),api.events("organized")])
      .then(([upcoming,organized]) => {
        if(!active)return;
        const unique=new Map([...upcoming,...organized].map(e=>[e.id,mappedEvent(e)]));
        setEvents([...unique.values()]);
      }).catch(err=>{if(active)setEventError(errorMessage(err));});
    return ()=>{active=false};
  }, [reloadKey]);
  const [selectedInv, setSelectedInv] = useState<Invitation | null>(null);
  const [section, setSection] = useState<"upcoming"|"organized"|"invitations">("upcoming");

  const organized = events.filter(e => e.type==="organized");
  const upcoming  = events.filter(e=>new Date(`${e.date}T${e.time}`).getTime()>=Date.now()).sort((a,b) => a.date.localeCompare(b.date));

  useEffect(() => {
    if (openInvId != null) {
      const inv = invitations.find(i => i.id === openInvId);
      if (inv) {
        setSection("invitations");
        setSelectedInv(inv);
        onClearOpenInv?.();
      }
    }
  }, [openInvId]);

  const respond = async (inv: Invitation, accept: boolean) => {
    setEventError("");
    try {
      await api.respondToEvent(inv.id,accept);
      setInvitations(prev=>prev.filter(i=>i.id!==inv.id));
      if(accept) setEvents(prev => [...prev, { ...inv,type:"attending" }]);
      setSelectedInv(null);
    } catch(err) { setEventError(errorMessage(err)); }
  };
  const handleAccept = (inv: Invitation) => {void respond(inv,true)};
  const handleDecline = (inv: Invitation) => {void respond(inv,false)};
  const cancel = async (id:string) => {
    if(!window.confirm("Cancel this event for all participants?"))return;
    setEventError("");
    try {await api.cancelEvent(id);setEvents(prev=>prev.filter(ev=>ev.id!==id));}
    catch(err){setEventError(errorMessage(err));}
  };

  return (
    <div className="flex gap-5 h-full">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor:"var(--color-lagoon-50)" }}>
            {(["upcoming","organized","invitations"] as const).map(s => (
              <button key={s} onClick={() => setSection(s)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition"
                style={{ backgroundColor: section===s ? "var(--color-lagoon)" : "transparent",
                  color: section===s ? "white" : "var(--color-lagoon-400)" }}>
                {s}
                {s==="invitations" && invitations.length>0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor:"var(--color-blush-200)", color:"white" }}>{invitations.length}</span>
                )}
              </button>
            ))}
          </div>
          <button onClick={onCreateEvent}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition"
            style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
              boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-400)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor="var(--color-lagoon)"}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Event
          </button>
        </div>

        <div className="flex-1 overflow-auto space-y-3 pr-1">
          {eventError && <p role="alert" className="text-sm" style={{color:"#9c2649"}}>{eventError}</p>}
          {section==="upcoming"    && (upcoming.length===0    ? <EmptyState icon="🗓️" title="No upcoming events"    desc="Create one or accept an invitation." /> : upcoming.map(e=><EventCard key={e.id} event={e} onCancel={e.type==="organized"?()=>void cancel(e.id):undefined} />))}
          {section==="organized"   && (organized.length===0   ? <EmptyState icon="📋" title="No organized events"  desc="Create your first event." />            : organized.map(e=><EventCard key={e.id} event={e} showBadge onCancel={()=>void cancel(e.id)} />))}
          {section==="invitations" && (invitations.length===0 ? <EmptyState icon="📬" title="No pending invitations" desc="You're all caught up!" />              : invitations.map(i=><InvitationCard key={i.id} invitation={i} onView={() => setSelectedInv(i)} />))}
        </div>
      </div>

      {selectedInv && (
        <InvitationDetail invitation={selectedInv}
          onAccept={() => handleAccept(selectedInv)}
          onDecline={() => handleDecline(selectedInv)}
          onClose={() => setSelectedInv(null)} />
      )}
    </div>
  );
}

function EventCard({ event, showBadge, onCancel }: { event:Event; showBadge?:boolean; onCancel?:()=>void }) {
  const d = new Date(event.date + "T00:00:00");
  return (
    <div className="rounded-2xl p-5 flex gap-4 transition cursor-default"
      style={{ backgroundColor:"white", border:"2px solid var(--color-lagoon-100)",
        boxShadow:"2px 2px 0 var(--color-lagoon-100)" }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor="var(--color-lagoon-200)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor="var(--color-lagoon-100)"}>
      <div className="w-13 flex-shrink-0 pt-0.5">
        <div className="rounded-xl px-2 py-1.5 text-center"
          style={{ backgroundColor:"var(--color-lagoon-50)", border:"1.5px solid var(--color-lagoon-100)" }}>
          <p className="text-xs font-bold uppercase" style={{ color:"var(--color-lagoon-300)" }}>
            {d.toLocaleDateString("en-US",{ month:"short" })}
          </p>
          <p className="text-2xl font-bold leading-none" style={{ color:"var(--color-lagoon)" }}>{d.getDate()}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-base" style={{ color:"var(--color-lagoon)" }}>{event.title}</h3>
        {showBadge && (
          <span className="inline-block mt-0.5 px-2 py-0.5 text-xs rounded-full font-semibold"
            style={{ backgroundColor:"var(--color-sage-50)", color:"var(--color-sage-500)" }}>Organized by you</span>
        )}
        {!showBadge && event.organizer!=="me" && (
          <span className="inline-block mt-0.5 px-2 py-0.5 text-xs rounded-full font-semibold"
            style={{ backgroundColor:"var(--color-misty-100)", color:"var(--color-misty-500)" }}>By {event.organizer}</span>
        )}
        <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color:"var(--color-lagoon-300)" }}>
          <span>🕐 {event.time}</span>
          <span>📍 {event.location}</span>
          <span>👥 {event.attendees.length} attending</span>
        </div>
        <p className="text-xs mt-1.5 line-clamp-1" style={{ color:"var(--color-lagoon-200)" }}>{event.description}</p>
        {onCancel&&<button className="text-xs font-semibold mt-2 underline" style={{color:"#9c2649"}} onClick={onCancel}>Cancel event</button>}
      </div>
    </div>
  );
}

function InvitationCard({ invitation, onView }: { invitation:Invitation; onView:()=>void }) {
  const d = new Date(invitation.date + "T00:00:00");
  return (
    <div className="rounded-2xl p-5 flex gap-4 transition"
      style={{ backgroundColor:"white", border:"2px solid var(--color-blush-200)",
        boxShadow:"2px 2px 0 var(--color-blush-200)" }}>
      <div className="w-13 flex-shrink-0 pt-0.5">
        <div className="rounded-xl px-2 py-1.5 text-center"
          style={{ backgroundColor:"var(--color-blush-50)", border:"1.5px solid var(--color-blush-100)" }}>
          <p className="text-xs font-bold uppercase" style={{ color:"var(--color-blush-300)" }}>
            {d.toLocaleDateString("en-US",{ month:"short" })}
          </p>
          <p className="text-2xl font-bold leading-none" style={{ color:"var(--color-blush)" }}>{d.getDate()}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor:"var(--color-blush-50)", color:"var(--color-blush)" }}>
          Invitation from {invitation.organizer}
        </span>
        <h3 className="font-bold text-base mt-1" style={{ color:"var(--color-lagoon)" }}>{invitation.title}</h3>
        <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color:"var(--color-lagoon-300)" }}>
          <span>🕐 {invitation.time}</span><span>📍 {invitation.location}</span>
        </div>
        <button onClick={onView}
          className="mt-2.5 px-4 py-1.5 text-white text-xs font-bold rounded-lg transition"
          style={{ backgroundColor:"var(--color-lagoon)", border:"1.5px solid var(--color-lagoon-600)",
            boxShadow:"2px 2px 0 var(--color-lagoon-200)" }}>
          View Invitation
        </button>
      </div>
    </div>
  );
}

function InvitationDetail({ invitation, onAccept, onDecline, onClose }:
  { invitation:Invitation; onAccept:()=>void; onDecline:()=>void; onClose:()=>void }) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden"
      style={{ borderRadius:16, border:"2.5px solid var(--color-lagoon-600)",
        boxShadow:"4px 4px 0 var(--color-lagoon-600)", backgroundColor:"white" }}>
      <div className="p-5 border-b"
        style={{ background:"linear-gradient(135deg, var(--color-misty-50) 0%, var(--color-blush-50) 100%)",
          borderColor:"var(--color-lagoon-100)" }}>
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor:"var(--color-blush-100)", color:"var(--color-blush)" }}>
            Pending Invitation
          </span>
          <button onClick={onClose} style={{ color:"var(--color-lagoon-200)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <h2 className="text-lg font-bold" style={{ color:"var(--color-lagoon)" }}>{invitation.title}</h2>
        <p className="text-sm mt-0.5 font-semibold" style={{ color:"var(--color-blush)" }}>From {invitation.organizer}</p>
      </div>

      <div className="flex-1 p-5 space-y-3.5 overflow-auto">
        {[
          { icon:"📅", label:"Date",     value:formatDate(invitation.date) },
          { icon:"🕐", label:"Time",     value:invitation.time },
          { icon:"📍", label:"Location", value:invitation.location },
        ].map(({ icon,label,value }) => (
          <div key={label} className="flex gap-3">
            <span className="text-lg flex-shrink-0">{icon}</span>
            <div>
              <p className="text-xs font-semibold" style={{ color:"var(--color-misty-400)" }}>{label}</p>
              <p className="text-sm font-semibold" style={{ color:"var(--color-lagoon)" }}>{value}</p>
            </div>
          </div>
        ))}
        <div className="rounded-xl p-3" style={{ backgroundColor:"var(--color-lagoon-50)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color:"var(--color-lagoon-300)" }}>About</p>
          <p className="text-sm leading-relaxed" style={{ color:"var(--color-lagoon-400)" }}>{invitation.description}</p>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--color-lagoon-300)" }}>
            Also invited ({invitation.attendees.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {invitation.attendees.map((name, i) => {
              const c = fp(i);
              return (
                <div key={name} className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ backgroundColor:c.bg, border:`1.5px solid ${c.border}` }}>
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor:c.dot }} />
                  <span className="text-xs font-semibold" style={{ color:c.text }}>{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t flex gap-3" style={{ borderColor:"var(--color-lagoon-100)" }}>
        <button onClick={onDecline}
          className="flex-1 py-2.5 text-sm font-bold rounded-xl transition border"
          style={{ borderColor:"var(--color-lagoon-200)", color:"var(--color-lagoon-400)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-50)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor="transparent"}>
          Decline
        </button>
        <button onClick={onAccept}
          className="flex-1 py-2.5 text-sm font-bold rounded-xl transition text-white"
          style={{ backgroundColor:"var(--color-sage)", border:"2px solid var(--color-sage-500)",
            boxShadow:"2px 2px 0 var(--color-sage-500)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-sage-500)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor="var(--color-sage)"}>
          Accept
        </button>
      </div>
    </div>
  );
}

// ─── Friends Tab ──────────────────────────────────────────────────────────────
function FriendsTab({ friends, onRemoveFriend, onSendRequest, requests, onAcceptRequest, onDeclineRequest }: {
  friends: Friend[];
  onRemoveFriend: (id: string) => void;
  onSendRequest: (query: string) => Promise<void>;
  requests: FriendRequest[];
  onAcceptRequest: (req: FriendRequest) => void;
  onDeclineRequest: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addSent, setAddSent] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [friendError, setFriendError] = useState("");

  const filtered = friends.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const friendToRemove = friends.find(f => f.id === confirmRemoveId);

  const handleAcceptReq = (req: FriendRequest) => onAcceptRequest(req);

  return (
    <div className="flex gap-5 h-full">
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color:"var(--color-lagoon-300)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none transition"
              placeholder="Search friends…" value={search} onChange={e=>setSearch(e.target.value)}
              style={{ backgroundColor:"var(--color-misty-100)", border:"2px solid var(--color-misty-200)",
                color:"var(--color-lagoon)" }} />
          </div>
          <button onClick={() => { setShowAdd(true); setAddSent(false); setAddQuery(""); }}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-xl transition"
            style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
              boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}
            onMouseEnter={e=>e.currentTarget.style.backgroundColor="var(--color-lagoon-400)"}
            onMouseLeave={e=>e.currentTarget.style.backgroundColor="var(--color-lagoon)"}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add Friend
          </button>
        </div>

        <div className="rounded-2xl flex-1 overflow-hidden flex flex-col"
          style={{ backgroundColor:"white", border:"2px solid var(--color-lagoon-100)",
            boxShadow:"2px 2px 0 var(--color-lagoon-100)" }}>
          <div className="px-5 py-3 border-b flex-shrink-0" style={{ borderColor:"var(--color-lagoon-50)" }}>
            <h2 className="text-sm font-bold" style={{ color:"var(--color-lagoon)" }}>
              {filtered.length} Friend{filtered.length!==1?"s":""}
            </h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3 overflow-auto">
            {filtered.map(f => {
              const c = fp(f.colorIdx);
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-xl p-3 transition group relative"
                  style={{ backgroundColor:c.bg, border:`2px solid ${c.border}` }}>
                  <div className="relative flex-shrink-0">
                    <FriendAvatar friend={f} />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                      style={{ backgroundColor: f.status==="online" ? "#59C2B3" : "#C4B8D8" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color:c.text }}>{f.name}</p>
                    <p className="text-xs capitalize" style={{ color:c.dot }}>{f.status}</p>
                  </div>
                  <button
                    onClick={() => setConfirmRemoveId(f.id)}
                    title={`Remove ${f.name}`}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all"
                    style={{ backgroundColor:"var(--color-lagoon)", color:"white" }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-lagoon-600)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor="var(--color-lagoon)"}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-68 flex flex-col gap-4" style={{ width:276 }}>
        <div className="rounded-2xl p-4" style={{ backgroundColor:"white", border:"2px solid var(--color-lagoon-100)" }}>
          <p className="text-sm font-bold" style={{color:"var(--color-lagoon)"}}>Find people on EventSync</p>
          <p className="text-xs mt-2" style={{color:"var(--color-lagoon-300)"}}>Use Add Friend to search for an existing account by name or email. Only accepted friends appear in your calendar comparisons.</p>
        </div>
      </div>

      {/* Add Friend Modal */}
      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor:"rgba(82,91,152,0.3)", backdropFilter:"blur(4px)" }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-8"
            style={{ backgroundColor:"var(--color-cream-50)", border:"2.5px solid var(--color-lagoon-600)",
              boxShadow:"5px 5px 0 var(--color-lagoon-600)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold" style={{ color:"var(--color-lagoon)" }}>Add a Friend</h2>
              <button onClick={() => setShowAdd(false)} style={{ color:"var(--color-lagoon-200)" }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {!addSent ? (
              <>
                <p className="text-sm mb-4" style={{ color:"var(--color-lagoon-300)" }}>Enter their username or email.</p>
                <input className="w-full px-4 py-2.5 rounded-xl text-sm mb-4 focus:outline-none"
                  placeholder="username or email@university.edu" value={addQuery} onChange={e=>setAddQuery(e.target.value)} autoFocus
                  style={{ backgroundColor:"var(--color-misty-100)", border:"2px solid var(--color-misty-200)", color:"var(--color-lagoon)" }} />
                {friendError && <p role="alert" className="text-xs mb-2" style={{color:"#9c2649"}}>{friendError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setShowAdd(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition"
                    style={{ borderColor:"var(--color-lagoon-200)", color:"var(--color-lagoon-400)" }}>Cancel</button>
                  <button onClick={async () => {
                    if (!addQuery.trim()) return;
                    setFriendError("");
                    try { await onSendRequest(addQuery.trim()); setAddSent(true); }
                    catch (err) { setFriendError(errorMessage(err)); }
                  }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ backgroundColor:"var(--color-lagoon)" }}>Send Request</button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"
                  style={{ backgroundColor:"var(--color-sage-50)", border:"2px solid var(--color-sage-100)" }}>✓</div>
                <p className="font-bold mb-1" style={{ color:"var(--color-lagoon)" }}>Request Sent!</p>
                <p className="text-sm mb-5" style={{ color:"var(--color-lagoon-300)" }}>Sent to <strong>{addQuery}</strong>.</p>
                <button onClick={() => setShowAdd(false)}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor:"var(--color-lagoon)" }}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Remove Dialog */}
      {confirmRemoveId !== null && friendToRemove && (
        <ConfirmDialog
          title={`Remove ${friendToRemove.name}?`}
          message={`${friendToRemove.name} will be removed from your group calendar and friend list. This can be undone by sending a new friend request.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => { onRemoveFriend(confirmRemoveId); setConfirmRemoveId(null); }}
          onCancel={() => setConfirmRemoveId(null)}
        />
      )}
    </div>
  );
}

// ─── Groups Tab ───────────────────────────────────────────────────────────────
function CreateGroupModal({ friends, onClose, onSave }: {
  friends: Friend[];
  onClose: () => void;
  onSave: (g: Group) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [useExistingDates, setUseExistingDates] = useState(false);
  const [saved, setSaved] = useState(false);
  const [groupError, setGroupError] = useState("");

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i=>i!==id) : [...prev, id]);

  const selectedMembers = friends.filter(f => selectedIds.includes(f.id));

  const commonBlocks = useMemo(() => {
    if (!useExistingDates || selectedMembers.length === 0) return [];
    const allBlocks = selectedMembers[0].availability.filter(block =>
      selectedMembers.every(m => m.availability.includes(block))
    );
    return allBlocks;
  }, [useExistingDates, selectedMembers]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setGroupError("");
    try { await onSave({
      id: "",
      name: name.trim(),
      members: selectedMembers,
      useExistingDates,
      commonBlocks,
      createdAt: new Date().toISOString(),
    }); setSaved(true); setTimeout(onClose, 1400); }
    catch (error) { setGroupError(errorMessage(error)); }
  };

  const DAY_FULL: Record<string,string> = {
    Mon:"Mon",Tue:"Tue",Wed:"Wed",Thu:"Thu",Fri:"Fri",Sat:"Sat",Sun:"Sun",
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ backgroundColor:"rgba(82,91,152,0.3)", backdropFilter:"blur(4px)" }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] overflow-hidden flex flex-col"
        style={{ backgroundColor:"white", border:"2.5px solid var(--color-lagoon-600)",
          boxShadow:"5px 5px 0 var(--color-lagoon-600)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 flex-shrink-0"
          style={{ backgroundColor:"var(--color-lagoon)", borderBottom:"2.5px solid var(--color-lagoon-600)" }}>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#F5A6CD" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#FFF59D" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#9BE3CE" }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create a Group</h2>
              <p className="text-xs" style={{ color:"var(--color-lagoon-200)" }}>Name the group, pick your crew, and set up availability</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white opacity-60 hover:opacity-100 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {saved ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 text-4xl"
              style={{ backgroundColor:"var(--color-sage-50)", border:"2px solid var(--color-sage-100)" }}>✓</div>
            <p className="text-xl font-bold" style={{ color:"var(--color-lagoon)" }}>Group Created!</p>
            <p className="text-sm mt-1" style={{ color:"var(--color-lagoon-300)" }}>
              {name} — {selectedMembers.length} member{selectedMembers.length!==1?"s":""} added.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-7 space-y-6">
            {/* Group Name */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color:"var(--color-lagoon-400)" }}>
                Group Name *
              </label>
              <input
                className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition"
                placeholder="e.g. Study Squad, Weekend Crew…"
                value={name} onChange={e=>setName(e.target.value)} autoFocus
                style={{ backgroundColor:"var(--color-misty-100)", border:"2px solid var(--color-misty-200)",
                  color:"var(--color-lagoon)" }} />
            </div>

            {/* Invite Friends */}
            <div>
              <label className="block text-xs font-bold mb-2" style={{ color:"var(--color-lagoon-400)" }}>
                Invite Friends *
                {selectedIds.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor:"var(--color-lagoon)", color:"white" }}>
                    {selectedIds.length} selected
                  </span>
                )}
              </label>
              {friends.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color:"var(--color-lagoon-200)" }}>
                  Add some friends first to create a group.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {friends.map(f => {
                    const c = fp(f.colorIdx);
                    const checked = selectedIds.includes(f.id);
                    return (
                      <label key={f.id}
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition border-2"
                        style={{ backgroundColor: checked ? c.bg : "white",
                          borderColor: checked ? c.border : "var(--color-lagoon-100)" }}>
                        <input type="checkbox" className="w-4 h-4 flex-shrink-0" checked={checked}
                          onChange={()=>toggle(f.id)}
                          style={{ accentColor:"var(--color-lagoon)" }} />
                        <FriendAvatar friend={f} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: checked ? c.text : "var(--color-lagoon)" }}>
                            {f.name}
                          </p>
                          <p className="text-xs" style={{ color: c.dot }}>
                            {f.availability.length} free slots
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Use Existing Dates */}
            <div className="rounded-2xl p-4"
              style={{ backgroundColor: useExistingDates ? "var(--color-lagoon-50)" : "#FAFAFA",
                border:`2px solid ${useExistingDates ? "var(--color-lagoon-100)" : "var(--color-lagoon-50)"}` }}>
              <p className="text-sm" style={{color:"var(--color-lagoon-300)"}}>
                To compare your group's schedules, use the Calendar or Find Meeting Time tab after creating the group.
              </p>

            </div>
          </div>
        )}

        {!saved && (
          <div className="px-7 py-4 border-t flex gap-3 flex-shrink-0" style={{ borderColor:"var(--color-lagoon-100)" }}>
            <button onClick={onClose}
              className="flex-1 py-3 font-bold rounded-xl text-sm border transition"
              style={{ borderColor:"var(--color-lagoon-200)", color:"var(--color-lagoon-400)" }}>Cancel</button>
            {groupError && <p role="alert" className="text-xs" style={{color:"#9c2649"}}>{groupError}</p>}
            <button onClick={handleSave}
              disabled={!name.trim()}
              className="flex-1 py-3 font-bold rounded-xl text-sm text-white transition"
              style={{ backgroundColor: (!name.trim()) ? "var(--color-lagoon-100)" : "var(--color-lagoon)",
                color: (!name.trim()) ? "var(--color-lagoon-200)" : "white",
                border:"2px solid var(--color-lagoon-600)", boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}>
              Create Group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupsTab({ friends, groups, onCreateGroup, onRefresh, user }: {
  friends: Friend[];
  groups: Group[];
  onCreateGroup: (g: Group) => Promise<void>;
  onRefresh: () => Promise<void>;
  user: ApiUser;
}) {
  const [managedGroupId,setManagedGroupId] = useState<string|null>(null);
  const [showModal, setShowModal] = useState(false);

  const DAY_FULL: Record<string,string> = {
    Mon:"Mon",Tue:"Tue",Wed:"Wed",Thu:"Thu",Fri:"Fri",Sat:"Sat",Sun:"Sun",
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold" style={{ color:"var(--color-lagoon)" }}>
            Your Groups
          </h2>
          <p className="text-xs mt-0.5" style={{ color:"var(--color-misty-400)" }}>
            Create groups from your friends and find shared availability
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-xl transition"
          style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
            boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}
          onMouseEnter={e=>e.currentTarget.style.backgroundColor="var(--color-lagoon-400)"}
          onMouseLeave={e=>e.currentTarget.style.backgroundColor="var(--color-lagoon)"}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Group
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-16">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl"
              style={{ backgroundColor:"var(--color-lagoon-50)", border:"2px solid var(--color-lagoon-100)" }}>
              👥
            </div>
            <p className="text-lg font-bold mb-1" style={{ color:"var(--color-lagoon)" }}>No groups yet</p>
            <p className="text-sm mb-6" style={{ color:"var(--color-misty-400)" }}>
              Create a group to coordinate schedules with a specific set of friends.
            </p>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl transition"
              style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
                boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}>
              Create your first group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {groups.map(g => (
              <GroupCard key={g.id} group={g} dayFull={DAY_FULL} onManage={() => setManagedGroupId(g.id)} />
            ))}
          </div>
        )}
      </div>

      {managedGroupId && <LiveGroupManager groupId={managedGroupId} user={user} onClose={()=>setManagedGroupId(null)} onUpdated={onRefresh} />}
      {showModal && (
        <CreateGroupModal
          friends={friends}
          onClose={() => setShowModal(false)}
          onSave={async (g) => { await onCreateGroup(g); setShowModal(false); }}
        />
      )}
    </div>
  );
}

function GroupCard({ group, dayFull, onManage }: { group: Group; dayFull: Record<string,string>; onManage:()=>void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden transition"
      style={{ backgroundColor:"white", border:"2px solid var(--color-lagoon-100)",
        boxShadow:"2px 2px 0 var(--color-lagoon-100)" }}>
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold" style={{ color:"var(--color-lagoon)" }}>{group.name}</h3>
            <p className="text-xs mt-0.5" style={{ color:"var(--color-misty-400)" }}>
              {group.members.length} member{group.members.length!==1?"s":""}
            </p>
          </div>
          {group.useExistingDates && group.commonBlocks.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ backgroundColor:"#FFFDE0", border:"1.5px solid #E8D800", color:"var(--color-lagoon)" }}>
              ⭐ {group.commonBlocks.length} shared
            </span>
          )}
        </div>

        {/* Member avatars */}
        <div className="flex items-center">
          <div className="flex">
            {group.members.slice(0, 5).map((m, i) => (
              <div key={m.id} style={{ marginLeft: i===0 ? 0 : -8, zIndex: group.members.length - i }}>
                <FriendAvatar friend={m} size="sm" />
              </div>
            ))}
          </div>
          {group.members.length > 5 && (
            <span className="ml-2 text-xs font-semibold" style={{ color:"var(--color-lagoon-300)" }}>
              +{group.members.length - 5} more
            </span>
          )}
        </div>
      </div>

      {/* Common times preview */}
      {group.useExistingDates && (
        <div className="px-5 pb-4">
          {group.commonBlocks.length > 0 ? (
            <>
              <p className="text-xs font-bold mb-2" style={{ color:"var(--color-lagoon-300)" }}>Common availability</p>
              <div className="flex flex-wrap gap-1.5">
                {(expanded ? group.commonBlocks : group.commonBlocks.slice(0,4)).map(block => {
                  const [d, h] = block.split("-");
                  return (
                    <div key={block} className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor:"#FFFDE0", border:"1.5px solid #E8D800", color:"var(--color-lagoon)" }}>
                      {dayFull[d]} {formatHour(parseInt(h))}
                    </div>
                  );
                })}
                {group.commonBlocks.length > 4 && (
                  <button onClick={() => setExpanded(e=>!e)}
                    className="px-2 py-0.5 rounded-full text-xs font-semibold transition"
                    style={{ backgroundColor:"var(--color-lagoon-50)", color:"var(--color-lagoon-400)",
                      border:"1.5px solid var(--color-lagoon-100)" }}>
                    {expanded ? "show less" : `+${group.commonBlocks.length - 4} more`}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color:"var(--color-blush)" }}>No common free times found.</p>
          )}
        </div>
      )}

      <div className="px-5 pb-4 flex gap-2">
        <div className="flex-1 text-center py-1.5 rounded-xl text-xs font-semibold"
          style={{ backgroundColor:"var(--color-lagoon-50)", color:"var(--color-lagoon-400)",
            border:"1.5px solid var(--color-lagoon-100)" }}>
          Stored in EventSync
        </div>
        <button className="flex-1 py-1.5 rounded-xl text-xs font-semibold" style={{backgroundColor:"var(--color-lagoon)",color:"white"}} onClick={onManage}>Manage</button>
      </div>
    </div>
  );
}

// ─── Create Event Modal ───────────────────────────────────────────────────────
function CreateEventModal({ onClose, onSave, friends }: {
  onClose:()=>void;
  onSave:(ev:Event)=>Promise<void>;
  friends: Friend[];
}) {
  const [form, setForm] = useState({ title:"", description:"", date:"", time:"", location:"", invitees:[] as string[] });
  const [saved, setSaved] = useState(false);
  const [eventError, setEventError] = useState("");
  const set = (k: keyof typeof form, v:string) => setForm(prev=>({...prev,[k]:v}));
  const toggleInvitee = (name:string) => setForm(prev=>({...prev,
    invitees: prev.invitees.includes(name) ? prev.invitees.filter(n=>n!==name) : [...prev.invitees,name]}));

  const handleSave = async () => {
    if (!form.title||!form.date||!form.time) {setEventError("Choose a date and time.");return;}
    setEventError("");
    try { await onSave({ id:"", title:form.title, date:form.date, time:form.time, location:form.location,
      organizer:"me", attendees:form.invitees, description:form.description, type:"organized" });
    setSaved(true); setTimeout(onClose,1400); }
    catch (err) { setEventError(errorMessage(err)); }
  };

  const inputStyle: React.CSSProperties = { backgroundColor:"var(--color-misty-100)",
    border:"2px solid var(--color-misty-200)", color:"var(--color-lagoon)" };
  const inputCls = "w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition";

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ backgroundColor:"rgba(82,91,152,0.3)", backdropFilter:"blur(4px)" }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor:"white", border:"2.5px solid var(--color-lagoon-600)",
          boxShadow:"5px 5px 0 var(--color-lagoon-600)" }}>
        <div className="flex items-center justify-between px-7 py-5 border-b"
          style={{ backgroundColor:"var(--color-lagoon)", borderColor:"var(--color-lagoon-600)" }}>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#F5A6CD" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#FFF59D" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor:"#9BE3CE" }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create Event</h2>
              <p className="text-xs" style={{ color:"var(--color-lagoon-200)" }}>Fill in the details and invite your friends</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white opacity-60 hover:opacity-100 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {saved ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 text-4xl"
              style={{ backgroundColor:"var(--color-sage-50)", border:"2px solid var(--color-sage-100)" }}>✓</div>
            <p className="text-xl font-bold" style={{ color:"var(--color-lagoon)" }}>Event Created!</p>
            <p className="text-sm mt-1" style={{ color:"var(--color-lagoon-300)" }}>Invitations sent to {form.invitees.length} friends.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-7 grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Event Title *</label>
              <input className={inputCls} style={inputStyle} placeholder="e.g. Study Group, Movie Night"
                value={form.title} onChange={e=>set("title",e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Date *</label>
              <input className={inputCls} style={inputStyle} type="date" value={form.date} onChange={e=>set("date",e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Time</label>
              <input className={inputCls} style={inputStyle} type="time" value={form.time} onChange={e=>set("time",e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Location</label>
              <input className={inputCls} style={inputStyle} placeholder="Library Room 3B, Zoom, etc."
                value={form.location} onChange={e=>set("location",e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold mb-1" style={{ color:"var(--color-lagoon-400)" }}>Description</label>
              <textarea className={`${inputCls} resize-none`} style={inputStyle} rows={3}
                placeholder="What's this event about?" value={form.description} onChange={e=>set("description",e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold mb-2" style={{ color:"var(--color-lagoon-400)" }}>Invite Friends</label>
              <div className="grid grid-cols-2 gap-2">
                {friends.map(f => {
                  const checked = form.invitees.includes(f.name);
                  const c = fp(f.colorIdx);
                  return (
                    <label key={f.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition border-2"
                      style={{ backgroundColor: checked ? c.bg : "white",
                        borderColor: checked ? c.border : "var(--color-lagoon-100)" }}>
                      <input type="checkbox" className="w-4 h-4" checked={checked} onChange={()=>toggleInvitee(f.name)}
                        style={{ accentColor:"var(--color-lagoon)" }} />
                      <FriendAvatar friend={f} size="sm" />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: checked ? c.text : "var(--color-lagoon)" }}>{f.name}</p>
                        <StatusDot status={f.status} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!saved && (
          <div className="px-7 py-4 border-t flex gap-3" style={{ borderColor:"var(--color-lagoon-100)" }}>
            <button onClick={onClose}
              className="flex-1 py-3 font-bold rounded-xl text-sm border transition"
              style={{ borderColor:"var(--color-lagoon-200)", color:"var(--color-lagoon-400)" }}>Cancel</button>
            {eventError && <p role="alert" className="text-xs" style={{color:"#9c2649"}}>{eventError}</p>}
            <button onClick={handleSave} disabled={!form.title||!form.date||!form.time}
              className="flex-1 py-3 font-bold rounded-xl text-sm text-white transition"
              style={{ backgroundColor: (!form.title||!form.date) ? "var(--color-lagoon-100)" : "var(--color-lagoon)",
                color: (!form.title||!form.date) ? "var(--color-lagoon-200)" : "white",
                border:"2px solid var(--color-lagoon-600)", boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}>
              Create & Send Invitations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bell Notification Panel ──────────────────────────────────────────────────
function BellPanel({ requests, invitations, notifications, onReadNotification, onGoSchedule, onGoFriends, onGoInvitation, onClose }: {
  requests: FriendRequest[];
  invitations: Invitation[];
  notifications: ApiNotification[];
  onReadNotification:(id:string)=>void;
  onGoSchedule:()=>void;
  onGoFriends: () => void;
  onGoInvitation: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const total = requests.length + invitations.length + notifications.filter(n=>!n.readAt).length;

  return (
    <div ref={panelRef} className="absolute right-0 top-full mt-2 z-50 overflow-hidden"
      style={{ width:340, borderRadius:16, backgroundColor:"white",
        border:"2.5px solid var(--color-lagoon-600)", boxShadow:"4px 4px 0 var(--color-lagoon-600)" }}>
      {/* Panel header */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor:"var(--color-lagoon)", borderBottom:"2px solid var(--color-lagoon-600)" }}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="text-white text-sm font-bold">Notifications</span>
          {total > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ backgroundColor:"var(--color-blush-200)", color:"white" }}>{total}</span>
          )}
        </div>
        <button onClick={onClose} className="text-white opacity-60 hover:opacity-100 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {total === 0 && notifications.length===0 ? (
          <div className="py-10 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-sm font-semibold" style={{ color:"var(--color-lagoon-300)" }}>All caught up!</p>
            <p className="text-xs mt-0.5" style={{ color:"var(--color-misty-400)" }}>No new notifications</p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {/* Friend requests */}
            {requests.length > 0 && (
              <>
                <p className="text-xs font-bold px-2 py-1" style={{ color:"var(--color-lagoon-300)" }}>Friend Requests</p>
                {requests.map(req => {
                  const c = fp(req.colorIdx);
                  return (
                    <button key={req.id}
                      onClick={() => { onGoFriends(); onClose(); }}
                      className="w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 transition"
                      style={{ backgroundColor:"white" }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor=c.bg}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor="white"}>
                      <PlainAvatar initials={req.initials} colorIdx={req.colorIdx} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color:"var(--color-lagoon)" }}>
                          You got a friend request from {req.name}!
                        </p>
                        <p className="text-xs mt-0.5" style={{ color:"var(--color-misty-400)" }}>
                          Tap to view in Friends tab
                        </p>
                      </div>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor" strokeWidth={2} style={{ color:"var(--color-lagoon-200)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </>
            )}

            {/* Invitation divider if both sections present */}
            {requests.length > 0 && invitations.length > 0 && (
              <div style={{ height:1, backgroundColor:"var(--color-lagoon-50)", margin:"4px 8px" }} />
            )}

            {/* Invitations */}
            {invitations.length > 0 && (
              <>
                <p className="text-xs font-bold px-2 py-1" style={{ color:"var(--color-lagoon-300)" }}>Event Invitations</p>
                {invitations.map((inv, i) => {
                  const c = fp(i % FRIEND_PALETTE.length);
                  return (
                    <button key={inv.id}
                      onClick={() => { onGoInvitation(inv.id); onClose(); }}
                      className="w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 transition"
                      style={{ backgroundColor:"white" }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor="var(--color-blush-50)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor="white"}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                        style={{ backgroundColor:"var(--color-blush-50)", border:"1.5px solid var(--color-blush-100)" }}>
                        🎉
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color:"var(--color-lagoon)" }}>
                          {inv.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color:"var(--color-misty-400)" }}>
                          From {inv.organizer} · {inv.date} · Tap to view
                        </p>
                      </div>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor" strokeWidth={2} style={{ color:"var(--color-lagoon-200)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </>
            )}
            {notifications.length>0&&<>
              <p className="text-xs font-bold px-2 py-1" style={{color:"var(--color-lagoon-300)"}}>Event updates</p>
              {notifications.slice(0,15).map(n=><button key={n.id}
                onClick={()=>{if(!n.readAt)onReadNotification(n.id);onGoSchedule();onClose();}}
                className="w-full text-left rounded-xl px-3 py-2.5 text-sm transition"
                style={{background:n.readAt?"white":"var(--color-lagoon-50)",color:"var(--color-lagoon)"}}>
                <span className="font-semibold block">{n.category.replace(/_/g,' ')}</span>
                <span className="text-xs block">{n.message}</span>
              </button>)}
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Theme Panel ─────────────────────────────────────────────────────────────
function ThemePanel({ activeId, onSelect, onClose }: {
  activeId: string;
  onSelect: (theme: PresetTheme | null, custom: string) => void;
  onClose: () => void;
}) {
  const [customColor, setCustomColor] = useState("#525B98");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={panelRef} className="absolute right-0 top-full mt-2 z-50 overflow-hidden"
      style={{ width:320, borderRadius:16, backgroundColor:"white",
        border:"2.5px solid var(--color-lagoon-600)", boxShadow:"4px 4px 0 var(--color-lagoon-600)" }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor:"var(--color-lagoon)", borderBottom:"2px solid var(--color-lagoon-600)" }}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className="text-white text-sm font-bold">Change Theme</span>
        </div>
        <button onClick={onClose} className="text-white opacity-60 hover:opacity-100 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Preset swatches */}
        <div>
          <p className="text-xs font-bold mb-2.5" style={{ color:"var(--color-lagoon-300)" }}>Presets</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_THEMES.map(theme => {
              const isActive = activeId === theme.id;
              return (
                <button key={theme.id} onClick={() => onSelect(theme, theme.swatch)}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition"
                  style={{ backgroundColor: isActive ? "var(--color-lagoon-50)" : "transparent",
                    border: isActive ? "2px solid var(--color-lagoon)" : "2px solid transparent" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--color-lagoon-50)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg relative flex-shrink-0"
                    style={{ backgroundColor: theme.swatch, boxShadow: isActive ? `0 0 0 3px white, 0 0 0 5px ${theme.swatch}` : "none" }}>
                    {isActive && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-semibold" style={{ color:"var(--color-lagoon)" }}>{theme.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height:1, backgroundColor:"var(--color-lagoon-50)" }} />

        {/* Custom color */}
        <div>
          <p className="text-xs font-bold mb-2.5" style={{ color:"var(--color-lagoon-300)" }}>Custom colour</p>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <input type="color" value={customColor}
                onChange={e => setCustomColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ zIndex:1 }} />
              <div className="w-10 h-10 rounded-xl border-2 pointer-events-none"
                style={{ backgroundColor:customColor, borderColor:"var(--color-lagoon-200)" }} />
            </div>
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold"
                style={{ color:"var(--color-lagoon-300)" }}>#</span>
              <input
                className="w-full pl-7 pr-3 py-2 rounded-xl text-sm font-mono font-semibold focus:outline-none transition"
                style={{ backgroundColor:"var(--color-lagoon-50)", border:"2px solid var(--color-lagoon-100)",
                  color:"var(--color-lagoon)" }}
                value={customColor.replace("#","")}
                maxLength={6}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g,"");
                  setCustomColor("#" + v);
                }}
              />
            </div>
            <button
              onClick={() => onSelect(null, customColor)}
              className="px-3 py-2 rounded-xl text-xs font-bold text-white transition flex-shrink-0"
              style={{ backgroundColor:"var(--color-lagoon)", border:"2px solid var(--color-lagoon-600)",
                boxShadow:"2px 2px 0 var(--color-lagoon-600)" }}
              onMouseEnter={e => e.currentTarget.style.opacity="0.85"}
              onMouseLeave={e => e.currentTarget.style.opacity="1"}>
              Apply
            </button>
          </div>

          {/* Live preview strip */}
          <div className="mt-3 flex rounded-xl overflow-hidden" style={{ height:20 }}>
            {[0.9, 0.78, 0.62, 0.45, 0.25, 0, -0.28, -0.45].map((f, i) => {
              const [r,g,b] = hexToRgb(customColor.length === 7 ? customColor : "#525B98");
              const bg = f > 0 ? 255 : 0; const a = Math.abs(f);
              const hex = rgbToHex(r+(bg-r)*a, g+(bg-g)*a, b+(bg-b)*a);
              return <div key={i} style={{ flex:1, backgroundColor: f === 0 ? customColor : hex }} />;
            })}
          </div>
          <p className="text-xs mt-1.5 text-center" style={{ color:"var(--color-lagoon-200)" }}>
            Generated colour scale preview
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout, onProfileUpdate }: { user: ApiUser; onLogout: () => void; onProfileUpdate:(user:ApiUser)=>void }) {
  const [activeTab, setActiveTab] = useState<Tab>(new URLSearchParams(window.location.search).has("join") ? "schedule" : "calendar");
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [rawGroups,setRawGroups]=useState<ApiGroup[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [dashboardError, setDashboardError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const loadDashboard = useCallback(async () => {
    try {
      const [relations, groupRows, inviteRows, noticeRows]=await Promise.all([
        api.friends(),api.groups(),api.events("invitations"),api.notifications()
      ]);
      setFriends(relations.filter(f=>f.status==="ACCEPTED").map(mappedFriend));
      setRequests(relations.filter(f=>f.status==="PENDING" && f.incoming).map((r,i)=>({
        id:r.user.id,name:r.user.name,initials:initialsOf(r.user.name),mutualFriends:0,colorIdx:i
      })));
      setGroups(groupRows.map(mappedGroup));
      setRawGroups(groupRows);
      setInvitations(inviteRows.map(mappedInvitation));
      setNotifications(noticeRows);
      setDashboardError("");
    }catch(err){setDashboardError(errorMessage(err));}
  },[]);
  useEffect(()=>{void loadDashboard()},[loadDashboard]);
  const [showBell, setShowBell] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState("indigo");
  const [openInvId, setOpenInvId] = useState<string | null>(null);

  const handleThemeSelect = useCallback((theme: PresetTheme | null, hex: string) => {
    const vars = theme ? theme.vars : generateScale(hex.length === 7 ? hex : "#525B98");
    applyThemeVars(vars);
    setActiveThemeId(theme ? theme.id : "custom");
    if (theme) setShowTheme(false);
  }, []);

  const handleRemoveFriend = async (id: string) => {
    try{await api.removeFriend(id);await loadDashboard();}catch(err){setDashboardError(errorMessage(err));}
  };
  const handleSendRequest = async (query:string) => {
    const results=await api.searchUsers(query);
    if(results.length===0) throw new Error("No registered user matches that search.");
    if(results.length>1) throw new Error("More than one user matches. Please enter a longer name or their full email.");
    await api.addFriend(results[0].id); await loadDashboard();
  };
  const handleAcceptRequest = async (req: FriendRequest) => {
    try {await api.respondToFriend(req.id,true);await loadDashboard();}
    catch(err){setDashboardError(errorMessage(err));}
  };
  const handleDeclineRequest = async (id: string) => {
    try {await api.respondToFriend(id,false);await loadDashboard();}
    catch(err){setDashboardError(errorMessage(err));}
  };
  const handleCreateGroup = async (g: Group) => {
    const created=await api.createGroup(g.name,"");
    const failed: string[]=[];
    for(const member of g.members) try{await api.addGroupMember(created.id,member.id)}catch(err){failed.push(`${member.name}: ${errorMessage(err)}`)}
    await loadDashboard();
    if(failed.length)throw new Error("Group was created, but some members could not be added: "+failed.join("; "));
  };
  const handleCreateEvent = async (ev: Event) => {
    const start=new Date(`${ev.date}T${ev.time || "09:00"}:00`);
    if(Number.isNaN(start.getTime()))throw new Error("Invalid date/time");
    const end=new Date(start.getTime()+60*60*1000);
    await api.createEvent({title:ev.title,description:ev.description||"",location:ev.location||"",
      start:start.toISOString(),end:end.toISOString(),timeZone:zone,
      inviteeIds:friends.filter(f=>ev.attendees.includes(f.name)).map(f=>f.id)});
    setReloadKey(k=>k+1); await loadDashboard();
  };

  const totalNotifications = requests.length + invitations.length + notifications.filter(n=>!n.readAt).length;

  const navItems: { tab:Tab; icon:React.ReactNode; label:string }[] = [
    { tab:"calendar", label:"Calendar",
      icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    { tab:"events", label:"Events",
      icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
    { tab:"friends", label:"Friends",
      icon:<UserRound size={20} strokeWidth={2} color="currentColor" /> },
    { tab:"groups", label:"Groups",
      icon:<UsersRound size={20} strokeWidth={2} color="currentColor" /> },
    { tab:"schedule", label:"Find Meeting Time", icon:<span className="w-5 h-5">⏰</span> },
  ];

  const today = new Date().toLocaleDateString("en-US",{ weekday:"long", month:"long", day:"numeric" });

  const headerDesc: Partial<Record<Tab, string>> = {
    events:  "Manage your events and invitations",
    friends: "Connect and coordinate with your group",
    groups:  "Create and manage your friend groups",
    schedule: "Collect availability and rank meeting times",
  };

  return (
    <div className="h-screen overflow-hidden flex" style={{ backgroundColor:"var(--color-cream-50)", fontFamily:"'Outfit',sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-60 flex flex-col flex-shrink-0"
        style={{ backgroundColor:"var(--color-lagoon)", borderRight:"2.5px solid var(--color-lagoon-600)" }}>

        <div className="px-5 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor:"rgba(255,255,255,0.15)", border:"2px solid rgba(255,255,255,0.2)" }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-white text-lg font-bold tracking-tight">EventSync</span>
        </div>

        <div className="mx-4 mb-4 rounded-xl px-3 py-2"
          style={{ backgroundColor:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.12)" }}>
          <p className="text-xs font-medium" style={{ color:"var(--color-misty-200)" }}>{today}</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ tab, icon, label }) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition"
              style={{ backgroundColor: activeTab===tab ? "var(--color-cream-50)" : "transparent",
                color: activeTab===tab ? "var(--color-lagoon)" : "rgba(255,255,255,0.85)" }}
              onMouseEnter={e => { if (activeTab!==tab) e.currentTarget.style.backgroundColor="rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { if (activeTab!==tab) e.currentTarget.style.backgroundColor="transparent"; }}>
              {icon}{label}
            </button>
          ))}
        </nav>

        <div className="mx-3 mb-3 rounded-xl p-3"
          style={{ backgroundColor:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.1)" }}>
          <p className="text-xs font-bold mb-2 text-white opacity-70">Friend colours</p>
          <div className="space-y-1.5">
            {friends.map(f => {
              const c = fp(f.colorIdx);
              return (
                <div key={f.id} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor:c.dot }} />
                  <span className="text-xs font-medium truncate" style={{ color:"rgba(255,255,255,0.8)" }}>{f.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-3 pb-4">
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-white text-sm font-bold rounded-xl transition border"
            style={{ backgroundColor:"rgba(255,255,255,0.12)", borderColor:"rgba(255,255,255,0.2)" }}
            onMouseEnter={e=>e.currentTarget.style.backgroundColor="rgba(255,255,255,0.22)"}
            onMouseLeave={e=>e.currentTarget.style.backgroundColor="rgba(255,255,255,0.12)"}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Event
          </button>
        </div>

        <div className="px-4 py-4 border-t" style={{ borderColor:"rgba(255,255,255,0.12)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor:"var(--color-blush-200)" }}>{initialsOf(user.name)}</div>
            <button className="flex-1 min-w-0 text-left" title="Account settings" onClick={()=>setShowProfile(true)}>
              <p className="text-white text-sm font-bold truncate">{user.name}</p>
              <p className="text-xs truncate" style={{ color:"var(--color-misty-200)" }}>{user.email}</p>
            </button>
            <button onClick={onLogout} className="transition" style={{ color:"var(--color-lagoon-200)" }}
              onMouseEnter={e=>e.currentTarget.style.color="white"}
              onMouseLeave={e=>e.currentTarget.style.color="var(--color-lagoon-200)"} title="Sign out">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b px-7 py-4 flex items-center justify-between flex-shrink-0"
          style={{ backgroundColor:"white", borderColor:"var(--color-lagoon-100)" }}>
          <div>
            <h1 className="text-xl font-bold capitalize" style={{ color:"var(--color-lagoon)" }}>{activeTab}</h1>
            {headerDesc[activeTab] && (
              <p className="text-xs mt-0.5" style={{ color:"var(--color-misty-400)" }}>
                {headerDesc[activeTab]}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
          {/* Theme picker */}
          <div className="relative">
            <button
              onClick={() => { setShowTheme(v => !v); setShowBell(false); }}
              className="relative p-2 rounded-xl transition"
              style={{ color: showTheme ? "var(--color-lagoon)" : "var(--color-lagoon-300)",
                backgroundColor: showTheme ? "var(--color-lagoon-50)" : "transparent" }}
              title="Change theme"
              onMouseEnter={e=>{if(!showTheme){e.currentTarget.style.backgroundColor="var(--color-lagoon-50)"; e.currentTarget.style.color="var(--color-lagoon)";}}}
              onMouseLeave={e=>{if(!showTheme){e.currentTarget.style.backgroundColor="transparent"; e.currentTarget.style.color="var(--color-lagoon-300)";}}}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </button>
            {showTheme && (
              <ThemePanel
                activeId={activeThemeId}
                onSelect={handleThemeSelect}
                onClose={() => setShowTheme(false)}
              />
            )}
          </div>
          {/* Bell with dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowBell(v => !v)}
              className="relative p-2 rounded-xl transition"
              style={{ color: showBell ? "var(--color-lagoon)" : "var(--color-lagoon-300)",
                backgroundColor: showBell ? "var(--color-lagoon-50)" : "transparent" }}
              onMouseEnter={e=>{if(!showBell){e.currentTarget.style.backgroundColor="var(--color-lagoon-50)"; e.currentTarget.style.color="var(--color-lagoon)";}}}
              onMouseLeave={e=>{if(!showBell){e.currentTarget.style.backgroundColor="transparent"; e.currentTarget.style.color="var(--color-lagoon-300)";}}}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {totalNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center"
                  style={{ backgroundColor:"var(--color-blush-200)", fontSize:9, fontWeight:700 }}>
                  {totalNotifications}
                </span>
              )}
            </button>
            {showBell && (
              <BellPanel
                requests={requests}
                invitations={invitations}
                notifications={notifications}
                onReadNotification={(id)=>void api.markNotificationRead(id).then(loadDashboard).catch(e=>setDashboardError(errorMessage(e)))}
                onGoSchedule={()=>setActiveTab("schedule")}
                onGoFriends={() => { setActiveTab("friends"); }}
                onGoInvitation={(id) => { setActiveTab("events"); setOpenInvId(id); }}
                onClose={() => setShowBell(false)}
              />
            )}
          </div>
          </div>
        </header>

        {dashboardError && <div role="alert" className="px-5 py-2 text-sm" style={{background:"#fff0f2",color:"#90233b"}}>{dashboardError}
          <button className="ml-3 underline" onClick={()=>void loadDashboard()}>Retry</button></div>}
        <div className="flex-1 overflow-hidden" style={{ padding: activeTab === "calendar" ? 0 : 20 }}>
          {activeTab==="calendar" && <CalendarTab friends={friends} />}
          {activeTab==="schedule" && <LiveScheduling friends={friends.map(f=>({user:{id:f.id,name:f.name},status:"ACCEPTED",incoming:false}))} groups={rawGroups} user={user}/>}
          {activeTab==="events"   && (
            <EventsTab
              onCreateEvent={() => setShowCreate(true)}
              invitations={invitations}
              setInvitations={setInvitations}
              openInvId={openInvId}
              onClearOpenInv={() => setOpenInvId(null)}
              reloadKey={reloadKey}
            />
          )}
          {activeTab==="friends"  && (
            <FriendsTab
              friends={friends}
              onRemoveFriend={handleRemoveFriend}
              onSendRequest={handleSendRequest}
              requests={requests}
              onAcceptRequest={handleAcceptRequest}
              onDeclineRequest={handleDeclineRequest}
            />
          )}
          {activeTab==="groups" && (
            <GroupsTab
              friends={friends}
              groups={groups}
              onCreateGroup={handleCreateGroup}
              onRefresh={loadDashboard}
              user={user}
            />
          )}
        </div>
      </main>

      {showProfile&&<LiveProfile user={user} onClose={()=>setShowProfile(false)} onUpdated={onProfileUpdate}/>}
      {showCreate && (
        <CreateEventModal
          friends={friends}
          onClose={() => setShowCreate(false)}
          onSave={handleCreateEvent}
        />
      )}
    </div>
  );
}

// The Figma prototype also contained a separate sample-admin dashboard backed by
// hard-coded events and members. This implementation uses real groups and roles
// in the connected Groups workspace instead, rather than presenting fake data.

// ─── Root: authenticated session shared by every connected screen ──────────
export default function App() {
  const [user,setUser] = useState<ApiUser|null>(null);
  const [checking,setChecking] = useState(true);
  const [authNotice,setAuthNotice] = useState("");
  useEffect(() => {
    let active=true;
    (async () => {
      try {
        const me=await api.me();
        if (!active) return;
        setUser(me);
        if (window.location.pathname === "/outlook/callback") {
          try {
            const success = await api.finishOutlookConnection();
            setAuthNotice(success ? "Outlook connected. Open Calendar to sync your meetings." : "Outlook connection was cancelled.");
          } catch (error) { setAuthNotice("Outlook connection failed: "+errorMessage(error)); }
          window.history.replaceState({},"", "/");
        }
      } catch { /* No valid saved session; show the login screen. */ }
      finally { if(active)setChecking(false); }
    })();
    return () => {active=false};
  }, []);
  const authenticate = async (mode:AuthMode,email:string,password:string,name:string) => {
    const result=mode==="signup"?await api.signup(name,email,password,zone):await api.login(email,password);
    setUser(result.user);
  };
  const logout = async () => {try {await api.logout();} finally {setUser(null);}};
  if(checking) return <div className="min-h-screen flex items-center justify-center" style={{background:"#EDEEF8",color:"#525B98"}}>Connecting to EventSync…</div>;
  return <>
    {authNotice && <div role="status" className="fixed z-50 top-2 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow" style={{background:"#fff",color:"#1e3a5f"}}>{authNotice}<button onClick={()=>setAuthNotice("")} className="ml-3">✕</button></div>}
    {user ? <Dashboard user={user} onLogout={logout} onProfileUpdate={setUser}/> : <AuthScreen onLogin={authenticate}/>}
  </>;
}
