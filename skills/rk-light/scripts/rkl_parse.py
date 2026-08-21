#!/usr/bin/env python3
"""rkl_parse.py -- pure parsers for the rk-light ledgers and report tex. No filesystem access.

A table that does not parse COMPLETELY is an error, never a partial result (lessons L11).
Theorem-like environments are parsed as UNITS (env, labels inside, tags inside, body) so a
row can be bound to the exact text the report prints (review-2 blocker 2).
"""
import hashlib
import re

CLAIMS_COLS = ["id", "kind", "status", "deps", "label", "statement", "proof", "author", "review", "note"]
PROV1_COLS = ["key", "path", "sha256", "what"]
PROV2_COLS = ["label", "key", "locus", "quote"]

LABEL_RE = re.compile(r"\\label\{([^}]+)\}")
TAG_RE = re.compile(r"\\claimstatus\{([^}]+)\}\{([^}]+)\}")
CITE_RE = re.compile(r"\\cite[tp]?\*?(?:\[[^\]]*\])*\{([^}]+)\}")
UNVERIFIED_RE = re.compile(r"\[UNVERIFIED\]")
COMMENT_RE = re.compile(r"(?<!\\)%.*")
BIBKEY_RE = re.compile(r"@\w+\s*\{\s*([^,\s]+)\s*,")
# tex environment -> allowed label prefixes (a `theorem` env may print a cited theorem)
ENV_PREFIXES = {"theorem": ("thm", "cit"), "lemma": ("lem", "cit"), "proposition": ("prop", "cit"),
                "corollary": ("cor", "cit"), "conjecture": ("conj",), "assumption": ("asm",),
                "observation": ("obs",), "definition": ("def",)}
ENV_RE = re.compile(r"\\begin\{(%s)\}" % "|".join(ENV_PREFIXES))


def norm_ws(s):
    s = s.replace("\u00a0", " ").replace("\u2009", " ").replace("\u202f", " ")
    return re.sub(r"\s+", " ", s).strip()


def sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


def _cells(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line)]


def parse_table(text, cols):
    """The ONE markdown table whose header starts with cols[0]. Returns (rows, errors).
    Errors: wrong header, wrong cell count, a second table with the same header."""
    lines = text.splitlines()
    rows, errors, i, found = [], [], 0, False
    while i < len(lines):
        if lines[i].strip().startswith("|") and _cells(lines[i])[:1] == [cols[0]]:
            if found:
                errors.append("a second table headed %r at line %d; one table only" % (cols[0], i + 1))
                return rows, errors
            found = True
            header = _cells(lines[i])
            if header != cols:
                errors.append("table header is %r, expected %r" % (header, cols))
                return rows, errors
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                c = _cells(lines[i])
                if len(c) != len(cols):
                    errors.append("line %d has %d cells, expected %d: %r" % (i + 1, len(c), len(cols), lines[i][:60]))
                else:
                    rows.append(dict(zip(cols, c)))
                i += 1
            continue
        i += 1
    if not found:
        errors.append("no table with header %r found" % cols[0])
    return rows, errors


def parse_manifest(text):
    out = {}
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = ln.split(None, 1)
        if len(parts) == 2 and re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            out[parts[1].strip()] = parts[0]
    return out


def strip_tex_comments(t):
    return "\n".join(COMMENT_RE.sub("", ln) for ln in t.splitlines())


