-- Additive migration: preserve legacy events, invitations and weekly availability.
-- Legacy fixed-time events become FINALIZED; newly proposed events have no finalized time.
ALTER TABLE events MODIFY COLUMN starts_at TIMESTAMP(6) NULL;
ALTER TABLE events MODIFY COLUMN ends_at TIMESTAMP(6) NULL;
ALTER TABLE events ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'FINALIZED';
ALTER TABLE events ADD COLUMN window_start TIMESTAMP(6) NULL;
ALTER TABLE events ADD COLUMN window_end TIMESTAMP(6) NULL;
ALTER TABLE events ADD COLUMN duration_minutes INT NULL;
ALTER TABLE events ADD COLUMN invite_code_hash VARCHAR(64) NULL;
ALTER TABLE events ADD COLUMN group_id VARCHAR(36) NULL;
ALTER TABLE events ADD COLUMN response_deadline TIMESTAMP(6) NULL;
CREATE UNIQUE INDEX idx_event_join_code ON events(invite_code_hash);

CREATE TABLE event_groups (
 id VARCHAR(36) PRIMARY KEY,
 name VARCHAR(160) NOT NULL,
 description VARCHAR(1000) NOT NULL DEFAULT '',
 owner_id VARCHAR(36) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE TABLE group_members (
 group_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 role VARCHAR(16) NOT NULL,
 PRIMARY KEY(group_id,user_id),
 FOREIGN KEY(group_id) REFERENCES event_groups(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE events ADD CONSTRAINT fk_event_group FOREIGN KEY (group_id) REFERENCES event_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_events_group ON events(group_id);

-- Event-specific availability is separate from the existing reusable weekly availability.
CREATE TABLE event_availability (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 PRIMARY KEY(event_id,user_id,starts_at),
 FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_event_availability_time ON event_availability(event_id,starts_at,ends_at);

-- Manual blocks and explicit free overrides take precedence over Outlook imports.
CREATE TABLE manual_overrides (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 status VARCHAR(12) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_override_user_time ON manual_overrides(user_id,starts_at,ends_at);

CREATE TABLE notifications (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 event_id VARCHAR(36) NULL,
 category VARCHAR(32) NOT NULL,
 message VARCHAR(500) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL,
 read_at TIMESTAMP(6) NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
CREATE INDEX idx_notifications_user ON notifications(user_id,created_at);
CREATE TABLE event_submissions (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 submitted_at TIMESTAMP(6) NOT NULL,
 PRIMARY KEY(event_id,user_id),
 FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
