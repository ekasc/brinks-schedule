-- Seed users only — for Cloudflare D1
-- Run: npx wrangler d1 execute DB --file=./d1-seed-users.sql
-- Password for all is `changeme` (bcrypt 10). Change in /admin after first login.

INSERT INTO users (username, password_hash, role, display_name) VALUES
  ('admin',     '$2a$10$tCLwY.U5boGPMKQCbJPzDeNvm1c7Q6hxpFvq/1FDYtUhn1WkaYH92', 'admin', 'Admin'),
  ('admin_esc', '$2a$10$R5GJDtf7AO2vUYeuBGUCDuOKGSgcaPwh6rtpKzXXxjeO1Ld/dLON6', 'admin', 'Admin (esc)'),
  ('ekas',      '$2a$10$eCnPTFl6kNYIqJeX0HlytuxHYqZTLkmeswxVKXPBsmZUAvIUVkPl2', 'sales', 'Ekas'),
  ('raman',     '$2a$10$SqGGxAMoEleBc13w7NrucOYJlZ1zmaRklJRnNLjX39Iu1fsMZOcB6', 'sales', 'Raman'),
  ('tech1',     '$2a$10$V9UcJTe1gMf9V.BvLrGtXuidwDgBgDoM4pL6oOlcXvN5FudXorQEK', 'tech', 'Tech 1'),
  ('tech2',     '$2a$10$qiOl/fhusgcqV3YjeG3GLOyF2lC8zyhJM1YiGy8OHghGeDP9X11om', 'tech', 'Tech 2')
ON CONFLICT(username) DO UPDATE SET
  password_hash = excluded.password_hash,
  role = excluded.role,
  display_name = excluded.display_name;
