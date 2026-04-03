-- Pattern Atlas — Supabase Schema
-- Run this in the Supabase SQL editor to create all tables.
-- Designed for PostgreSQL (Supabase).
--
-- Changelog
-- v1.1  Expanded journal schema: every session field is persisted.
--       relationship_source column on pattern_relationships distinguishes
--       explicit (from pattern_relationships JSON) vs inferred (from related_patterns).

-- ─────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;       -- enables fast text search


-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────
create type complexity_class as enum (
  'phase_transition',
  'emergence',
  'cascade',
  'attractor',
  'feedback',
  'configuration',
  'concealment',
  'flow',
  'foundation'
);

create type relationship_type as enum (
  'generates',
  'amplifies',
  'contradicts',
  'precedes',
  'requires',
  'mirrors',
  'related'       -- fallback for inferred edges from related_patterns field
);

create type relationship_source as enum (
  'explicit',     -- from pattern_relationships[] in patterns.json
  'inferred'      -- derived from related_patterns[] field on each pattern
);

create type pattern_visibility as enum (
  'seen',         -- user recognised this pattern in real time
  'missed',       -- AI surfaced it; user did not notice it
  'retroactive'   -- user identified it themselves in reflection
);


-- ─────────────────────────────────────────────
-- REGISTERS
-- Epistemological modes / lenses.
-- ─────────────────────────────────────────────
create table registers (
  id            text primary key,          -- slug, e.g. "becoming"
  name          text not null,
  description   text,
  display_order integer not null default 0
);

comment on table registers is
  'Epistemological registers that group patterns by the mode of understanding they activate.';


-- ─────────────────────────────────────────────
-- PATTERNS
-- Core knowledge objects.
-- ─────────────────────────────────────────────
create table patterns (
  id                  text primary key,     -- slug from JSON, e.g. "phase-transition"
  name                text not null,
  subtitle            text,
  register            text not null references registers(id),
  registers           text[]  not null default '{}',
  source_disciplines  text[]  not null default '{}',
  source_thinkers     text[]  not null default '{}',
  complexity_class    complexity_class,

  -- Core content
  core_claim          text,
  structure           text,
  conditions          text,
  failure_modes       text,
  situation_signature text,
  hot_signals         text,
  leverage_points     text,
  koan                text,
  canonical_example   text,
  counter_example     text,
  application_questions text,
  common_mistakes     text,
  practitioner_notes  text,

  -- Taxonomy helpers
  example_domains     text[]  not null default '{}',
  related_patterns    text[]  not null default '{}',  -- raw slugs from JSON (denormalised convenience)

  -- Meta
  difficulty          integer check (difficulty between 1 and 5),
  field_tested        boolean not null default false,
  date_added          date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table patterns is
  'The core pattern library — one row per named pattern.';

-- Full-text search index (name, subtitle, core_claim, koan, hot_signals, situation_signature)
create index patterns_fts_idx on patterns
  using gin (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(subtitle, '') || ' ' ||
      coalesce(core_claim, '') || ' ' ||
      coalesce(koan, '') || ' ' ||
      coalesce(hot_signals, '') || ' ' ||
      coalesce(situation_signature, '')
    )
  );

-- Trigram index for fuzzy name search
create index patterns_name_trgm_idx on patterns using gin (name gin_trgm_ops);

-- Indexes for common filters
create index patterns_register_idx      on patterns(register);
create index patterns_complexity_idx    on patterns(complexity_class);
create index patterns_difficulty_idx    on patterns(difficulty);
create index patterns_field_tested_idx  on patterns(field_tested);

-- Auto-update updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger patterns_updated_at
  before update on patterns
  for each row execute procedure touch_updated_at();


