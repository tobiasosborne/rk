---
id: thm-qpcp
kind: theorem
status: stated
af: none
contract: The Hamiltonian qPCP statement at constant qudit dimension.
deps: lem-amp
---

The Hamiltonian qPCP statement at constant qudit dimension.

```signature
{
  "post": [
    {
      "gap": "const",
      "obj": "def-promise-gap"
    }
  ],
  "pre": [
    {
      "gap": "const",
      "obj": "def-promise-gap"
    },
    {
      "obj": "def-local-hamiltonian",
      "qdim": "const"
    }
  ],
  "profile": "rk-corpus.v1",
  "regime": [
    {
      "qdim": "const"
    }
  ],
  "schema_version": "1"
}
```
