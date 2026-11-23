-- Global numeric user discriminator; immutable, unique and allocated by MySQL.
CREATE TABLE user_handles (
  discriminator BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  username VARCHAR(32) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO user_handles(user_id,username) SELECT id,'member' FROM users ORDER BY id;
ALTER TABLE users ADD COLUMN organization_publisher BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN organization_name VARCHAR(160);
CREATE TABLE support_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  subject VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  admin_reply TEXT,
  created_at TIMESTAMP(6) NOT NULL,
  resolved_at TIMESTAMP(6),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_support_status_time ON support_requests(status,created_at);
