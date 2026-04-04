#!/usr/bin/env python3
"""
Pattern Atlas — Agent
======================
Describe a real situation. The agent identifies which patterns are operating,
reproduces each matching entry in full, then notes how they interact.

Usage
-----
    python3 src/agent.py

Environment variables (required)
----------------------------------
    SUPABASE_URL          https://<project-ref>.supabase.co
    SUPABASE_SERVICE_KEY  <service-role key>
    ANTHROPIC_API_KEY     <anthropic api key>
"""

from __future__ import annotations

import os
import sys
import textwrap
from pathlib import Path

from dotenv import load_dotenv

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENV_FILE     = PROJECT_ROOT / ".env"

MODEL = "claude-sonnet-4-20250514"

# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

SELECTION_SYSTEM = """\
You are the Pattern Atlas agent. A practitioner describes a real situation. \
Your job is to identify which patterns from the library are structurally operating \
in that situation.

Return ONLY a JSON array of pattern IDs (the slug strings), ordered by relevance. \
No explanation, no prose, no markdown — just the raw JSON array.

Example output: ["structural-holes", "phase-transition", "hysteresis"]

Rules:
- Maximum 4 patterns, minimum 2. Be ruthless — only include patterns where the \
underlying logic genuinely maps onto the situation.
- Actively look across disciplinary boundaries. A pattern from fluid dynamics, \
thermodynamics, or philosophy may describe the structural logic of a negotiation \
or political situation better than an obvious social science match. Prioritize \
structural fit over surface vocabulary similarity.
- When two patterns have comparable fit, prefer the one from an unexpected \
discipline — the non-obvious match is often the more valuable one.
- Do not include patterns just because they are loosely related to the domain. \
The pattern's core claim must actually explain something specific about this situation.
"""

INTERACTION_SYSTEM = """\
You are the Pattern Atlas agent. You have identified which patterns are operating \
in a practitioner's situation and reproduced each entry in full. 

Your final task: write a short synthesis (3–6 sentences max) of how these specific \
patterns interact with each other in this specific situation. 

Be concrete — reference the actual details of the situation. Do not summarize the \
patterns themselves (that has already been done). Focus only on how they relate to \
each other and what that relationship means for understanding what is happening.
"""


# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────

def fetch_all_patterns(sb) -> list[dict]:
    result = (
        sb.table("patterns")
        .select("*")
        .execute()
    )
    return result.data or []


def get_patterns_by_ids(all_patterns: list[dict], ids: list[str]) -> list[dict]:
    index = {p["id"]: p for p in all_patterns}
    return [index[pid] for pid in ids if pid in index]


def compact_for_selection(patterns: list[dict]) -> str:
    """Compact representation for selection — id, name, core_claim only.
    Situation signature and hot signals are for the human practitioner, not for
    Claude's pattern selection. Keeping this minimal cuts token usage and improves
    cross-domain matching by keeping Claude at the level of structural logic."""
    lines = []
    for p in patterns:
        lines.append(f"ID: {p['id']}")
        lines.append(f"Name: {p['name']}")
        lines.append(f"Core claim: {p.get('core_claim', '')}")
        lines.append("")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Formatting
# ─────────────────────────────────────────────────────────────────────────────

FIELD_LABELS = [
    ("name",                 "PATTERN"),
    ("subtitle",             "Subtitle"),
    ("register",             "Register"),
    ("source_disciplines",   "Source disciplines"),
    ("source_thinkers",      "Source thinkers"),
    ("complexity_class",     "Complexity class"),
    ("core_claim",           "Core claim"),
    ("structure",            "Structure"),
    ("conditions",           "Conditions"),
    ("failure_modes",        "Failure modes"),
    ("situation_signature",  "Situation signature"),
    ("hot_signals",          "Hot signals"),
    ("leverage_points",      "Leverage points"),
    ("koan",                 "Koan"),
    ("canonical_example",    "Canonical example"),
    ("counter_example",      "Counter example"),
    ("application_questions","Application questions"),
    ("common_mistakes",      "Common mistakes"),
    ("practitioner_notes",   "Practitioner notes"),
    ("example_domains",      "Example domains"),
    ("difficulty",           "Difficulty"),
]

def format_pattern_entry(p: dict) -> str:
    lines = ["=" * 64]
    for field, label in FIELD_LABELS:
        val = p.get(field)
        if not val:
            continue
        if isinstance(val, list):
            val = ", ".join(str(v) for v in val)
        if field == "name":
            lines.append(f"  {val.upper()}")
            lines.append("=" * 64)
        elif field == "koan":
            lines.append(f"\n  ❧ {val}\n")
        elif field == "difficulty":
            lines.append(f"  {label}: {'●' * val}{'○' * (5 - val)}")
        else:
            lines.append(f"\n  {label.upper()}")
            # Wrap long text
            wrapped = textwrap.fill(
                str(val), width=68,
                initial_indent="  ",
                subsequent_indent="  "
            )
            lines.append(wrapped)
    lines.append("=" * 64)
    return "\n".join(lines)


