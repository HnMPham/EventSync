-- System administrators are distinct from per-group administrators.
-- Public signup always creates a non-admin account.
ALTER TABLE users ADD COLUMN system_admin BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE admin_audit_log (
  id VARCHAR(36) PRIMARY KEY,
  admin_id VARCHAR(36) NOT NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id VARCHAR(36) NOT NULL,
  occurred_at TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);
CREATE INDEX idx_admin_audit_occurred ON admin_audit_log(occurred_at);
