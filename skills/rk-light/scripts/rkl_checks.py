#!/usr/bin/env python3
"""rkl_checks.py -- pure checks over parsed inputs. No filesystem access.
Every function returns a list of Finding(level, code, msg); level in {ERROR, WARN, INFO}.
Every check that iterates reports its coverage as an INFO line (lessons L3)."""
from collections import namedtuple

from rkl_parse import (ENV_PREFIXES, norm_ws, sha256_hex, split_deps, parse_locus,
                       parse_review_note, parse_audit_note)
from rkl_status import KINDS, LABEL_PREFIX, PRINTABLE, REVIEWED, allowed_status

Finding = namedtuple("Finding", "level code msg")


def E(code, msg):
    return Finding("ERROR", code, msg)


def W(code, msg):
    return Finding("WARN", code, msg)


def I(code, msg):
    return Finding("INFO", code, msg)


def _family(cell):
    tok = cell.split()[0] if cell.split() else ""
    return tok.split(":")[0] if ":" in tok else ""


def check_claims(rows, config):
    f, claims = [], {}
    for r in rows:
        cid = r["id"]
        if cid in claims:
            f.append(E("claims.dup", "duplicate claim id %s" % cid))
            continue
        claims[cid] = r
        if r["kind"] not in KINDS:
            f.append(E("claims.kind", "%s: unknown kind %r" % (cid, r["kind"])))
            continue
        if r["status"] not in allowed_status(r["kind"]):
            f.append(E("claims.status", "%s: status %r not allowed for kind %s (allowed: %s)" % (
                cid, r["status"], r["kind"], " ".join(sorted(allowed_status(r["kind"]))))))
        if r["kind"] in ("cited", "assumption", "def") and split_deps(r["deps"]):
            f.append(E("claims.terminal-deps", "%s: %s rows carry no deps" % (cid, r["kind"])))
        if r["label"] not in ("", "-") and not r["label"].startswith(LABEL_PREFIX[r["kind"]] + ":"):
            f.append(E("claims.label-prefix", "%s: label %s should start with %s:" % (cid, r["label"], LABEL_PREFIX[r["kind"]])))
        if r["statement"].strip() in ("", "-") and r["kind"] != "def":
            f.append(E("claims.statement", "%s: one-line statement required" % cid))
    for cid, r in claims.items():
        for group in split_deps(r["deps"]):
            for d in group:
                if d not in claims:
                    f.append(E("claims.dep", "%s: unknown dep %s" % (cid, d)))
    if config.get("stakes", "report") == "note":
        for cid, r in claims.items():
            if r["status"] in REVIEWED:
                f.append(E("claims.note-reviewed", "%s: stakes=note cannot hold %s rows" % (cid, r["status"])))
    main = config.get("main")
    if main and main not in claims:
        f.append(E("claims.main", "main claim %s not in ledger" % main))
    return claims, f


def receipt_hash(cid, row, proof_bytes, conventions_bytes, manifest_text, env_body):
    """What a review certifies: this statement, these deps, this proof artifact, the exact
    theorem text printed in the report (if already written), these conventions, these source
    versions. Any change makes the receipt stale."""
    h = b"\x00".join([cid.encode(), row["statement"].encode(), row["deps"].encode(),
                      proof_bytes or b"", (env_body or "").encode(), conventions_bytes or b"",
                      (manifest_text or "").encode()])
    return sha256_hex(h)


