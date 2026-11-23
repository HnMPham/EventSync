-- Per-account theme preferences. Defaults to the existing Indigo preset.
ALTER TABLE users
  ADD COLUMN theme_id VARCHAR(20) NOT NULL DEFAULT 'indigo',
  ADD COLUMN theme_custom_color CHAR(7) NULL;
