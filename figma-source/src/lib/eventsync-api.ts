/** Copy into the Figma Make React project's src/lib/. No client secrets belong here. */
export type User = { id: string; name: string; email: string; timeZone: string; systemAdmin: boolean };
export type AdminSummary = { users:number; groups:number; events:number; pendingInvitations:number };
export type AdminUser = { id:string; name:string; email:string; systemAdmin:boolean; groupCount:number };
export type AdminGroup = { id:string; name:string; description:string; ownerId:string; ownerName:string; eventCount:number;
  members:{id:string;name:string;email:string;role:"ADMIN"|"MEMBER"}[] };
export type PublicEvent = { id:string;title:string;description:string;location:string;start:string;end:string;timeZone:string;cancelled:boolean;createdBy:string;interestedCount:number;interested:boolean };
export type PublicEventInput = { title:string;description:string;location:string;start:string;end:string;timeZone:string };
export type GroupMemberStats = {userId:string;name:string;present:number;absent:number;verified:number;attendanceRate:number;lastAttended:string|null};
export type GroupEventStats = {id:string;title:string;start:string;markedPresent:number;markedAbsent:number;unmarked:number};
export type GroupInsights = {groupId:string;totalMembers:number;pastEvents:number;verifiedMarks:number;attendanceRate:number;members:GroupMemberStats[];events:GroupEventStats[]};
export type AttendanceMark = {userId:string;name:string;response:string|null;status:'PRESENT'|'ABSENT'|null};
export type Identity = {username:string;discriminator:number;tag:string;organizationPublisher:boolean;organizationName:string|null};
export type SupportRequest = {id:string;userId:string;email:string;kind:"ISSUE"|"REQUEST";subject:string;description:string;status:string;adminReply:string|null;createdAt:string};
export type Publisher = {id:string;name:string;email:string;approved:boolean;organizationName:string|null};
export type PublicUser = Pick<User, "id" | "name">;
export type Friend = { user: PublicUser; status: "PENDING" | "ACCEPTED"; incoming: boolean };
export type Interval = { start: string; end: string };
export type Slot = Interval & {
  localTime: string; youAvailable: boolean; availableCount: number;
  availableFriends: PublicUser[]; best: boolean;
};
export type CalendarWeek = {
  weekStart: string; timeZone: string; selectedStarts: string[]; busy: Interval[];
  outlookCoverage: { calendarId: string; start: string; end: string; syncedAt: string }[];
  overrides: ManualOverride[];
};
export type EventInput = Interval & {
  title: string; description: string; location: string; timeZone: string; inviteeIds: string[]; groupId?: string | null;
};
export type Event = Omit<EventInput, "inviteeIds"> & {
  id: string; organizerId: string; cancelled: boolean; groupId: string | null;
  myResponse: "ORGANIZER" | "PENDING" | "ACCEPTED" | "DECLINED";
  guests: { user: PublicUser; response: "PENDING" | "ACCEPTED" | "DECLINED" }[];
};
export type OutlookCalendar = { id: string; name: string; isDefaultCalendar: boolean };
export type OutlookStatus = { connected: boolean; connectedAt?: string; lastSyncedAt?: string | null };
export type GroupMember = { user: PublicUser; role: "ADMIN" | "MEMBER" };
export type Group = { id: string; name: string; description: string; ownerId: string; myRole: "ADMIN" | "MEMBER"; members: GroupMember[] };
export type PollStatus = "DRAFT" | "COLLECTING" | "FINALIZED" | "CANCELLED";
export type PollInput = {
  title: string; description?: string; location?: string;
  windowStart: string; windowEnd: string; durationMinutes: number;
  timeZone: string; groupId?: string | null; responseDeadline?: string | null;
  inviteeIds?: string[]; draft?: boolean;
};
export type Poll = {
  id: string; organizerId: string; title: string; description: string; location: string;
  status: PollStatus; groupId: string | null; windowStart: string; windowEnd: string;
  durationMinutes: number; timeZone: string; responseDeadline: string | null;
  finalizedStart: string | null; finalizedEnd: string | null;
  participants: { user: PublicUser; response: "PENDING" | "ACCEPTED" | "DECLINED"; submitted: boolean }[];
  myAvailability: Interval[];
};
export type PollRecommendation = Interval & {
  localStart: string; availableCount: number; totalParticipants: number;
  availableUsers: PublicUser[]; unavailableUsers: PublicUser[]; allAvailable: boolean;
};
export type PollRecommendations = { eventId: string; participantCount: number; slotMinutes: number; suggestions: PollRecommendation[] };
export type ManualOverride = Interval & { id: string; status: "AVAILABLE" | "BUSY" };
export type Notification = { id: string; eventId: string | null; category: string; message: string; createdAt: string; readAt: string | null };
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createEventSyncApi(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, ""); // Example: https://api.example.com/api
  const tokenKey = `eventsync:${root}:token`;
  const pendingKey = `eventsync:${root}:outlook`;
  let token = sessionStorage.getItem(tokenKey);
  async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { token = null; sessionStorage.removeItem(tokenKey); }
      throw new ApiError(response.status, data.error || `Request failed (${response.status})`);
    }
    return data as T;
  }
  async function authenticate(path: string, body: unknown) {
    const result = await request<{ accessToken: string; expiresAt: string; user: User }>(path, "POST", body);
    token = result.accessToken; sessionStorage.setItem(tokenKey, token);
    return result;
  }
  return {
    signup: (name: string, email: string, password: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) =>
      authenticate("/auth/signup", { name, email, password, timeZone }),
    login: (email: string, password: string) => authenticate("/auth/login", { email, password }),
    me: () => request<User>("/me"),
    getTheme: () => request<{themeId:string;customColor:string|null}>("/me/theme"),
    saveTheme: (themeId:string, customColor:string|null) => request<{themeId:string;customColor:string|null}>("/me/theme","PUT",{themeId,customColor}),
    logout: async () => {
      try { await request("/auth/logout", "POST"); }
      finally { token = null; sessionStorage.removeItem(tokenKey); sessionStorage.removeItem(pendingKey); }
    },
    publicEvents: () => request<PublicEvent[]>('/public-events'),
    createPublicEvent: (input:PublicEventInput) => request<PublicEvent>('/public-events','POST',input),
    updatePublicEvent: (id:string,input:PublicEventInput) => request<PublicEvent>(`/public-events/${encodeURIComponent(id)}`,'PUT',input),
    deletePublicEvent: (id:string) => request(`/public-events/${encodeURIComponent(id)}`,'DELETE'),
    setPublicEventInterest: (id:string,interested:boolean) => request<PublicEvent>(`/public-events/${encodeURIComponent(id)}/interest`,interested?'PUT':'DELETE'),
    groupInsights: (id:string) => request<GroupInsights>(`/groups/${encodeURIComponent(id)}/insights`),
    groupAttendance: (groupId:string,eventId:string) => request<AttendanceMark[]>(`/groups/${encodeURIComponent(groupId)}/insights/events/${encodeURIComponent(eventId)}/attendance`),
    markAttendance: (groupId:string,eventId:string,userId:string,status:'PRESENT'|'ABSENT') => request<AttendanceMark[]>(`/groups/${encodeURIComponent(groupId)}/insights/events/${encodeURIComponent(eventId)}/attendance`,'PUT',{userId,status}),
    clearAttendance: (groupId:string,eventId:string,userId:string) => request<AttendanceMark[]>(`/groups/${encodeURIComponent(groupId)}/insights/events/${encodeURIComponent(eventId)}/attendance/${encodeURIComponent(userId)}`,'DELETE'),
    adminSummary: () => request<AdminSummary>("/admin/summary"),
    identity: () => request<Identity>("/community/identity"),
    renameUsername: (username:string) => request<Identity>("/community/identity","PUT",{username}),
    submitSupport: (kind:"ISSUE"|"REQUEST",subject:string,description:string) => request<SupportRequest>("/community/support","POST",{kind,subject,description}),
    mySupport: () => request<SupportRequest[]>("/community/support/mine"),
    adminSupport: () => request<SupportRequest[]>("/community/admin/support"),
    reviewSupport: (id:string,status:string,reply:string) => request<SupportRequest>(`/community/admin/support/${encodeURIComponent(id)}`,"PUT",{status,reply}),
    publishers: () => request<Publisher[]>("/community/admin/publishers"),
    setPublisher: (id:string,approved:boolean,organizationName:string) => request<Publisher>(`/community/admin/publishers/${encodeURIComponent(id)}`,"PUT",{approved,organizationName}),
    adminUsers: () => request<AdminUser[]>("/admin/users"),
    adminGroups: () => request<AdminGroup[]>("/admin/groups"),
    adminUpdateGroup: (id:string,name:string,description:string) => request<AdminGroup>(`/admin/groups/${encodeURIComponent(id)}`,"PUT",{name,description}),
    adminAddMember: (id:string,userId:string) => request<AdminGroup>(`/admin/groups/${encodeURIComponent(id)}/members`,"POST",{userId}),
    adminChangeMemberRole: (id:string,userId:string,role:"ADMIN"|"MEMBER") => request<AdminGroup>(`/admin/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/role`,"PUT",{role}),
    adminRemoveMember: (id:string,userId:string) => request<AdminGroup>(`/admin/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,"DELETE"),
    adminDeleteGroup: (id:string) => request(`/admin/groups/${encodeURIComponent(id)}`,"DELETE"),
    friends: () => request<Friend[]>("/friends"),
    searchUsers: (query: string) => request<PublicUser[]>(`/friends/search?query=${encodeURIComponent(query)}`),
    addFriend: (userId: string) => request("/friends/requests", "POST", { userId }),
    respondToFriend: (userId: string, accept: boolean) => request(`/friends/requests/${encodeURIComponent(userId)}/respond`, "POST", { accept }),
    removeFriend: (userId: string) => request(`/friends/${encodeURIComponent(userId)}`, "DELETE"),
    week: (weekStart: string, timeZone: string) => request<CalendarWeek>(`/availability?${new URLSearchParams({ weekStart, timeZone })}`),
    weekSlots: (weekStart: string, timeZone: string) => request<(Interval & { localTime: string })[]>(`/availability/slots?${new URLSearchParams({ weekStart, timeZone })}`),
    saveAvailability: (weekStart: string, timeZone: string, slots: string[]) =>
      request<CalendarWeek>("/availability", "PUT", { weekStart, timeZone, slots }),
    matches: (weekStart: string, timeZone: string, friendIds: string[], groupId?: string | null) =>
      request<{ slots: Slot[]; highestCount: number }>("/availability/matches", "POST", { weekStart, timeZone, friendIds, groupId:groupId || null }),
    events: (view: "upcoming" | "invitations" | "organized" = "upcoming",groupId?:string) => request<Event[]>(`/events?${new URLSearchParams({view,...(groupId?{groupId}:{})})}`),
    event: (id: string) => request<Event>(`/events/${encodeURIComponent(id)}`),
    createEvent: (input: EventInput) => request<Event>("/events", "POST", input),
    updateEvent: (id: string, input: EventInput) => request<Event>(`/events/${encodeURIComponent(id)}`, "PUT", input),
    cancelEvent: (id: string) => request(`/events/${encodeURIComponent(id)}`, "DELETE"),
    respondToEvent: (id: string, accept: boolean) => request<Event>(`/events/${encodeURIComponent(id)}/respond`, "POST", { response: accept ? "ACCEPTED" : "DECLINED" }),
    updateProfile: (name: string, timeZone: string) => request<User>("/me", "PUT", { name, timeZone }),
    changePassword: (currentPassword: string, newPassword: string) => request("/me/password", "POST", { currentPassword, newPassword }),
    changeEmail: (newEmail: string, currentPassword: string) => request<User>("/me/email", "PUT", { newEmail, currentPassword }),
    groups: () => request<Group[]>("/groups"),
    group: (id: string) => request<Group>(`/groups/${encodeURIComponent(id)}`),
    createGroup: (name: string, description = "") => request<Group>("/groups", "POST", { name, description }),
    updateGroup: (id: string, name: string, description = "") => request<Group>(`/groups/${encodeURIComponent(id)}`, "PUT", { name, description }),
    addGroupMember: (id: string, userId: string) => request<Group>(`/groups/${encodeURIComponent(id)}/members`, "POST", { userId }),
    setGroupMemberRole: (id: string, userId: string, role: "ADMIN" | "MEMBER") => request<Group>(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/role`, "PUT", { role }),
    removeGroupMember: (id: string, userId: string) => request(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, "DELETE"),
    deleteGroup: (id: string) => request(`/groups/${encodeURIComponent(id)}`, "DELETE"),
    polls: (view: "all" | "organized" | "invited" | "draft" | "collecting" | "finalized" | "cancelled" = "all", query = "") =>
      request<Poll[]>(`/scheduling-events?${new URLSearchParams({ view, query })}`),
    poll: (id: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}`),
    createPoll: (input: PollInput) => request<{ event: Poll; invitationCode: string }>("/scheduling-events", "POST", input),
    updatePoll: (id: string, input: PollInput) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}`, "PUT", input),
    publishPoll: (id: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/publish`, "POST"),
    rotatePollCode: (id: string) => request<{ invitationCode: string }>(`/scheduling-events/${encodeURIComponent(id)}/rotate-code`, "POST"),
    inviteToPoll: (id: string, userId: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/invite`, "POST", { userId }),
    inviteEmailToPoll: (id: string, email: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/invite-email`, "POST", { email }),
    removePollParticipant: (id: string, userId: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}`, "DELETE"),
    joinPoll: (id: string, code: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/join`, "POST", { code }),
    joinGroupPoll: (id: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/join-group`, "POST"),
    respondToPoll: (id: string, accept: boolean) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/respond`, "POST", { accept }),
    submitPollAvailability: (id: string, slots: Interval[]) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/availability`, "PUT", { slots }),
    prefillPollWeekly: (id: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/prefill-my-weekly`, "POST"),
    previewMeetingTimes: (input: {windowStart:string;windowEnd:string;durationMinutes:number;timeZone:string;groupId?:string|null;inviteeIds:string[]}) =>
      request<PollRecommendations>('/scheduling-events/preview','POST',input),
    recommendPollTimes: (id: string) => request<PollRecommendations>(`/scheduling-events/${encodeURIComponent(id)}/recommendations`),
    finalizePoll: (id: string, start: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/finalize`, "POST", { start }),
    reopenPoll: (id: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/reopen`, "POST"),
    cancelPoll: (id: string) => request<Poll>(`/scheduling-events/${encodeURIComponent(id)}/cancel`, "POST"),
    deletePoll: (id: string) => request(`/scheduling-events/${encodeURIComponent(id)}`, "DELETE"),
    deletePastPoll: (id: string) => request(`/scheduling-events/${encodeURIComponent(id)}/past`, "DELETE"),
    async downloadPollCalendar(id: string) {
      const response = await fetch(`${root}/scheduling-events/${encodeURIComponent(id)}/calendar.ics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new ApiError(response.status, "Could not download calendar event");
      return response.blob(); // Use URL.createObjectURL(blob) to offer an .ics download in the UI.
    },
    saveWeekBusy: (weekStart:string,timeZone:string,slots:string[]) => request<{ok:boolean}>("/availability/overrides/week","PUT",{weekStart,timeZone,slots}),
    manualOverrides: (start: string, end: string) => request<ManualOverride[]>(`/availability/overrides?${new URLSearchParams({ start, end })}`),
    addManualOverride: (start: string, end: string, status: "AVAILABLE" | "BUSY") =>
      request<ManualOverride>("/availability/overrides", "POST", { start, end, status }),
    removeManualOverride: (id: string) => request(`/availability/overrides/${encodeURIComponent(id)}`, "DELETE"),
    notifications: () => request<Notification[]>("/notifications"),
    markNotificationRead: (id: string) => request(`/notifications/${encodeURIComponent(id)}/read`, "POST"),
    outlookStatus: () => request<OutlookStatus>("/outlook/status"),
    connectOutlook: async () => {
      const result = await request<{ authorizationUrl: string; state: string; completionSecret: string }>("/outlook/connect", "POST");
      sessionStorage.setItem(pendingKey, JSON.stringify({ state: result.state, completionSecret: result.completionSecret }));
      // Stay in the same tab so tab-scoped login and OAuth completion secrets survive.
      window.location.assign(result.authorizationUrl);
    },
    finishOutlookConnection: async () => {
      const query = new URLSearchParams(window.location.search);
      if (query.get("outlook") === "cancelled") {
        sessionStorage.removeItem(pendingKey);
        window.history.replaceState({}, "", window.location.pathname);
        return false;
      }
      const state = query.get("state");
      if (!state) return false;
      const pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      if (!pending || pending.state !== state) throw new Error("Outlook connection must finish in the tab where it started.");
      await request("/outlook/complete", "POST", { state, completionSecret: pending.completionSecret });
      sessionStorage.removeItem(pendingKey);
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    },
    outlookCalendars: () => request<OutlookCalendar[]>("/outlook/calendars"),
    syncOutlook: (calendarId: string, start: string, end: string) =>
      request<{ importedBusyIntervals: number; start: string; end: string; syncedAt: string }>("/outlook/sync", "POST", { calendarId, start, end }),
    syncDefaultOutlook: (start: string, end: string) =>
      request<{ importedBusyIntervals: number; start: string; end: string; syncedAt: string }>("/outlook/sync-default", "POST", { start, end }),
    disconnectOutlook: () => request("/outlook", "DELETE"),
  };
}
