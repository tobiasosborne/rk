---
id: sym-locality
term: locality
shard_type: notation
symbol: \locality
class: locality
kind: consensus
consensus: campaign convention, qpcp.v1
status: locked
translations:
- aav-1309.7495: k @ refs/aav-1309.7495/paper.tex:12
---

**The campaign's locality**, the number of qudits one term touches. The `translations:` block
above is written in the FRONTMATTER, where the flat `key: value` grammar cannot carry a quote
anchor at all. `parseFrontmatter` joins the `- ` items into one `;`-separated string, so the
row/anchor pairing is destroyed before any check sees it: the body-level scan finds zero rows,
and without this check the shard would report a clean `0/0 translations verified`.