def parse_tex(texts):
    """texts: {relpath: content}. Returns dict:
       envs: [{env, where, labels, tags:{label:status}, body}]  one per theorem-like environment
       labels: all \\label tokens anywhere;  tags: all \\claimstatus anywhere {label: status}
       dup_tags, unverified, cites, unclosed: ['file:line env'] for a \\begin without \\end."""
    envs, labels, tags, dups, cites, unclosed = [], set(), {}, [], set(), []
    unverified = 0
    for rel, raw in sorted(texts.items()):
        t = strip_tex_comments(raw)
        labels.update(LABEL_RE.findall(t))
        for lab, st in TAG_RE.findall(t):
            if lab in tags:
                dups.append(lab)
            tags[lab] = st.strip()
        for grp in CITE_RE.findall(t):
            cites.update(k.strip() for k in grp.split(",") if k.strip())
        unverified += len(UNVERIFIED_RE.findall(t))
        pos = 0
        while True:
            m = ENV_RE.search(t, pos)
            if not m:
                break
            env = m.group(1)
            end = re.compile(r"\\end\{%s\}" % env).search(t, m.end())
            where = "%s:%d" % (rel, t.count("\n", 0, m.start()) + 1)
            if not end:
                unclosed.append("%s %s" % (where, env))
                break
            body = t[m.end():end.start()]
            envs.append({"env": env, "where": where, "labels": LABEL_RE.findall(body),
                         "tags": {a: b.strip() for a, b in TAG_RE.findall(body)},
                         "body": norm_ws(TAG_RE.sub("", LABEL_RE.sub("", body)))})
            pos = end.end()
    return {"envs": envs, "labels": labels, "tags": tags, "dup_tags": dups, "unverified": unverified,
            "cites": cites, "unclosed": unclosed, "files": len(texts)}


def parse_bib_keys(text):
    return set(BIBKEY_RE.findall(text or ""))


def parse_locus(locus):
    m = re.fullmatch(r"[^:]+:(\d+)(?:\s*[-\u2013]\s*(\d+))?", locus.strip())
    if not m:
        return None
    a = int(m.group(1))
    b = int(m.group(2)) if m.group(2) else a
    return (a, b) if a <= b else (b, a)


def split_deps(cell):
    """'a; b | c' -> [['a'], ['b', 'c']]: AND over groups, OR inside a group."""
    cell = cell.strip()
    if cell in ("", "-"):
        return []
    groups = []
    for g in re.split(r"[;,]", cell):
        alts = [x.strip() for x in g.split("|") if x.strip()]
        if alts:
            groups.append(alts)
    return groups


def parse_review_note(text):
    """Per claim:  RECEIPT <id> <sha256>   PREMISES <id>: a; b; NEW: ...   VERDICT <id>: VALID|INVALID
    Returns ({id: {...}}, errors). A duplicated line for one id is an error (no ambiguity)."""
    out, errors = {}, []
    for kind, rx in (("receipt", r"^RECEIPT\s+(\S+)\s+([0-9a-f]{64})\s*$"),
                     ("verdict", r"^VERDICT\s+(\S+):\s*(VALID|INVALID)\s*$"),
                     ("premises", r"^PREMISES\s+(\S+):\s*(.*)$")):
        for m in re.finditer(rx, text or "", re.M):
            ent = out.setdefault(m.group(1), {})
            if kind in ent:
                errors.append("%s line repeated for %s" % (kind.upper(), m.group(1)))
            if kind == "premises":
                prem, new = [], []
                for tok in re.split(r"[;,]", m.group(2)):
                    tok = tok.strip()
                    if tok and tok != "-":
                        (new if tok.upper().startswith("NEW:") else prem).append(tok)
                ent["premises"], ent["new"] = prem, new
            else:
                ent[kind] = m.group(2)
    return out, errors


def parse_audit_note(text):
    """AUDIT-OF <64hex>, CLOSED-AT <64hex>, and the '## Blockers' section as a list of
    (checked: bool, line). Section ends at the next '## ' heading."""
    out = {"audit_of": None, "closed_at": None, "blockers": [], "has_section": False}
    m = re.search(r"^AUDIT-OF\s+([0-9a-f]{64})\s*$", text or "", re.M)
    out["audit_of"] = m.group(1) if m else None
    m = re.search(r"^CLOSED-AT\s+([0-9a-f]{64})\s*$", text or "", re.M)
    out["closed_at"] = m.group(1) if m else None
    inside = False
    for ln in (text or "").splitlines():
        if ln.startswith("## "):
            inside = ln.strip().lower() == "## blockers"
            out["has_section"] |= inside
            continue
        if inside and ln.strip().startswith("- ["):
            out["blockers"].append((ln.strip()[:5] == "- [x]", ln.strip()))
    return out