def check_reviews(claims, receipts, notes, proof_exists):
    """receipts: {id: current hash}; notes: {path: text|None}; proof_exists: {id: bool}."""
    f, n = [], 0
    for cid, r in claims.items():
        if r["status"] not in REVIEWED:
            continue
        n += 1
        what = "proved" if r["status"] == "proved" else "refuted (the refutation/witness)"
        toks = r["review"].split()
        if len(toks) < 3 or not toks[-1].startswith("notes/reviews/") or ":" not in toks[0]:
            f.append(E("review.cell", "%s: %s needs review '<family>:<model> <date> notes/reviews/<file>'" % (cid, what)))
            continue
        if r["proof"].strip() in ("", "-") or not proof_exists.get(cid):
            f.append(E("review.proof-missing", "%s: proof/witness path %r must exist inside the project" % (cid, r["proof"])))
        if ":" not in r["author"]:
            f.append(E("review.author", "%s: author must be '<family>:<model>'" % cid))
        elif _family(r["author"]) == _family(r["review"]):
            if "single-family" not in toks:
                f.append(E("review.same-family", "%s: author %s and reviewer %s are the same family; add single-family (printed) or use the other family" % (cid, r["author"], toks[0])))
            elif r["author"].split()[0] == toks[0]:
                f.append(E("review.self-review", "%s: author and reviewer are the same model" % cid))
        body = notes.get(toks[-1])
        if body is None:
            f.append(E("review.missing", "%s: review note %s not found" % (cid, toks[-1])))
            continue
        entries, errs = parse_review_note(body)
        for e in errs:
            f.append(E("review.note-format", "%s: %s" % (toks[-1], e)))
        ent = entries.get(cid)
        if not ent:
            f.append(E("review.no-entry", "%s: %s has no RECEIPT/VERDICT lines for this id" % (cid, toks[-1])))
            continue
        if ent.get("verdict") != "VALID":
            f.append(E("review.verdict", "%s: verdict is %s, not VALID" % (cid, ent.get("verdict", "missing"))))
        if ent.get("receipt") != receipts.get(cid):
            f.append(E("review.stale", "%s: receipt does not match the current statement/deps/proof/report text/conventions/sources; re-review" % cid))
        if "premises" not in ent:
            f.append(E("review.premises-missing", "%s: note lacks a PREMISES line" % cid))
        else:
            declared = {d for g in split_deps(r["deps"]) for d in g}
            for p in ent["premises"]:
                if p not in declared:
                    f.append(E("review.premise", "%s: verifier found premise %r not declared in deps" % (cid, p)))
            for nw in ent["new"]:
                f.append(E("review.new-premise", "%s: undeclared premise reported by verifier: %s (add an assumption row and re-review)" % (cid, nw)))
        if "single-family" in toks:
            f.append(W("review.single-family", "%s: reviewed by a single model family" % cid))
    f.append(I("review.coverage", "reviews: checked %d/%d proved/refuted rows" % (n, n)))
    return f


