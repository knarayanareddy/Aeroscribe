-- 002 — accounts.
--
-- A subject is the IdP's immutable identifier; the email is a convenience and
-- may change. Roles are `researcher | reviewer | admin` and there is no default
-- at the database level on purpose: a row always says what its owner may do, so
-- a reader never has to know what "missing" would have meant.
--
-- Run ownership is *not* a column here. `runs.doc` already holds the whole run
-- document, `PipelineRun.ownerSub` is part of it, and there is exactly one write
-- path (`RunStore.save`). A separate `owner_sub` column would be a second copy
-- of the same fact, kept in sync by hand — the drift this repository keeps
-- paying to avoid. When "list my runs" needs to be a query rather than a filter,
-- the column comes back as a generated one, not as a second write.

CREATE TABLE users (
  sub        text PRIMARY KEY,
  email      text,
  name       text,
  role       text NOT NULL CHECK (role IN ('researcher', 'reviewer', 'admin')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX users_role_idx ON users (role);
