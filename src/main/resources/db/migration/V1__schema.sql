CREATE TABLE users (
 id VARCHAR(36) PRIMARY KEY,
 email VARCHAR(254) NOT NULL UNIQUE,
 name VARCHAR(80) NOT NULL,
 password_hash VARCHAR(100) NOT NULL,
 time_zone VARCHAR(80) NOT NULL
);
CREATE TABLE sessions (
 token_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 expires_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE friendships (
 low_id VARCHAR(36) NOT NULL,
 high_id VARCHAR(36) NOT NULL,
 requester_id VARCHAR(36) NOT NULL,
 status VARCHAR(16) NOT NULL,
 PRIMARY KEY(low_id, high_id),
 FOREIGN KEY(low_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(high_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE availability (
 user_id VARCHAR(36) NOT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 PRIMARY KEY(user_id, starts_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE events (
 id VARCHAR(36) PRIMARY KEY,
 organizer_id VARCHAR(36) NOT NULL,
 title VARCHAR(160) NOT NULL,
 description TEXT NOT NULL,
 location VARCHAR(255) NOT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 time_zone VARCHAR(80) NOT NULL,
 cancelled BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(organizer_id) REFERENCES users(id)
);
CREATE INDEX idx_event_time ON events(starts_at, ends_at);
CREATE TABLE invitations (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 response VARCHAR(16) NOT NULL,
 PRIMARY KEY(event_id, user_id),
 FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE outlook_connections (
 user_id VARCHAR(36) PRIMARY KEY,
 token_blob TEXT NOT NULL,
 connected_at TIMESTAMP(6) NOT NULL,
 last_synced_at TIMESTAMP(6),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE oauth_pending (
 state_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 session_hash VARCHAR(64) NOT NULL,
 completion_hash VARCHAR(64) NOT NULL,
 verifier_blob TEXT NOT NULL,
 token_blob TEXT,
 expires_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE imported_busy (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 calendar_id VARCHAR(512) NOT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_busy_user_time ON imported_busy(user_id, starts_at, ends_at);
CREATE TABLE calendar_syncs (
 user_id VARCHAR(36) NOT NULL,
 calendar_id VARCHAR(512) NOT NULL,
 range_start TIMESTAMP(6) NOT NULL,
 range_end TIMESTAMP(6) NOT NULL,
 synced_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
