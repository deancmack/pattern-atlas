#!/usr/bin/env python3
"""
Pattern Atlas — Ingestion Script
=================================
Loads patterns.json into Supabase:
  - patterns table
  - pattern_relationships table
    → explicit edges: from the top-level pattern_relationships[] array
    → inferred edges: derived from related_patterns[] on each pattern entry

Both sources are upserted.  Re-runs are fully idempotent.

Usage
-----
    python3 src/ingest_patterns.py [--data path/to/patterns.json] [--dry-run]

Environment variables (required unless --dry-run)
---------------------------------------------------
    SUPABASE_URL          https://<project-ref>.supabase.co
    SUPABASE_SERVICE_KEY  <service-role secret key>

The service-role key bypasses RLS — server-side only, never in the browser.

Dependencies
------------
    pip install supabase python-dotenv
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DEFAULT = PROJECT_ROOT / "data" / "patterns.json"
ENV_FILE     = PROJECT_ROOT / ".env"

# Relationship types that map to the schema enum
VALID_RELATIONSHIP_TYPES = {
    "generates",
    "amplifies",
    "contradicts",
    "precedes",
    "requires",
    "mirrors",
    "related",
}


# ─────────────────────────────────────────────────────────────────────────────
# Builders
# ─────────────────────────────────────────────────────────────────────────────

def build_pattern_row(p: dict) -> dict:
    """Map a raw pattern dict to a patterns table row."""
    return {
        "id":                    p["id"],
        "name":                  p["name"],
        "subtitle":              p.get("subtitle"),
        "register":              p["register"],
        "registers":             p.get("registers", []),
        "source_disciplines":    p.get("source_disciplines", []),
        "source_thinkers":       p.get("source_thinkers", []),
        "complexity_class":      p.get("complexity_class"),
        "core_claim":            p.get("core_claim"),
        "structure":             p.get("structure"),
        "conditions":            p.get("conditions"),
        "failure_modes":         p.get("failure_modes"),
        "situation_signature":   p.get("situation_signature"),
        "hot_signals":           p.get("hot_signals"),
        "leverage_points":       p.get("leverage_points"),
        "koan":                  p.get("koan"),
        "canonical_example":     p.get("canonical_example"),
        "counter_example":       p.get("counter_example"),
        "application_questions": p.get("application_questions"),
        "common_mistakes":       p.get("common_mistakes"),
        "practitioner_notes":    p.get("practitioner_notes"),
        "example_domains":       p.get("example_domains", []),
        "related_patterns":      p.get("related_patterns", []),
        "difficulty":            p.get("difficulty"),
        "field_tested":          p.get("field_tested", False),
        "date_added":            p.get("date_added"),
    }


def build_explicit_relationship(r: dict) -> Optional[dict]:
    """
    Map an entry from the top-level pattern_relationships[] to a DB row.
    Returns None and prints a warning if the relationship_type is unknown.
    """
    rtype = r.get("relationship_type", "").lower().strip()
    if rtype not in VALID_RELATIONSHIP_TYPES:
        print(
            f"  ⚠  Skipping explicit relationship "
            f"{r.get('pattern_a')} → {r.get('pattern_b')}: "
            f"unknown type '{rtype}'.",
            file=sys.stderr,
        )
        return None
    return {
        "pattern_a":            r["pattern_a"],
        "pattern_b":            r["pattern_b"],
        "relationship_type":    rtype,
        "relationship_source":  "explicit",
        "description":          r.get("description"),
    }


def build_inferred_relationships(pattern: dict, known_ids: set) -> list[dict]:
    """
    Derive 'related' edges from a pattern's related_patterns[] field.
    Only emits an edge if both endpoints are in known_ids.
    Edges are undirected by convention: we emit pattern_a < pattern_b
    alphabetically to avoid double-counting.
    """
    edges = []
    source_id = pattern["id"]
    for target_id in pattern.get("related_patterns", []):
        target_id = target_id.strip()
        if not target_id or target_id not in known_ids:
            # Target may be a pattern not yet in the dataset — skip silently.
            continue
        if target_id == source_id:
            continue
        # Canonical ordering: alphabetically smaller id goes in pattern_a
        a, b = (source_id, target_id) if source_id < target_id else (target_id, source_id)
        edges.append({
            "pattern_a":           a,
            "pattern_b":           b,
            "relationship_type":   "related",
            "relationship_source": "inferred",
            "description":         None,
        })
    return edges


# ─────────────────────────────────────────────────────────────────────────────
# Supabase helpers
# ─────────────────────────────────────────────────────────────────────────────

def upsert_patterns(sb, rows: list[dict], batch_size: int) -> tuple[int, int]:
    """Upsert patterns rows. Conflict target: id (primary key)."""
    return _upsert(sb, "patterns", rows, batch_size, on_conflict="id")


def upsert_relationships(sb, rows: list[dict], batch_size: int) -> tuple[int, int]:
    """Upsert relationship rows. Conflict target: composite unique key."""
    return _upsert(
        sb,
        "pattern_relationships",
        rows,
        batch_size,
        on_conflict="pattern_a,pattern_b,relationship_type",
    )


def _upsert(
    sb,
    table: str,
    rows: list[dict],
    batch_size: int,
    on_conflict: str,
) -> tuple[int, int]:
    success = 0
    errors  = 0
    total   = len(rows)

    for start in range(0, total, batch_size):
        batch = rows[start : start + batch_size]
        end   = min(start + batch_size, total)
        try:
            sb.table(table).upsert(batch, on_conflict=on_conflict, ignore_duplicates=False).execute()
            success += len(batch)
            print(f"  ✓  [{table}] rows {start + 1}–{end} / {total}")
        except Exception as exc:
            errors += len(batch)
            print(
                f"  ✗  [{table}] rows {start + 1}–{end} FAILED: {exc}",
                file=sys.stderr,
            )

    return success, errors


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest patterns.json into the Pattern Atlas Supabase database."
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=DATA_DEFAULT,
        help=f"Path to patterns.json (default: {DATA_DEFAULT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate without writing to Supabase.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Rows per upsert request (default: 50).",
    )
    args = parser.parse_args()

    # ── 1. Load JSON ──────────────────────────────────────────────────────────
    data_path = args.data.resolve()
    if not data_path.exists():
        print(f"✗  File not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    print(f"📂  Loading {data_path} …")
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    raw_patterns      = data.get("patterns", [])
    raw_relationships = data.get("pattern_relationships", [])
    print(f"    {len(raw_patterns)} patterns, {len(raw_relationships)} explicit relationships in file.")

    # ── 2. Build pattern rows ─────────────────────────────────────────────────
    pattern_rows = [build_pattern_row(p) for p in raw_patterns]
    known_ids    = {row["id"] for row in pattern_rows}

    # ── 3. Build explicit relationship rows ───────────────────────────────────
    explicit_rows: list[dict] = []
    for r in raw_relationships:
        row = build_explicit_relationship(r)
        if row is None:
            continue
        a, b = row["pattern_a"], row["pattern_b"]
        if a not in known_ids or b not in known_ids:
            print(
                f"  ⚠  Skipping explicit relationship {a} → {b}: "
                f"one or both IDs not in pattern list.",
                file=sys.stderr,
            )
            continue
        explicit_rows.append(row)

    # ── 4. Build inferred relationship rows ──────────────────────────────────
    # Derive from each pattern's related_patterns[] field.
    # Deduplicate using a set of (a, b, type) tuples to avoid sending
    # the same row twice (many patterns cross-reference each other).
    inferred_seen: set[tuple] = set()
    inferred_rows: list[dict] = []

    for p in raw_patterns:
        for row in build_inferred_relationships(p, known_ids):
            key = (row["pattern_a"], row["pattern_b"], row["relationship_type"])
            if key in inferred_seen:
                continue
            inferred_seen.add(key)
            inferred_rows.append(row)

    # Merge: explicit rows take precedence; don't duplicate as inferred
    explicit_keys = {
        (r["pattern_a"], r["pattern_b"], r["relationship_type"])
        for r in explicit_rows
    }
    # Also suppress the reverse direction of explicit edges from inferred set
    explicit_keys_reversed = {
        (r["pattern_b"], r["pattern_a"], r["relationship_type"])
        for r in explicit_rows
    }
    inferred_rows = [
        r for r in inferred_rows
        if (r["pattern_a"], r["pattern_b"], r["relationship_type"]) not in explicit_keys
        and (r["pattern_a"], r["pattern_b"], r["relationship_type"]) not in explicit_keys_reversed
    ]

    all_relationship_rows = explicit_rows + inferred_rows

    print(
        f"\n🔗  Relationships to upsert:"
        f"\n    {len(explicit_rows)} explicit  (from pattern_relationships[] in JSON)"
        f"\n    {len(inferred_rows)} inferred  (derived from related_patterns[] on each pattern)"
        f"\n    {len(all_relationship_rows)} total"
    )

    # ── 5. Dry-run exit ───────────────────────────────────────────────────────
    if args.dry_run:
        print("\n── DRY RUN — no data written to Supabase ──")
        print(f"  Patterns:      {len(pattern_rows)}")
        print(f"  Relationships: {len(all_relationship_rows)}")
        _print_sample("Pattern sample", pattern_rows)
        _print_sample("Explicit relationship sample", explicit_rows)
        _print_sample("Inferred relationship sample", inferred_rows)
        return

    # ── 6. Connect to Supabase ────────────────────────────────────────────────
    load_dotenv(ENV_FILE)
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print(
            "✗  Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env or environment.",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        from supabase import create_client
        sb = create_client(url, key)
    except ImportError:
        print("✗  Run: pip install supabase", file=sys.stderr)
        sys.exit(1)

    # ── 7. Upsert patterns ────────────────────────────────────────────────────
    print(f"\n📥  Upserting {len(pattern_rows)} patterns …")
    p_ok, p_err = upsert_patterns(sb, pattern_rows, args.batch_size)

    # ── 8. Upsert relationships (both sources) ────────────────────────────────
    # Patterns must exist before relationships — FK constraint.
    print(f"\n📥  Upserting {len(all_relationship_rows)} relationships …")
    r_ok, r_err = upsert_relationships(sb, all_relationship_rows, args.batch_size)

    # ── 9. Summary ────────────────────────────────────────────────────────────
    print("\n── Ingestion complete ──")
    print(f"  Patterns:      {p_ok} ok, {p_err} errors")
    print(f"  Relationships: {r_ok} ok, {r_err} errors")
    print(f"  (explicit: {len(explicit_rows)}, inferred: {len(inferred_rows)})")

    if p_err or r_err:
        sys.exit(1)


def _print_sample(label: str, rows: list[dict], n: int = 2) -> None:
    print(f"\n  {label} (first {min(n, len(rows))}):")
    for row in rows[:n]:
        print("    " + json.dumps(row, default=str)[:280] + " …")


if __name__ == "__main__":
    main()