def check_tex(claims, eff, tex, bibkeys, prov_keys):
    f = []
    for lab in tex["dup_tags"]:
        f.append(E("tex.dup-tag", "\\claimstatus for %s appears more than once" % lab))
    for where in tex["unclosed"]:
        f.append(E("tex.unclosed-env", "%s: environment without matching \\end" % where))
    bylabel = {}
    for cid, r in claims.items():
        lab = r["label"]
        if lab in ("", "-"):
            f.append(W("tex.no-label", "%s: not in the report yet" % cid))
            continue
        if lab in bylabel:
            f.append(E("tex.dup-label-row", "label %s used by %s and %s" % (lab, bylabel[lab], cid)))
        bylabel[lab] = cid
    # Every theorem-like environment is a unit: exactly one claim label whose prefix fits the
    # environment, a CLAIMS row for it, and (except definitions) exactly one tag, inside the
    # environment, equal to the derived status.
    seen_env_labels = set()
    for env in tex["envs"]:
        kind_labels = [l for l in env["labels"] if l.split(":")[0] in LABEL_PREFIX.values()]
        if len(kind_labels) != 1:
            f.append(E("tex.env-label", "%s: %s environment must carry exactly one claim label (found %s)" % (env["where"], env["env"], kind_labels or "none")))
            continue
        lab = kind_labels[0]
        if lab.split(":")[0] not in ENV_PREFIXES[env["env"]]:
            f.append(E("tex.env-kind", "%s: label %s does not fit a %s environment" % (env["where"], lab, env["env"])))
        if lab in seen_env_labels:
            f.append(E("tex.env-dup", "%s: label %s printed in two environments" % (env["where"], lab)))
        seen_env_labels.add(lab)
        cid = bylabel.get(lab)
        if cid is None:
            f.append(E("tex.env-unregistered", "%s: %s has no CLAIMS row" % (env["where"], lab)))
            continue
        if claims[cid]["kind"] == "def":
            if env["tags"]:
                f.append(E("tex.def-tag", "%s: definitions carry no \\claimstatus" % cid))
            continue
        tag = env["tags"].get(lab)
        if tag is None or len(env["tags"]) != 1:
            f.append(E("tex.tag", "%s: %s needs exactly one \\claimstatus{%s}{%s} inside the environment" % (env["where"], cid, lab, eff[cid])))
        elif tag not in PRINTABLE:
            f.append(E("tex.tag-vocab", "%s: unknown printed status %r" % (cid, tag)))
        elif tag != eff[cid]:
            f.append(E("tex.overclaim", "%s: tex prints %s but the derived status is %s" % (cid, tag, eff[cid])))
    for lab, cid in bylabel.items():
        if lab not in seen_env_labels:
            f.append(E("tex.label", "%s: label %s is not printed in any theorem-like environment" % (cid, lab)))
    for lab in tex["tags"]:
        if lab not in bylabel:
            f.append(E("tex.orphan-tag", "\\claimstatus{%s} has no CLAIMS row" % lab))
    for lab in tex["labels"]:
        if lab.split(":")[0] in LABEL_PREFIX.values() and lab not in bylabel:
            f.append(E("tex.orphan-label", "\\label{%s} has no CLAIMS row" % lab))
    for key in sorted(tex["cites"]):
        if key not in bibkeys:
            f.append(E("tex.cite-bib", "\\cite{%s} not in report/refs.bib" % key))
        if key not in prov_keys:
            f.append(E("tex.cite-unregistered", "\\cite{%s} is not a PROVENANCE source key" % key))
    f.append(I("tex.coverage", "tex: %d environments, %d labels, %d tags, %d cites, %d files" % (
        len(tex["envs"]), len(tex["labels"]), len(tex["tags"]), len(tex["cites"]), tex["files"])))
    return f


