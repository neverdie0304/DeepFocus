#!/usr/bin/env python3
"""
Cross-check the thesis bibliography against in-text citations.

Scans every chapter (Markdown + the Literature Review .docx) and verifies:

  1. Every entry in Bibliography.md is cited at least once in the body.
  2. Every in-text citation has a matching bibliography entry (first-author
     match OR a co-author match, because Harvard style may list a paper
     under its first author in the bibliography while the body text
     occasionally refers to it as "Ekman and Friesen" etc.).

Run after every trimming / content change:

    python3 scripts/check_bibliography.py

Exits 0 on success, 1 if any inconsistency is found.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
THESIS_DIR = REPO / "docs" / "thesis"
BIB = THESIS_DIR / "Bibliography.md"
CHAPTER_MD = [
    THESIS_DIR / "Chapter_1_Introduction.md",
    THESIS_DIR / "Chapter_2_Literature_Review.md",
    THESIS_DIR / "Chapter_3_Design.md",
    THESIS_DIR / "Chapter_4_Implementation.md",
    THESIS_DIR / "Chapter_6_Legal_Social_Ethical.md",
]
# Add future chapters as they are written.
for candidate in (
    THESIS_DIR / "Chapter_5_Evaluation.md",
    THESIS_DIR / "Chapter_7_Conclusion.md",
):
    if candidate.exists():
        CHAPTER_MD.append(candidate)

# Legacy .docx version — kept as a backup but no longer read by the
# cross-check once Chapter_2_Literature_Review.md exists.
LIT_REVIEW_DOCX = THESIS_DIR / "Literature_Review_Refined.docx"

# A surname can contain internal apostrophes (D'Mello), hyphens
# (Murphy-Chutorian), and accented characters (Čech, Soukupová). Possessive
# "'s" is handled separately so it does not get swallowed into the captured
# name.
# First char accepts ASCII uppercase plus Latin-1 Supplement and Latin
# Extended-A uppercase blocks (the latter is mixed-case so the range
# technically admits some lowercase, but in practice bibliographies start
# each surname uppercase).
_UPPER = r"A-ZÀ-ÖØ-ÞĀ-Ž"
_LETTER = r"A-Za-zÀ-ÖØ-öø-ÿĀ-ſ"
SURNAME_RE = (
    rf"[{_UPPER}][{_LETTER}\-]+"
    rf"(?:['’][{_UPPER}][{_LETTER}]+)?"
)

# Multi-word organisational "surnames" that need to be recognised as a unit.
# Maps the canonical form used in Bibliography.md to the form used in-text.
MULTIWORD_ORGS = {
    "MDN Web Docs": "MDN",
}


# ──────────────────────────────────────────────────────────────────
# Loading
# ──────────────────────────────────────────────────────────────────


def load_bibliography():
    """
    Return a list of entries, one per bibliography line. Each entry is a dict:

        {
            "first":   first-author surname,
            "year":    4-digit year,
            "suffix":  'a'/'b'/'' (for same-author-same-year disambiguation),
            "all_surnames": set of ALL surnames (and organisational aliases)
                            listed in or associated with the entry,
            "full":    full reference string,
        }
    """
    entries = []
    # Match either "Surname, X., ... (YYYY[a])" or "Org name (YYYY[a])".
    # The person-style alternative REQUIRES initials after the first name
    # so that multi-word organisations (MDN Web Docs, ...) are picked up by
    # the second alternative instead of being truncated to their first word.
    header_re = re.compile(
        rf"^(?:"
        rf"({SURNAME_RE}),\s*[A-Z]\.[A-Z]*\.?"   # Smith, J.
        rf"(?:\s*,?\s*and\s*{SURNAME_RE}(?:,\s*[A-Z]\.?[A-Z]*\.?)?)*"
        rf"|([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)"   # ACM / MDN Web Docs
        rf")"
        rf".*?\(([12][0-9]{{3}})([a-z]?)\)",
    )
    # For co-author extraction within a bibliography line.
    coauthor_re = re.compile(rf"({SURNAME_RE}),\s*[A-Z]\.[A-Z]?\.?")

    for line in BIB.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith(("#", ">")):
            continue
        m = header_re.match(line)
        if not m:
            continue
        first = m.group(1) or m.group(2)
        year = m.group(3)
        suffix = m.group(4) or ""

        # Split at the year — everything before it is the author list.
        year_match = re.search(rf"\({year}{suffix}\)", line)
        author_part = line[: year_match.start()] if year_match else line

        all_surnames = set()
        all_surnames.add(first)
        for c in coauthor_re.finditer(author_part):
            all_surnames.add(c.group(1))
        # Also split by " and " / ", and " boundaries for edge cases
        for chunk in re.split(r"\s*,?\s*and\s*|,\s*", author_part):
            chunk = chunk.strip()
            name_m = re.match(rf"^({SURNAME_RE})", chunk)
            if name_m:
                all_surnames.add(name_m.group(1))

        # If the first "surname" is a known multi-word organisation,
        # also register the short alias used in running text (e.g. "MDN").
        if first in MULTIWORD_ORGS:
            all_surnames.add(MULTIWORD_ORGS[first])

        entries.append(
            dict(first=first, year=year, suffix=suffix,
                 all_surnames=all_surnames, full=line),
        )
    return entries


def load_body_text() -> str:
    """Concatenate all chapter bodies.

    If a Markdown Chapter 2 exists, it is used in place of the legacy
    Literature_Review_Refined.docx. This lets us work with the trimmed
    markdown version without accidentally double-counting citations from
    the original .docx.
    """
    parts = []

    ch2_md = THESIS_DIR / "Chapter_2_Literature_Review.md"
    if not ch2_md.exists():
        # Fall back to the .docx for backwards compatibility.
        try:
            from docx import Document
        except ImportError:
            print("[warn] python-docx not installed; skipping Literature Review")
        else:
            doc = Document(LIT_REVIEW_DOCX)
            lr = "\n".join(p.text for p in doc.paragraphs)
            m = re.search(r"\n\s*References\s*\n", lr)
            if m:
                lr = lr[: m.start()]
            parts.append(lr)

    for f in CHAPTER_MD:
        if f.exists():
            parts.append(f.read_text())

    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────
# Forward check: every bibliography entry is cited?
# ──────────────────────────────────────────────────────────────────


def is_cited(entry: dict, body: str) -> bool:
    """Return True iff the entry is referenced somewhere in the body."""
    year = entry["year"] + entry["suffix"]
    for surname in entry["all_surnames"]:
        s = re.escape(surname)
        y = re.escape(year)
        patterns = [
            rf"\b{s}(?:['’]s)?\s*\({y}\)",
            rf"\b{s}(?:['’]s)?\s+and\s+{SURNAME_RE}\s*\({y}\)",
            rf"\b{s}(?:['’]s)?\s+et\s+al\.?\s*\({y}\)",
            rf"\({s},\s*{y}\)",
            rf"\({s}\s+and\s+{SURNAME_RE},\s*{y}\)",
            rf"\({s}\s+et\s+al\.?,\s*{y}\)",
            rf"\b{s},\s*{y}\b",
            rf"\b{s}\s+et\s+al\.?,\s*{y}\b",
            rf"\b{s}\s+and\s+{SURNAME_RE},\s*{y}\b",
        ]
        if any(re.search(p, body) for p in patterns):
            return True
    return False


# ──────────────────────────────────────────────────────────────────
# Reverse check: every in-text citation has a bibliography entry?
# ──────────────────────────────────────────────────────────────────


def extract_citations(body: str):
    """
    Extract every (surname, year-with-suffix) pair that appears in the body
    as an author-style citation. Collects the FIRST-author surname of each
    citation occurrence so we don't count co-authors as independent entries.
    """
    results = set()
    # Cite patterns, each designed so group 1 is the first-author surname.
    patterns = [
        # Prose: "Author et al. (YYYY)" / "Author and Other (YYYY)" / "Author (YYYY)"
        rf"\b({SURNAME_RE})(?:['’]s)?\s+et\s+al\.?\s*\(([12][0-9]{{3}}[a-z]?)\)",
        rf"\b({SURNAME_RE})(?:['’]s)?\s+and\s+{SURNAME_RE}\s*\(([12][0-9]{{3}}[a-z]?)\)",
        # Plain "Author (YYYY)" — must NOT be preceded by "and " (which would
        # make it a co-author of the previous word).
        rf"(?<!and\s)(?<!and )\b({SURNAME_RE})(?:['’]s)?\s*\(([12][0-9]{{3}}[a-z]?)\)",
        # Inside parens with comma: "(Author et al., YYYY)" etc.
        rf"\(({SURNAME_RE})\s+et\s+al\.?,\s*([12][0-9]{{3}}[a-z]?)\)",
        rf"\(({SURNAME_RE})\s+and\s+{SURNAME_RE},\s*([12][0-9]{{3}}[a-z]?)\)",
        rf"\(({SURNAME_RE}),\s*([12][0-9]{{3}}[a-z]?)\)",
        # Semicolon-separated within a paren group (middle entries)
        rf";\s*({SURNAME_RE})\s+et\s+al\.?,\s*([12][0-9]{{3}}[a-z]?)",
        rf";\s*({SURNAME_RE})\s+and\s+{SURNAME_RE},\s*([12][0-9]{{3}}[a-z]?)",
        rf";\s*({SURNAME_RE}),\s*([12][0-9]{{3}}[a-z]?)",
    ]
    for p in patterns:
        for m in re.finditer(p, body):
            surname = m.group(1)
            year = m.group(2)

            # Strip possessive "'s" / "’s" if present.
            surname = re.sub(r"['’]s$", "", surname)

            # If this surname starts mid-apostrophe-name (e.g. "Mello" inside
            # "D'Mello"), the character immediately before the match will be
            # an apostrophe — filter those out.
            start_idx = m.start(1)
            if start_idx > 0 and body[start_idx - 1] in "'’":
                continue

            if surname in {
                "Figure", "Table", "Chapter", "Section", "Appendix",
                "Page", "Volume", "Equation", "Listing", "Algorithm",
                "The", "This", "In", "As",
            }:
                continue
            results.add((surname, year))
    return results


def main() -> int:
    entries = load_bibliography()
    body = load_body_text()

    print(f"Bibliography entries: {len(entries)}")
    print(f"Body text: {len(body):,} characters\n")

    # Forward check
    unused = [e for e in entries if not is_cited(e, body)]

    # Reverse check
    cited_pairs = extract_citations(body)

    # Accept a cited pair if any bibliography entry has the surname in
    # its co-author set AND the matching year+suffix.
    valid_pairs = set()
    for e in entries:
        full_year = e["year"] + e["suffix"]
        for s in e["all_surnames"]:
            valid_pairs.add((s, full_year))

    missing = sorted(cited_pairs - valid_pairs)

    print("="*60)
    if unused:
        print(f"⚠️  {len(unused)} entries NOT cited:")
        for e in unused:
            print(f"    • {e['first']} ({e['year']}{e['suffix']})")
    else:
        print("✅  Every bibliography entry is cited.")
    print()
    print("="*60)
    if missing:
        print(f"⚠️  {len(missing)} in-text citations with NO bibliography entry:")
        for surname, year in missing:
            print(f"    • {surname} ({year})")
    else:
        print("✅  Every in-text citation has a bibliography entry.")

    return 1 if (unused or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
