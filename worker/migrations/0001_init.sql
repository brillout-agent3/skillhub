-- People who logged in with GitHub: only what the site shows of them.
CREATE TABLE users (
  -- GitHub's numeric user id, which, unlike the login, never changes. 0 is local dev's test user.
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  -- Times are milliseconds since 1970.
  created_at INTEGER NOT NULL
);

-- Logged-in browsers. Their cookie holds a random token, of which only the SHA-256 is kept.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_by_user ON sessions (user_id);

-- The skills and bundles each person saved, by their id in data/skills.jsonc. A save whose skill
-- has left skills.jsonc stays: the site hides it, and shows it again if the skill comes back.
CREATE TABLE saves (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('skill', 'bundle')),
  entry_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, entry_id)
) WITHOUT ROWID;