def print_banner():
    print("\n" + "═" * 64)
    print("  PATTERN ATLAS")
    print("  Situation → Patterns → Insight")
    print("═" * 64 + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    load_dotenv(ENV_FILE)

    supabase_url  = os.environ.get("SUPABASE_URL")
    supabase_key  = os.environ.get("SUPABASE_SERVICE_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

    if not supabase_url or not supabase_key:
        print("✗  SUPABASE_URL and SUPABASE_SERVICE_KEY required in .env", file=sys.stderr)
        sys.exit(1)
    if not anthropic_key:
        print("✗  ANTHROPIC_API_KEY required in .env", file=sys.stderr)
        sys.exit(1)

    try:
        from supabase import create_client
        sb = create_client(supabase_url, supabase_key)
    except ImportError:
        print("✗  Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    try:
        import anthropic
        import json
        client = anthropic.Anthropic(api_key=anthropic_key)
    except ImportError:
        print("✗  Run: pip install anthropic", file=sys.stderr)
        sys.exit(1)

    print_banner()
    print("Loading pattern library …", end=" ", flush=True)
    all_patterns = fetch_all_patterns(sb)
    print(f"{len(all_patterns)} patterns loaded.\n")

    compact_library = compact_for_selection(all_patterns)

    print("Type 'quit' to exit.\n")

    while True:
        print("─" * 64)
        try:
            situation = input("Describe your situation:\n> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n\nGoodbye.")
            break

        if not situation:
            continue
        if situation.lower() in ("quit", "exit", "q"):
            print("\nGoodbye.")
            break

        # ── Step 1: Select matching pattern IDs ──────────────────────────────
        print("\nIdentifying patterns …", end=" ", flush=True)

        selection_prompt = f"""\
Here is the pattern library:

{compact_library}

───

Situation:
{situation}

Return a JSON array of the pattern IDs that are genuinely operating in this situation.
"""
        try:
            sel_response = client.messages.create(
                model=MODEL,
                max_tokens=256,
                system=SELECTION_SYSTEM,
                messages=[{"role": "user", "content": selection_prompt}],
            )
            raw = sel_response.content[0].text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            matched_ids = json.loads(raw)
        except Exception as exc:
            print(f"\n✗  Pattern selection failed: {exc}", file=sys.stderr)
            continue

        matched_patterns = get_patterns_by_ids(all_patterns, matched_ids)
        print(f"{len(matched_patterns)} patterns matched.\n")

        if not matched_patterns:
            print("No patterns matched this situation. Try describing it differently.\n")
            continue

        # ── Step 2: Print match reason + full entry for each pattern ─────────
        for i, p in enumerate(matched_patterns, 1):
            pid = p["id"]

            # Get a one-sentence match reason
            match_prompt = f"""\
Pattern: {p['name']}
Situation signature: {p.get('situation_signature', '')}
Hot signals: {p.get('hot_signals', '')}

Situation: {situation}

In one sentence, say specifically why this pattern matches this situation. \
Reference concrete details from the situation description. No hedging, no padding.
"""
            try:
                reason_response = client.messages.create(
                    model=MODEL,
                    max_tokens=128,
                    system="You are precise and direct. One sentence only.",
                    messages=[{"role": "user", "content": match_prompt}],
                )
                reason = reason_response.content[0].text.strip()
            except Exception:
                reason = "Matches this situation."

            print(f"\nPATTERN {i} OF {len(matched_patterns)}: {p['name'].upper()}")
            print(f"Match: {reason}\n")
            print(format_pattern_entry(p))
            print()

        # ── Step 3: Interaction synthesis ────────────────────────────────────
        if len(matched_patterns) > 1:
            pattern_names = ", ".join(p["name"] for p in matched_patterns)
            interaction_prompt = f"""\
Situation: {situation}

Matched patterns: {pattern_names}

How do these patterns interact with each other in this specific situation?
"""
            try:
                int_response = client.messages.create(
                    model=MODEL,
                    max_tokens=512,
                    system=INTERACTION_SYSTEM,
                    messages=[{"role": "user", "content": interaction_prompt}],
                )
                synthesis = int_response.content[0].text.strip()
                print("─" * 64)
                print("HOW THESE PATTERNS INTERACT\n")
                print(textwrap.fill(synthesis, width=68, initial_indent="  ",
                                    subsequent_indent="  "))
                print()
            except Exception as exc:
                print(f"✗  Interaction synthesis failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
