-- 001 — the evidence chain, runs, run options and the audit trail.
--
-- Append-only is enforced here, not by convention: a trigger rejects UPDATE and
-- DELETE on `evidence`, so an application bug (or a `psql` session) cannot
-- rewrite history. The hash chain then makes the same edits detectable even if
-- somebody disables the trigger; the two mechanisms are independent on purpose.

CREATE TABLE evidence (
  seq          bigint PRIMARY KEY,
  id           uuid NOT NULL UNIQUE,
  kind         text NOT NULL,
  run_id       text NOT NULL,
  stage_id     integer,
  label        text NOT NULL,
  payload      jsonb NOT NULL,
  payload_hash text NOT NULL,
  prev_hash    text NOT NULL,
  hash         text NOT NULL,
  created_at   timestamptz NOT NULL
);

-- The unique primary key on `seq` is the backstop for concurrent appends: even
-- if the advisory lock were bypassed, two writers cannot both claim a sequence
-- number, so the chain cannot fork.
CREATE UNIQUE INDEX evidence_seq_gap_check ON evidence (seq);

CREATE TABLE runs (
  id         text PRIMARY KEY,
  doc        jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE run_options (
  run_id text PRIMARY KEY REFERENCES runs (id) ON DELETE CASCADE,
  doc    jsonb NOT NULL
);

CREATE TABLE audit (
  id     bigserial PRIMARY KEY,
  at     timestamptz NOT NULL,
  action text NOT NULL,
  run_id text,
  actor  text NOT NULL,
  detail jsonb
);

CREATE INDEX audit_run_id_idx ON audit (run_id);

CREATE FUNCTION aeroscribe_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the evidence registry is append-only: % on evidence is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER evidence_append_only
  BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION aeroscribe_immutable();

-- TRUNCATE bypasses row triggers, so it needs its own statement-level guard.
CREATE TRIGGER evidence_no_truncate
  BEFORE TRUNCATE ON evidence
  FOR EACH STATEMENT EXECUTE FUNCTION aeroscribe_immutable();
