#!/usr/bin/env python3
"""check.py -- the rk-light gate (filesystem edge over rkl_parse / rkl_status / rkl_checks).

  python3 scripts/check.py [--check]   human report; exit 1 on any ERROR
  python3 scripts/check.py --quiet     ERROR/WARN lines only (Stop-hook mode)
  python3 scripts/check.py --regen     rewrite report/generated/status.tex from CLAIMS.md
  python3 scripts/check.py --receipt <id>
                                       print 'RECEIPT <id> <sha256>' for the verifier's brief: the
                                       hash of statement + deps + proof file + the theorem text as
                                       printed in report/ + CONVENTIONS.md + sources manifest
  python3 scripts/check.py --state-hash
                                       sha256 of CLAIMS, PROVENANCE, CONVENTIONS, manifest, report
                                       tex and every proof artifact (for AUDIT-OF / CLOSED-AT)
  python3 scripts/check.py --release   additionally require a recorded audit (AUDIT-OF, CLOSED-AT
                                       == current state hash, all blockers closed); writes RELEASE.md

Stdlib only. Runs from the project root. A ledger that does not parse completely is an ERROR.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rkl_parse as P  # noqa: E402
import rkl_status as S  # noqa: E402
import rkl_checks as K  # noqa: E402

ROOT = os.getcwd()


def inside(rel):
    p = os.path.realpath(os.path.join(ROOT, rel))
    return p.startswith(os.path.realpath(ROOT) + os.sep)


def read(rel, binary=False):
    p = os.path.join(ROOT, rel)
    if not rel or rel in ("-",) or not inside(rel) or not os.path.isfile(p):
        return None
    if binary:
        with open(p, "rb") as fh:
            return fh.read()
    with open(p, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def walk(subdir, suffix):
    out = {}
    for dp, _, fns in os.walk(os.path.join(ROOT, subdir)):
        if "generated" in dp.replace(os.sep, "/").split("/"):
            continue
        for fn in sorted(fns):
            if fn.endswith(suffix):
                rel = os.path.relpath(os.path.join(dp, fn), ROOT)
                out[rel] = read(rel)
    return out


def load():
    cfg = read(".rk-light.json")
    if cfg is None:
        return None, [K.E("init", "no .rk-light.json in %s (not an rk-light project)" % ROOT)]
    f = []
    rows, errs = P.parse_table(read("CLAIMS.md") or "", P.CLAIMS_COLS)
    f += [K.E("claims.parse", e) for e in errs]
    prov = read("PROVENANCE.md") or ""
    reg, errs = P.parse_table(prov, P.PROV1_COLS)
    f += [K.E("prov.parse", e) for e in errs]
    prow, errs = P.parse_table(prov, P.PROV2_COLS)
    f += [K.E("prov.parse", e) for e in errs]
    texts = walk("report", ".tex")
    return {"config": json.loads(cfg), "rows": rows, "reg": reg, "prow": prow,
            "manifest_text": read("sources/manifest.sha256") or "",
            "conventions": read("CONVENTIONS.md", binary=True),
            "texts": texts, "tex": P.parse_tex(texts), "bib": read("report/refs.bib") or ""}, f


def env_body_for(L, label):
    for env in L["tex"]["envs"]:
        if label in env["labels"]:
            return env["body"]
    return ""


def receipts_for(claims, L):
    out, exists = {}, {}
    for cid, r in claims.items():
        proof = read(r["proof"], binary=True)
        exists[cid] = proof is not None
        out[cid] = K.receipt_hash(cid, r, proof, L["conventions"], L["manifest_text"], env_body_for(L, r["label"]))
    return out, exists


def state_hash(L, claims):
    parts = [read("CLAIMS.md") or "", read("PROVENANCE.md") or "", (L["conventions"] or b"").decode("utf-8", "replace"), L["manifest_text"]]
    for rel in sorted(L["texts"]):
        parts.append(rel + "\x00" + (L["texts"][rel] or ""))
    for cid in sorted(claims):
        parts.append(cid + "\x00" + ((read(claims[cid]["proof"], binary=True) or b"").decode("utf-8", "replace")))
    return P.sha256_hex("\x01".join(parts).encode())


def run(L, regen=False, release=False):
    config, f = L["config"], []
    claims, cf = K.check_claims(L["rows"], config)
    f += cf
    eff, cond, cycles = S.compute(claims)
    f += [K.E("claims.cycle", "%s: dependency cycle" % c) for c in sorted(cycles)]
    receipts, proof_exists = receipts_for(claims, L)
    notes = {}
    for r in claims.values():
        toks = r["review"].split()
        if toks and toks[-1].startswith("notes/"):
            notes[toks[-1]] = read(toks[-1])
    f += K.check_reviews(claims, receipts, notes, proof_exists)
    f += K.check_tex(claims, eff, L["tex"], P.parse_bib_keys(L["bib"]), {r["key"] for r in L["reg"]})
    file_bytes = {r["path"]: read(r["path"], binary=True) for r in L["reg"]}
    bodies = {lab: env["body"] for env in L["tex"]["envs"] for lab in env["labels"]}
    f += K.check_provenance(L["reg"], L["prow"], P.parse_manifest(L["manifest_text"]), file_bytes, claims, L["tex"]["labels"], bodies)
    banner = S.banner_tex(claims, eff, cond, config)
    gen = "report/generated/status.tex"
    if regen:
        os.makedirs(os.path.join(ROOT, "report", "generated"), exist_ok=True)
        with open(os.path.join(ROOT, gen), "w", encoding="utf-8") as fh:
            fh.write(banner)
        f.append(K.I("gen.regen", "wrote %s" % gen))
    elif read(gen) != banner:
        f.append(K.E("gen.stale", "%s is stale or hand-edited; run `make regen`" % gen))
    if L["tex"]["unverified"]:
        lvl = "ERROR" if config.get("stakes", "report") == "report" else "WARN"
        f.append(K.Finding(lvl, "unverified", "%d [UNVERIFIED] marker(s) in report/" % L["tex"]["unverified"]))
    pages = (read("report/.pages") or "").strip()
    lo, hi = (config.get("page_target") or [10, 30])[:2]
    if pages.isdigit() and not lo <= int(pages) <= hi:
        f.append(K.W("pages", "report has %s pages; target %d-%d (BRIEF may change the target)" % (pages, lo, hi)))
    if release:
        f += K.check_release(walk("notes/audit", ".md"), state_hash(L, claims))
    by = {}
    for cid in claims:
        by[eff[cid]] = by.get(eff[cid], 0) + 1
    f.append(K.I("summary", "claims: %d (%s)" % (len(claims), ", ".join("%s %d" % kv for kv in sorted(by.items())))))
    return f, claims, eff, cond


def main(argv):
    L, f0 = load()
    if L is None:
        print("ERROR init                   %s" % f0[0].msg)
        return 1
    claims0, _ = K.check_claims(L["rows"], L["config"])
    if "--state-hash" in argv:
        print(state_hash(L, claims0))
        return 0
    if "--receipt" in argv:
        cid = argv[argv.index("--receipt") + 1]
        if cid not in claims0:
            print("ERROR receipt                unknown claim %s" % cid)
            return 1
        receipts, exists = receipts_for(claims0, L)
        if not exists[cid]:
            print("ERROR receipt                %s: proof path %r does not exist inside the project; no receipt" % (cid, claims0[cid]["proof"]))
            return 1
        print("RECEIPT %s %s" % (cid, receipts[cid]))
        return 0
    release = "--release" in argv
    f, claims, eff, cond = run(L, regen="--regen" in argv, release=release)
    f = f0 + f
    quiet = "--quiet" in argv
    n_err = sum(1 for x in f if x.level == "ERROR")
    for x in f:
        if quiet and x.level == "INFO":
            continue
        print("%-5s %-24s %s" % (x.level, x.code, x.msg))
    if release and n_err == 0:
        main_id = L["config"].get("main")
        with open(os.path.join(ROOT, "RELEASE.md"), "w", encoding="utf-8") as fh:
            fh.write("# RELEASE\n\nstate-hash: %s\nheadline: %s is %s%s\n" % (
                state_hash(L, claims), main_id, eff.get(main_id, "?"),
                (" conditional on " + ", ".join(cond.get(main_id, []))) if cond.get(main_id) else ""))
        print("INFO  release                  wrote RELEASE.md")
    if not quiet:
        print("rk-light check: %d ERROR, %d WARN -> %s" % (n_err, sum(1 for x in f if x.level == "WARN"), "FAIL" if n_err else "PASS"))
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