def check_provenance(reg, rows, manifest, file_bytes, claims, tex_labels, env_bodies=None):
    env_bodies = env_bodies or {}
    f, keys = [], {}
    for r in reg:
        if r["key"] in keys:
            f.append(E("prov.dup-key", "source key %s registered twice" % r["key"]))
        keys[r["key"]] = r
        data = file_bytes.get(r["path"])
        if data is None:
            f.append(E("prov.source-missing", "%s: %s not found" % (r["key"], r["path"])))
            continue
        live = sha256_hex(data)
        if r["path"] not in manifest:
            f.append(E("prov.manifest", "%s: %s not in sources/manifest.sha256" % (r["key"], r["path"])))
        elif manifest[r["path"]] != live:
            f.append(E("prov.hash-drift", "%s: %s changed since it was hashed" % (r["key"], r["path"])))
        if len(r["sha256"]) < 16 or not live.startswith(r["sha256"].lower()):
            f.append(E("prov.registry-sha", "%s: registry sha256 %r does not match the file" % (r["key"], r["sha256"])))
    lines_cache, checked = {}, 0
    claim_labels = {c["label"] for c in claims.values()}
    for r in rows:
        lab = r["label"]
        if lab not in tex_labels and lab not in claim_labels:
            f.append(E("prov.label", "%s: label neither in tex nor in CLAIMS" % lab))
        src = keys.get(r["key"])
        if src is None:
            f.append(E("prov.key", "%s: unknown source key %r" % (lab, r["key"])))
            continue
        data = file_bytes.get(src["path"])
        if data is None:
            continue
        q = norm_ws(r["quote"])
        if not q:
            f.append(E("prov.empty-quote", "%s: empty quote" % lab))
            continue
        loc = parse_locus(r["locus"])
        if loc is None or not r["locus"].startswith(r["key"] + ":"):
            f.append(E("prov.locus", "%s: locus %r must be <key>:<line> or <key>:<from>-<to>" % (lab, r["locus"])))
            continue
        if src["path"] not in lines_cache:
            lines_cache[src["path"]] = data.decode("utf-8", "replace").splitlines()
        src_lines = lines_cache[src["path"]]
        a, b = loc
        window = norm_ws(" ".join(src_lines[max(0, a - 3): min(len(src_lines), b + 2)]))
        checked += 1
        if q in window:
            continue
        whole = norm_ws(" ".join(src_lines))
        if q in whole:
            f.append(E("prov.locus-wrong", "%s: quote is in %s but not at %s" % (lab, r["key"], r["locus"])))
        else:
            drift = len(q) >= 30 and any(q[i:i + 30] in whole for i in range(0, len(q) - 29, 10))
            f.append(E("prov.quote", "%s: quote not found verbatim in %s (%s)%s" % (
                lab, r["key"], r["locus"], "; a partial run matches: the quote has drifted" if drift else "")))
    v_labels = {r["label"] for r in rows}
    for cid, c in claims.items():
        if c["status"] in ("cited", "quoted") and c["label"] not in v_labels:
            f.append(E("prov.row-required", "%s: status %s requires a PROVENANCE Part 2 row for %s" % (cid, c["status"], c["label"])))
        elif c["status"] in ("cited", "quoted") and c["label"] in env_bodies:
            body = env_bodies[c["label"]]
            quotes = [norm_ws(r["quote"]) for r in rows if r["label"] == c["label"]]
            if not any(q and q in body for q in quotes):
                f.append(E("prov.cited-body", "%s: the %s environment must reproduce one of its PROVENANCE quotes verbatim (the printed statement is the source's words, not a paraphrase)" % (cid, c["label"])))
    if reg and not rows:
        f.append(W("prov.zero", "sources registered but no quotes yet: nothing external may be stated in report/ until rows exist"))
    f.append(I("prov.coverage", "quotes: checked %d/%d; sources: %d" % (checked, len(rows), len(reg))))
    return f


def check_release(audit_notes, current_state_hash):
    """audit_notes: {path: text}. Release needs the latest audit note to carry AUDIT-OF
    (pre-repair state hash, 64 hex), CLOSED-AT equal to the CURRENT state hash (so the
    repaired state is the one being released), and a '## Blockers' section in which every
    item is '- [x] ... -> fixed' or '- [x] ... -> demoted' (or the single word none)."""
    f = []
    if not audit_notes:
        return [E("release.audit", "no notes/audit/*.md: the hostile audit (P5) has not been recorded")]
    path, text = sorted(audit_notes.items())[-1]
    a = parse_audit_note(text)
    if not a["audit_of"]:
        f.append(E("release.audit-of", "%s: needs 'AUDIT-OF <64-hex state hash>' (python3 scripts/check.py --state-hash, taken BEFORE repairs)" % path))
    if a["closed_at"] != current_state_hash:
        f.append(E("release.closed-at", "%s: 'CLOSED-AT <hash>' must equal the current state hash %s (re-run --state-hash after the repair wave and record it)" % (path, current_state_hash[:12])))
    if not a["has_section"]:
        f.append(E("release.blockers", "%s: no '## Blockers' section" % path))
    n_open = 0
    for checked, ln in a["blockers"]:
        if not checked:
            n_open += 1
            f.append(E("release.open-blocker", "%s: unresolved: %s" % (path, ln[6:90])))
        elif not (ln.rstrip().endswith("-> fixed") or ln.rstrip().endswith("-> demoted")):
            f.append(E("release.blocker-grammar", "%s: closed blockers end with '-> fixed' or '-> demoted': %s" % (path, ln[:90])))
    f.append(I("release.coverage", "audit %s: %d blocker(s), %d open" % (path, len(a["blockers"]), n_open)))
    return f