-- ─────────────────────────────────────────────
-- PATTERN RELATIONSHIPS
-- Directed edges between patterns.
-- Source distinguishes explicit (from pattern_relationships JSON)
-- from inferred (derived from each pattern's related_patterns field).
-- Both are populated by ingest_patterns.py.
-- ─────────────────────────────────────────────
create table pattern_relationships (
  id                  uuid primary key default uuid_generate_v4(),
  pattern_a           text not null references patterns(id) on delete cascade,
  pattern_b           text not null references patterns(id) on delete cascade,
  relationship_type   relationship_type not null,
  relationship_source relationship_source not null default 'explicit',
  description         text,
  created_at          timestamptz not null default now(),

  -- Prevent exact duplicates (same pair + same type)
  unique (pattern_a, pattern_b, relationship_type)
);

comment on table pattern_relationships is
  'Directed relationships between patterns — forms the graph for Kumu / D3 visualisation. '
  'Populated from both the explicit pattern_relationships[] and inferred from related_patterns[] on each pattern.';

create index pr_a_idx      on pattern_relationships(pattern_a);
create index pr_b_idx      on pattern_relationships(pattern_b);
create index pr_type_idx   on pattern_relationships(relationship_type);
create index pr_source_idx on pattern_relationships(relationship_source);


-- ─────────────────────────────────────────────
-- REFLECTION JOURNAL
--
-- Every session is persisted to Supabase — nothing is ephemeral.
-- Schema covers the full session lifecycle:
--   1. User describes a situation (raw_description)
--   2. App generates a framing summary (ai_framing)
--   3. Patterns are surfaced and tagged (journal_session_patterns)
--   4. Reflective questions are posed and answered (journal_reflections)
--   5. Session is titled and closed (title, closed_at)
--   6. Over time, cross-session tags and themes emerge (journal_tags)
-- ─────────────────────────────────────────────

create table journal_sessions (
  id                  uuid primary key default uuid_generate_v4(),

  -- User-authored content
  title               text,                       -- user-set title (can be AI-suggested, user-confirmed)
  raw_description     text not null,              -- user's unedited free-text description of the situation
  domain              text,                       -- e.g. "negotiation", "org change", "political strategy"
  actors              text[],                     -- key actors named in the session

  -- AI-generated content (all saved to DB, not held in memory)
  ai_framing          text,                       -- AI's opening framing of the situation
  ai_summary          text,                       -- closing summary generated at session end
  ai_what_was_seen    text,                       -- AI narrative: patterns the user noticed
  ai_what_was_missed  text,                       -- AI narrative: patterns the user missed
  ai_key_insight      text,                       -- single most important insight from this session

  -- Session state
  is_complete         boolean not null default false,  -- true once user has closed the session
  closed_at           timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table journal_sessions is
  'One row per reflection session. Every field is persisted — nothing is ephemeral.';

create index js_domain_idx   on journal_sessions(domain);
create index js_complete_idx on journal_sessions(is_complete);
create index js_created_idx  on journal_sessions(created_at desc);

-- Full-text search over journal sessions
create index js_fts_idx on journal_sessions
  using gin (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(raw_description, '') || ' ' ||
      coalesce(ai_framing, '') || ' ' ||
      coalesce(ai_summary, '') || ' ' ||
      coalesce(ai_key_insight, '')
    )
  );

create trigger journal_sessions_updated_at
  before update on journal_sessions
  for each row execute procedure touch_updated_at();


-- ─────────────────────────────────────────────
-- JOURNAL SESSION ↔ PATTERNS
-- Which patterns were surfaced or noticed in a session.
-- ─────────────────────────────────────────────
create table journal_session_patterns (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references journal_sessions(id) on delete cascade,
  pattern_id      text not null references patterns(id) on delete restrict,

  -- Was the user aware of this pattern during the situation?
  visibility      pattern_visibility,

  -- Free-text notes saved for this pattern in this session
  relevance_note  text,   -- why this pattern was flagged (AI-generated or user-written)
  user_note       text,   -- user's own annotation on how this pattern showed up

  -- Ordering within the session (for display)
  display_order   integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (session_id, pattern_id)
);

comment on table journal_session_patterns is
  'Junction table: which patterns appeared in a session, and how the user related to each.';

create index jsp_session_idx    on journal_session_patterns(session_id);
create index jsp_pattern_idx    on journal_session_patterns(pattern_id);
create index jsp_visibility_idx on journal_session_patterns(visibility);

create trigger journal_session_patterns_updated_at
  before update on journal_session_patterns
  for each row execute procedure touch_updated_at();


-- ─────────────────────────────────────────────
-- JOURNAL REFLECTIONS
-- Individual Q&A turns within a session.
-- Saves the full dialogue — every question and answer.
-- ─────────────────────────────────────────────
create table journal_reflections (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references journal_sessions(id) on delete cascade,

  -- Which pattern this reflection is focused on (nullable = general session reflection)
  pattern_id      text references patterns(id) on delete set null,

  -- The exchange
  question        text not null,   -- AI-posed reflective question
  answer          text,            -- user's answer (null if they skipped)
  ai_response     text,            -- AI's follow-up or observation on their answer

  -- Ordering within session
  sequence        integer not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table journal_reflections is
  'Individual reflective Q&A turns within a session. The full dialogue is persisted.';

create index jr_session_idx  on journal_reflections(session_id);
create index jr_pattern_idx  on journal_reflections(pattern_id);
create index jr_sequence_idx on journal_reflections(session_id, sequence);

create trigger journal_reflections_updated_at
  before update on journal_reflections
  for each row execute procedure touch_updated_at();


-- ─────────────────────────────────────────────
-- JOURNAL TAGS
-- User-defined or AI-suggested thematic tags
-- that build a cross-session taxonomy over time.
-- ─────────────────────────────────────────────
create table journal_tags (
  id    uuid primary key default uuid_generate_v4(),
  name  text not null unique,    -- e.g. "negotiation", "trust repair", "coalition collapse"
  created_at timestamptz not null default now()
);

create table journal_session_tags (
  session_id  uuid not null references journal_sessions(id) on delete cascade,
  tag_id      uuid not null references journal_tags(id) on delete cascade,
  primary key (session_id, tag_id)
);

create index jst_tag_idx     on journal_session_tags(tag_id);
create index jst_session_idx on journal_session_tags(session_id);


-- ─────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- Service-role key bypasses RLS automatically.
-- Add user-facing policies when auth is wired up.
-- ─────────────────────────────────────────────
alter table registers                  enable row level security;
alter table patterns                   enable row level security;
alter table pattern_relationships      enable row level security;
alter table journal_sessions           enable row level security;
alter table journal_session_patterns   enable row level security;
alter table journal_reflections        enable row level security;
alter table journal_tags               enable row level security;
alter table journal_session_tags       enable row level security;
