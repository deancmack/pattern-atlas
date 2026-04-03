# Pattern Atlas

A personal knowledge system for expert pattern recognition across complex domains.

Built for an urban planner and economic development professional with deep interests in complexity theory, Continental philosophy, and strategic practice. The goal is the kind of emergent, non-linear pattern recognition that separates strategic operators from truly exceptional ones.

---

## What It Is

A structured database of 40+ patterns drawn from hard sciences, Continental philosophy, ancient wisdom traditions, and edge social sciences — paired with three operational interfaces.

### The Database
Hosted on Supabase (PostgreSQL). Every pattern has a full practitioner profile:
- Core claim, structure, conditions
- Situation signature and hot signals (how to recognize it in the wild)
- Leverage points, failure modes, common mistakes
- A koan, canonical example, counter-example
- Difficulty rating, source thinkers, epistemological register

Patterns are organized into **registers** (epistemological modes): becoming, rupture, relation, observation, stabilization, concealment, power, ideology, desire, contradiction, flow, configuration, interdependence, withdrawal, foundation, practitioner.

### The Agent *(in progress)*
Python CLI (`src/agent.py`). Describe a real situation or problem. The agent searches the pattern database, identifies what's operating in your situation, and explains why each pattern fits. It surfaces and explains — the strategic thinking is yours.

### The Learning App *(planned — Vercel)*
Two modes:
- **Discovery Mode**: Random or curated pattern, researched and presented as a rich mini-lesson. Browsed with curiosity, not studied like homework.
- **Case Study Mode**: Name a domain or topic. App generates a teaching module built around a real historical situation. You apply patterns from the database to real terrain.

### The Reflection Journal *(planned — Vercel)*
Session-based. Describe a real meeting, negotiation, or situation you were in. The app maps what happened against the pattern database, asks reflective questions, saves the full dialogue. Every session persists to Supabase. Over time, builds a personal case library — a secondary database of lived experience mapped against the pattern atlas.

---

## Stack

| Layer | Technology |
|---|---|
| Database | Supabase (PostgreSQL) |
| Backend / scripts | Python 3 |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Frontend (planned) | Vercel |
| Version control | GitHub |

---

## Repository Structure

```
pattern-atlas/
├── data/
│   └── patterns.json          # Source pattern library (42 patterns)
├── sql/
│   ├── 001_schema.sql         # Full Supabase schema
│   └── 002_seed_registers.sql # Seed data for registers table
├── src/
│   ├── ingest_patterns.py     # Load patterns.json → Supabase
│   └── agent.py               # CLI agent (in progress)
├── apps/
│   ├── learning/              # Learning App — Vercel (planned)
│   └── journal/               # Reflection Journal — Vercel (planned)
├── .env.example
├── requirements.txt
└── README.md
```

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `sql/001_schema.sql` in the SQL editor
3. Run `sql/002_seed_registers.sql`
4. Copy your Project URL and service-role key

### 2. Environment

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
```

### 3. Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Ingest patterns

```bash
python3 src/ingest_patterns.py

# Validate without writing:
python3 src/ingest_patterns.py --dry-run
```

This loads 42 patterns and 129 relationships (25 explicit + 104 inferred) into Supabase.

---

## Pattern Registers

| Register | What it covers |
|---|---|
| Becoming | How systems change, accumulate pressure, transform |
| Rupture | Discontinuous breaks — events, crises, lines of flight |
| Relation | Networks, flows, assemblages, positional power |
| Observation | Frameworks, blind spots, horizons, the observer's position |
| Stabilization | Attractors, path dependence, the weight of the past |
| Concealment | The withdrawn, undiscussed, presupposed |
| Power | Normalization, consent, disciplinary and biopolitical power |
| Ideology | How arrangements reproduce through belief and enjoyment |
| Desire | The structure of wanting and what sustains it |
| Contradiction | Internal tensions that drive transformation |
| Flow | Wu wei, mushin, motor intentionality |
| Configuration | Shi — situational potential before any move is made |
| Interdependence | Dependent origination — nothing exists independently |
| Withdrawal | Objects exceeding every encounter with them |
| Foundation | Weak ontology — acting from provisional ground |
| Practitioner | The reflexive dimension of expert practice |

---

## Selected Patterns

A few examples across the registers:

- **Phase Transition** — Systems accumulate stress while appearing stable, then shift state suddenly at a critical threshold
- **Structural Holes** — Power accrues to those who bridge disconnected clusters, not those most connected within one
- **Hysteresis** — Systems don't return the way they came; history is written into present state
- **Autopoiesis** — Systems that produce the components that produce them; interventions get translated into the system's own terms
- **Doxa** — What goes without saying because it goes without seeing
- **Shi** — The potential inherent in the configuration of a situation before any move is made
- **Objet Petit a** — The object-cause of desire; what organizes wanting without ever being what is wanted
- **Wu Wei** — Action that moves with the grain of reality rather than against it

---

*42 patterns. 16 registers. One graph.*
