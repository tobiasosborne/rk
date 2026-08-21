#!/usr/bin/env python3
"""Red/green tests for the rk-light gate. Run: python3 scripts/tests/test_check.py
One green fixture; each red case mutates it in exactly one way and asserts the one ERROR code.
A check without a red case here does not exist (lessons L3)."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
sys.path.insert(0, SCRIPTS)
import rkl_parse as P  # noqa: E402
import rkl_status as S  # noqa: E402
import rkl_checks as K  # noqa: E402

SOURCE = "Intro.\nTheorem 1. Every bounded monotone sequence of real numbers converges.\nProof. Omitted.\nAlso the norm |x| is small.\n"
SHA = P.sha256_hex(SOURCE.encode())
CLAIMS = """# CLAIMS
| id | kind | status | deps | label | statement | proof | author | review | note |
|---|---|---|---|---|---|---|---|---|---|
| def-seq | def | stipulated | - | def:seq | - | - | - | - | - |
| cit-mono | cited | cited | - | cit:mono | bounded monotone converges | - | - | - | src thm 1 |
| asm-one | assumption | assumed | - | asm:one | the space is complete | - | - | - | not in source |
| lem-a | lemma | proved | cit-mono | lem:a | a lemma | notes/w1/lem-a.md | claude:opus | codex:gpt-5.6-sol 2026-08-21 notes/reviews/lem-a.md | - |
| lem-b | lemma | sketched | - | lem:b | alt lemma | - | - | - | - |
| thm-main | thm | proved | lem-a \\| lem-b; asm-one | thm:main | the main claim | notes/w1/main.md | claude:opus | codex:gpt-5.6-sol 2026-08-21 notes/reviews/main.md | - |
| obs-num | obs | numerical | - | obs:num | numerics | - | - | - | - |
"""
PROV = """# PROVENANCE
| key | path | sha256 | what |
|---|---|---|---|
| src | sources/src/paper.txt | %s | toy |

