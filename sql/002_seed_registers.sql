-- Pattern Atlas — Seed: registers table
-- Run after 001_schema.sql.
-- These 14 registers are derived from the registers field across all patterns in patterns.json.

insert into registers (id, name, description, display_order) values

('becoming',
 'Becoming',
 'Patterns that describe how systems change, accumulate pressure, and transform over time. The register of process, drift, and threshold dynamics.',
 10),

('rupture',
 'Rupture',
 'Patterns that describe discontinuous breaks — moments when the existing logic of a situation can no longer contain what is happening. The register of the event, the crisis, and the line of flight.',
 20),

('relation',
 'Relation',
 'Patterns that describe how actors, nodes, and systems are configured in relation to each other — networks, flows, assemblages, and the power that accrues from position.',
 30),

('observation',
 'Observation',
 'Patterns that describe how we see — and how the act of seeing shapes what can be seen. The register of frameworks, blind spots, horizons, and the observer''s position.',
 40),

('stabilization',
 'Stabilization',
 'Patterns that describe how systems resist change, reproduce themselves, and lock in their own conditions of existence. The register of attractors, path dependence, and the weight of the past.',
 50),

('concealment',
 'Concealment',
 'Patterns that describe what hides in plain sight — the withdrawn, the undiscussed, the presupposed. The register of doxa, the obscene supplement, and the invisible infrastructure of the obvious.',
 60),

('power',
 'Power',
 'Patterns that describe how power operates — not primarily through force but through normalization, consent, and the management of populations. The register of hegemony, discipline, and biopower.',
 70),

('ideology',
 'Ideology',
 'Patterns that describe how arrangements reproduce themselves through belief, enjoyment, and the naturalization of the contingent. The register of fetishism, enjoyment, and the doxa of the dominant.',
 80),

('desire',
 'Desire',
 'Patterns that describe the structure of wanting — how desire is organized, displaced, and sustained by what it can never fully reach.',
 90),

('contradiction',
 'Contradiction',
 'Patterns that describe the internal tensions that drive systems to exceed themselves — the engine of transformation that cannot be resolved within the existing terms.',
 100),

('foundation',
 'Foundation',
 'Patterns that describe the ontological and ethical ground from which action proceeds — and the question of how firmly that ground needs to be held.',
 110),

('flow',
 'Flow',
 'Patterns that describe the quality of effortless, aligned action — wu wei, mushin, motor intentionality. The register of skillful practice operating below deliberation.',
 120),

('configuration',
 'Configuration',
 'Patterns that describe the shape of situations before any move is made — shi, structural position, the potential inherent in arrangement.',
 130),

('interdependence',
 'Interdependence',
 'Patterns that describe how phenomena arise in dependence on conditions — nothing exists independently, all properties are relational and impermanent.',
 140),

('withdrawal',
 'Withdrawal',
 'Patterns that describe what exceeds encounter — objects, hyperobjects, and the surplus that no analysis can exhaust.',
 150),

('practitioner',
 'Practitioner',
 'Patterns that describe the reflexive dimension of expert practice — the habitus of the analyst, the cultivation of mushin, the ethics of the practitioner who knows they are also a phenomenon.',
 160)

on conflict (id) do update set
  name         = excluded.name,
  description  = excluded.description,
  display_order = excluded.display_order;
