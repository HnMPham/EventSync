-- Public announcements are distinct from private scheduling events.
CREATE TABLE public_events (
 id VARCHAR(36) PRIMARY KEY,
 created_by VARCHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL,
 description TEXT NOT NULL,
 location VARCHAR(255) NOT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 time_zone VARCHAR(80) NOT NULL,
 cancelled BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_public_events_time ON public_events(cancelled,starts_at);
CREATE TABLE public_event_rsvps (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL,
 PRIMARY KEY(event_id,user_id),
 FOREIGN KEY (event_id) REFERENCES public_events(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Explicit, manually verified attendance: never infer presence from RSVP or calendar acceptance.
CREATE TABLE group_event_attendance (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 status VARCHAR(12) NOT NULL,
 verified_by VARCHAR(36) NOT NULL,
 verified_at TIMESTAMP(6) NOT NULL,
 PRIMARY KEY(event_id,user_id),
 FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (verified_by) REFERENCES users(id)
);
CREATE INDEX idx_group_attendance_member ON group_event_attendance(user_id,status);