| label | key | locus | quote |
|---|---|---|---|
| cit:mono | src | src:2 | Every bounded   monotone sequence of real numbers converges. |
""" % SHA[:16]
TEX = r"""\section{Main}
\begin{definition}\label{def:seq} a sequence \end{definition}
\begin{lemma}\label{lem:a}\claimstatus{lem:a}{proved} ... \end{lemma}
\begin{lemma}\label{lem:b}\claimstatus{lem:b}{sketched} ... \end{lemma}
\begin{theorem}\label{thm:main}\claimstatus{thm:main}{proved-conditional} ... \end{theorem}
\begin{assumption}\label{asm:one}\claimstatus{asm:one}{assumed} ... \end{assumption}
\begin{observation}\label{obs:num}\claimstatus{obs:num}{numerical} ... \end{observation}
\begin{theorem}[Source, Thm 1]\label{cit:mono}\claimstatus{cit:mono}{cited} Every bounded monotone sequence of real numbers converges. \end{theorem}
See \cite{src}.
"""
BIB = "@misc{src, title={toy}}\n"


def write(root, rel, text):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text)


def run(root, *args):
    p = subprocess.run([sys.executable, os.path.join(SCRIPTS, "check.py"), *args], cwd=root, capture_output=True, text=True)
    return p.returncode, p.stdout


def receipt(root, cid):
    rc, out = run(root, "--receipt", cid)
    assert rc == 0, out
    return out.strip()


def make_fixture(root, stakes="report"):
    write(root, ".rk-light.json", json.dumps({"mode": "formalise", "stakes": stakes, "main": "thm-main", "page_target": [10, 30]}))
    write(root, "CLAIMS.md", CLAIMS)
    write(root, "PROVENANCE.md", PROV)
    write(root, "CONVENTIONS.md", "# conv\n")
    write(root, "sources/src/paper.txt", SOURCE)
    write(root, "sources/manifest.sha256", "%s  sources/src/paper.txt\n" % SHA)
    write(root, "notes/w1/lem-a.md", "proof of lem-a\n")
    write(root, "notes/w1/main.md", "proof of main\n")
    write(root, "report/sections/01_main.tex", TEX)
    write(root, "report/refs.bib", BIB)
    write(root, "notes/reviews/lem-a.md", "# review\n%s\nPREMISES lem-a: cit-mono\nVERDICT lem-a: VALID\n" % receipt(root, "lem-a"))
    write(root, "notes/reviews/main.md", "# review\n%s\nPREMISES thm-main: lem-a; asm-one\nVERDICT thm-main: VALID\n" % receipt(root, "thm-main"))
    run(root, "--regen")


class GateTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="rkl-")
        make_fixture(self.root)

    def tearDown(self):
        shutil.rmtree(self.root)

    def assertRed(self, code, *args):
        rc, out = run(self.root, *args)
        self.assertEqual(rc, 1, out)
        self.assertIn("ERROR %-24s" % code, out, out)

    def test_green(self):
        rc, out = run(self.root)
        self.assertEqual(rc, 0, out)
        self.assertIn("quotes: checked 1/1", out)
        self.assertIn("reviews: checked 2/2", out)

    # ---- status semantics (pure)
    def test_effective_statuses(self):
        rows, _ = P.parse_table(CLAIMS, P.CLAIMS_COLS)
        claims, _ = K.check_claims(rows, {})
        eff, cond, cycles = S.compute(claims)
        self.assertEqual(eff["thm-main"], "proved-conditional")  # OR-group picks lem-a (proved); asm-one makes it conditional
        self.assertEqual(cond["thm-main"], ["asm-one"])
        self.assertEqual(eff["lem-a"], "proved")
        self.assertFalse(cycles)

    def test_refuted_dep_is_unsupported_not_refuted(self):
        rows, _ = P.parse_table(CLAIMS.replace("| lem-a | lemma | proved |", "| lem-a | lemma | refuted |").replace("lem-a \\| lem-b; asm-one", "lem-a; asm-one"), P.CLAIMS_COLS)
        claims, _ = K.check_claims(rows, {})
        eff, _, _ = S.compute(claims)
        self.assertEqual(eff["thm-main"], "unsupported")

    def test_or_alternative_rescues(self):
        rows, _ = P.parse_table(CLAIMS.replace("| lem-a | lemma | proved |", "| lem-a | lemma | open |"), P.CLAIMS_COLS)
        claims, _ = K.check_claims(rows, {})
        eff, _, _ = S.compute(claims)
        self.assertEqual(eff["thm-main"], "sketched-conditional")  # falls back to lem-b (sketched)

    def test_numerical_is_a_ceiling(self):
        rows, _ = P.parse_table(CLAIMS.replace("lem-a \\| lem-b; asm-one", "lem-a; obs-num"), P.CLAIMS_COLS)
        claims, _ = K.check_claims(rows, {})
        eff, _, _ = S.compute(claims)
        self.assertEqual(eff["thm-main"], "numerical")

    # ---- red cases, one per check
    def test_fabricated_quote_is_red(self):
        write(self.root, "PROVENANCE.md", PROV.replace("converges.", "diverges."))
        self.assertRed("prov.quote")

    def test_wrong_locus_is_red(self):
        write(self.root, "PROVENANCE.md", PROV.replace("src:2", "src:9"))
        self.assertRed("prov.locus-wrong")

    def test_hash_drift_is_red(self):
        write(self.root, "sources/src/paper.txt", SOURCE + "tampered\n")
        self.assertRed("prov.hash-drift")

    def test_overclaim_tag_is_red(self):
        write(self.root, "report/sections/01_main.tex", TEX.replace("{thm:main}{proved-conditional}", "{thm:main}{proved}"))
        self.assertRed("tex.overclaim")

    def test_unlabelled_theorem_env_is_red(self):
        write(self.root, "report/sections/02_x.tex", "\\begin{lemma} no label \\end{lemma}\n")
        self.assertRed("tex.env-label")

    def test_orphan_label_is_red(self):
        write(self.root, "report/sections/02_x.tex", "\\begin{lemma}\\label{lem:ghost}\\claimstatus{lem:ghost}{open} x \\end{lemma}\n")
        self.assertRed("tex.env-unregistered")

    def test_unregistered_cite_is_red(self):
        write(self.root, "report/sections/02_x.tex", "see \\cite{nobody}\n")
        self.assertRed("tex.cite-unregistered")

    def test_stale_receipt_is_red(self):
        write(self.root, "notes/w1/lem-a.md", "proof of lem-a, edited after review\n")
        self.assertRed("review.stale")

    def test_conventions_change_stales_receipt(self):
        write(self.root, "CONVENTIONS.md", "# conv\n- sign flipped\n")
        self.assertRed("review.stale")

    def test_invalid_verdict_is_red(self):
        write(self.root, "notes/reviews/lem-a.md", "%s\nPREMISES lem-a: cit-mono\nVERDICT lem-a: INVALID\n" % receipt(self.root, "lem-a"))
        self.assertRed("review.verdict")

    def test_undeclared_premise_is_red(self):
        write(self.root, "notes/reviews/lem-a.md", "%s\nPREMISES lem-a: cit-mono; NEW: completeness of the reals\nVERDICT lem-a: VALID\n" % receipt(self.root, "lem-a"))
        self.assertRed("review.new-premise")

    def test_premise_outside_deps_is_red(self):
        write(self.root, "notes/reviews/lem-a.md", "%s\nPREMISES lem-a: cit-mono; lem-b\nVERDICT lem-a: VALID\n" % receipt(self.root, "lem-a"))
        self.assertRed("review.premise")

    def test_missing_review_note_is_red(self):
        os.remove(os.path.join(self.root, "notes/reviews/lem-a.md"))
        self.assertRed("review.missing")

    def test_unknown_dep_is_red(self):
        write(self.root, "CLAIMS.md", CLAIMS.replace("| cit-mono | lem:a", "| ghost | lem:a"))
        self.assertRed("claims.dep")

    def test_status_not_allowed_for_kind_is_red(self):
        write(self.root, "CLAIMS.md", CLAIMS.replace("| asm-one | assumption | assumed |", "| asm-one | assumption | proved |"))
        self.assertRed("claims.status")

    def test_cycle_is_red(self):
        write(self.root, "CLAIMS.md", CLAIMS.replace("| lem-b | lemma | sketched | - |", "| lem-b | lemma | sketched | thm-main |"))
        self.assertRed("claims.cycle")

    def test_partial_table_parse_is_red(self):
        write(self.root, "CLAIMS.md", CLAIMS + "| broken | row |\n")
        self.assertRed("claims.parse")

    def test_stale_banner_is_red(self):
        write(self.root, "report/generated/status.tex", "% hand edited\n")
        self.assertRed("gen.stale")

    def test_unverified_marker_is_red_at_report_stakes(self):
        write(self.root, "report/sections/02_x.tex", "see [UNVERIFIED] claim\n")
        self.assertRed("unverified")

    def test_note_stakes_forbids_proved(self):
        write(self.root, ".rk-light.json", json.dumps({"stakes": "note", "main": "thm-main"}))
        self.assertRed("claims.note-reviewed")

    def test_cited_without_row_is_red(self):
        write(self.root, "PROVENANCE.md", PROV.replace("| cit:mono | src | src:2 |", "| lem:a | src | src:2 |"))
        self.assertRed("prov.row-required")

    def test_commented_tag_is_ignored(self):
        write(self.root, "report/sections/02_x.tex", "% \\claimstatus{ghost:label}{proved}\nreal 50\\% text\n")
        rc, out = run(self.root)
        self.assertEqual(rc, 0, out)

    def test_pipe_in_quote_is_escaped_not_split(self):
        write(self.root, "PROVENANCE.md", PROV + "| lem:a | src | src:4 | the norm \\|x\\| is small |\n")
        rc, out = run(self.root)
        self.assertEqual(rc, 0, out)
        self.assertIn("checked 2/2", out)

    def state_hash(self):
        rc, out = run(self.root, "--state-hash")
        self.assertEqual(rc, 0, out)
        return out.strip()

    def test_release_grammar(self):
        self.assertRed("release.audit", "--release")
        h = self.state_hash()
        write(self.root, "notes/audit/2026-08-21.md", "AUDIT-OF %s\nCLOSED-AT %s\n## Blockers\n- [ ] overclaim in summary\n" % (h, h))
        self.assertRed("release.open-blocker", "--release")
        write(self.root, "notes/audit/2026-08-21.md", "AUDIT-OF %s\nCLOSED-AT %s\n## Blockers\n- [x] overclaim in summary\n" % (h, h))
        self.assertRed("release.blocker-grammar", "--release")
        write(self.root, "notes/audit/2026-08-21.md", "AUDIT-OF abc\nCLOSED-AT %s\n## Blockers\n- [x] x -> fixed\n" % h)
        self.assertRed("release.audit-of", "--release")
        write(self.root, "notes/audit/2026-08-21.md", "AUDIT-OF %s\nCLOSED-AT %s\n## Blockers\n- [x] overclaim -> demoted\n## Follow-ups\n- [ ] unchecked follow-ups do not block\n" % (h, h))
        rc, out = run(self.root, "--release")
        self.assertEqual(rc, 0, out)
        self.assertTrue(os.path.exists(os.path.join(self.root, "RELEASE.md")))

    def test_release_closed_at_must_match_current_state(self):
        h = self.state_hash()
        write(self.root, "notes/audit/2026-08-21.md", "AUDIT-OF %s\nCLOSED-AT %s\n## Blockers\nnone\n" % (h, h))
        write(self.root, "report/sections/01_main.tex", TEX + "\nA post-audit edit.\n")  # changes state
        self.assertRed("release.closed-at", "--release")

    # ---- review-2 false-greens
    def test_swapped_theorem_text_stales_receipt(self):
        write(self.root, "report/sections/01_main.tex", TEX.replace("\\claimstatus{lem:a}{proved} ...", "\\claimstatus{lem:a}{proved} $P = NP$."))
        self.assertRed("review.stale")

    def test_unregistered_theorem_env_is_red(self):
        write(self.root, "report/sections/02_x.tex", "\\begin{theorem}\\label{sec:false-green} $P=NP$ \\end{theorem}\n")
        self.assertRed("tex.env-label")

    def test_cited_env_paraphrase_is_red(self):
        # review-2 false-green: quote still matches the source, but the printed cited theorem says P=NP
        write(self.root, "report/sections/01_main.tex", TEX.replace("Every bounded monotone sequence of real numbers converges. \\end{theorem}", "ABN proves $P=NP$. \\end{theorem}"))
        self.assertRed("prov.cited-body")

    def test_env_kind_mismatch_is_red(self):
        write(self.root, "report/sections/01_main.tex", TEX.replace("\\begin{lemma}\\label{lem:a}", "\\begin{theorem}\\label{lem:a}").replace("\\end{lemma}\n\\begin{lemma}\\label{lem:b}", "\\end{theorem}\n\\begin{lemma}\\label{lem:b}"))
        self.assertRed("tex.env-kind")

    def test_tag_outside_env_is_red(self):
        write(self.root, "report/sections/01_main.tex", TEX.replace("\\label{lem:b}\\claimstatus{lem:b}{sketched} ... \\end{lemma}", "\\label{lem:b} ... \\end{lemma}\\claimstatus{lem:b}{sketched}"))
        self.assertRed("tex.tag")

    def test_missing_proof_file_is_red(self):
        os.remove(os.path.join(self.root, "notes/w1/lem-a.md"))
        self.assertRed("review.proof-missing")

    def test_self_review_is_red(self):
        write(self.root, "CLAIMS.md", CLAIMS.replace("| notes/w1/lem-a.md | claude:opus | codex:gpt-5.6-sol", "| notes/w1/lem-a.md | codex:gpt-5.6-sol | codex:gpt-5.6-sol"))
        self.assertRed("review.same-family")

    def test_refuted_needs_review(self):
        write(self.root, "CLAIMS.md", CLAIMS.replace("| lem-b | lemma | sketched | - | lem:b | alt lemma | - | - | - |", "| lem-b | lemma | refuted | - | lem:b | alt lemma | - | - | - |"))
        write(self.root, "report/sections/01_main.tex", TEX.replace("{lem:b}{sketched}", "{lem:b}{refuted}"))
        self.assertRed("review.cell")

    def test_numerical_conditional(self):
        rows, _ = P.parse_table(CLAIMS.replace("| obs-num | obs | numerical | - |", "| obs-num | obs | numerical | asm-one |"), P.CLAIMS_COLS)
        claims, _ = K.check_claims(rows, {})
        eff, cond, _ = S.compute(claims)
        self.assertEqual(eff["obs-num"], "numerical-conditional")

    def test_second_claims_table_is_red(self):
        write(self.root, "CLAIMS.md", CLAIMS + "\n| id | kind | status | deps | label | statement | proof | author | review | note |\n|---|---|---|---|---|---|---|---|---|---|\n")
        self.assertRed("claims.parse")

    def test_duplicate_receipt_line_is_red(self):
        r = receipt(self.root, "lem-a")
        write(self.root, "notes/reviews/lem-a.md", "%s\n%s\nPREMISES lem-a: cit-mono\nVERDICT lem-a: VALID\n" % (r, r))
        self.assertRed("review.note-format")


if __name__ == "__main__":
    unittest.main(verbosity=1)
