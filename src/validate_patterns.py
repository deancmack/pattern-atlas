#!/usr/bin/env python3
"""
Pattern Atlas — Schema Validator
==================================
Run before committing changes to data/patterns.json.
Catches schema errors before they reach GitHub Actions.

Usage
-----
    python3 src/validate_patterns.py
    python3 src/validate_patterns.py --data path/to/patterns.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DEFAULT = PROJECT_ROOT / "data" / "patterns.json"

# ─────────────────────────────────────────────────────────────────────────────
# Schema constants — must match Supabase enums exactly
# ─────────────────────────────────────────────────────────────────────────────

VALID_COMPLEXITY_CLASSES = {
    "phase_transition",
    "emergence",
    "cascade",
    "attractor",
    "feedback",
    "configuration",
    "concealment",
    "flow",
    "foundation",
    "field",
}

VALID_REGISTERS = {
    "becoming",
    "rupture",
    "relation",
    "observation",
    "stabilization",
    "concealment",
    "power",
    "ideology",
    "desire",
    "contradiction",
    "flow",
    "configuration",
    "interdependence",
    "withdrawal",
    "foundation",
    "practitioner",
}

VALID_RELATIONSHIP_TYPES = {
    "generates",
    "amplifies",
    "contradicts",
    "precedes",
    "requires",
    "mirrors",
    "related",
}

REQUIRED_PATTERN_FIELDS = [
    "id",
    "name",
    "register",
    "core_claim",
]

ARRAY_FIELDS = [
    "registers",
    "source_disciplines",
    "source_thinkers",
    "example_domains",
    "related_patterns",
]

# ─────────────────────────────────────────────────────────────────────────────
# Validator
# ─────────────────────────────────────────────────────────────────────────────

def validate(data_path: Path) -> list[str]:
    errors: list[str] = []
    warnings: list[str] = []

    with open(data_path, encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            return [f"FATAL: JSON parse error — {e}"], []

    patterns = data.get("patterns", [])
    relationships = data.get("pattern_relationships", [])

    if not patterns:
        errors.append("No patterns found in 'patterns' array")
        return errors, warnings

    pattern_ids = set()

    # ── Validate each pattern ─────────────────────────────────────────────────
    for i, p in enumerate(patterns):
        pid = p.get("id", f"<pattern #{i+1}>")
        prefix = f"[{pid}]"

        # Duplicate IDs
        if pid in pattern_ids:
            errors.append(f"{prefix} Duplicate ID")
        pattern_ids.add(pid)

        # ID format
        if pid and not all(c.islower() or c.isdigit() or c == '-' for c in pid):
            errors.append(f"{prefix} ID must be lowercase-hyphenated slug, got: '{pid}'")

        # Required fields
        for field in REQUIRED_PATTERN_FIELDS:
            if not p.get(field):
                errors.append(f"{prefix} Missing required field: '{field}'")

        # register enum
        reg = p.get("register", "")
        if reg and reg not in VALID_REGISTERS:
            errors.append(f"{prefix} Invalid register: '{reg}'. Valid: {sorted(VALID_REGISTERS)}")

        # registers array
        for r in p.get("registers", []):
            if r not in VALID_REGISTERS:
                errors.append(f"{prefix} Invalid value in registers[]: '{r}'")

        # complexity_class enum
        cc = p.get("complexity_class")
        if cc and cc not in VALID_COMPLEXITY_CLASSES:
            errors.append(f"{prefix} Invalid complexity_class: '{cc}'. Valid: {sorted(VALID_COMPLEXITY_CLASSES)}")

        # difficulty range
        diff = p.get("difficulty")
        if diff is not None:
            if not isinstance(diff, int) or diff < 1 or diff > 5:
                errors.append(f"{prefix} difficulty must be integer 1–5, got: {diff!r}")

        # Array fields must be lists
        for field in ARRAY_FIELDS:
            val = p.get(field)
            if val is not None and not isinstance(val, list):
                errors.append(f"{prefix} Field '{field}' must be an array, got: {type(val).__name__}")

        # field_tested must be bool
        ft = p.get("field_tested")
        if ft is not None and not isinstance(ft, bool):
            errors.append(f"{prefix} 'field_tested' must be boolean, got: {ft!r}")

        # Warn on missing recommended fields
        recommended = ["subtitle", "koan", "canonical_example", "situation_signature",
                       "hot_signals", "leverage_points", "practitioner_notes"]
        missing_rec = [f for f in recommended if not p.get(f)]
        if missing_rec:
            warnings.append(f"{prefix} Missing recommended fields: {missing_rec}")

    # ── Validate relationships ─────────────────────────────────────────────────
    rel_keys: set[tuple] = set()
    for j, r in enumerate(relationships):
        a   = r.get("pattern_a", "")
        b   = r.get("pattern_b", "")
        rt  = r.get("relationship_type", "").lower().strip()
        prefix = f"[rel #{j+1}: {a} → {b}]"

        if not a:
            errors.append(f"{prefix} Missing pattern_a")
        if not b:
            errors.append(f"{prefix} Missing pattern_b")

        if a and a not in pattern_ids:
            errors.append(f"{prefix} pattern_a '{a}' not found in patterns")
        if b and b not in pattern_ids:
            errors.append(f"{prefix} pattern_b '{b}' not found in patterns")

        if rt not in VALID_RELATIONSHIP_TYPES:
            errors.append(f"{prefix} Invalid relationship_type: '{rt}'. Valid: {sorted(VALID_RELATIONSHIP_TYPES)}")

        key = (a, b, rt)
        if key in rel_keys:
            errors.append(f"{prefix} Duplicate relationship")
        rel_keys.add(key)

    # ── Validate related_patterns cross-references ────────────────────────────
    for p in patterns:
        pid = p.get("id", "")
        for ref in p.get("related_patterns", []):
            if ref not in pattern_ids:
                warnings.append(f"[{pid}] related_patterns references unknown ID: '{ref}'")

    return errors, warnings


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Validate patterns.json against the Pattern Atlas schema.")
    parser.add_argument("--data", type=Path, default=DATA_DEFAULT)
    args = parser.parse_args()

    path = args.data.resolve()
    if not path.exists():
        print(f"✗  File not found: {path}", file=sys.stderr)
        sys.exit(1)

    print(f"Validating {path} …\n")

    errors, warnings = validate(path)

    if warnings:
        print(f"⚠  {len(warnings)} warning(s):")
        for w in warnings:
            print(f"   {w}")
        print()

    if errors:
        print(f"✗  {len(errors)} error(s):")
        for e in errors:
            print(f"   {e}")
        print()
        print("Fix these errors before pushing.")
        sys.exit(1)
    else:
        # Quick stats
        with open(path) as f:
            data = json.load(f)
        n_patterns = len(data.get("patterns", []))
        n_rels = len(data.get("pattern_relationships", []))
        print(f"✓  Valid — {n_patterns} patterns, {n_rels} explicit relationships")
        if warnings:
            print(f"   ({len(warnings)} warnings above — not blocking)")


if __name__ == "__main__":
    main()
