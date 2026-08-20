---
id: thm-ok
kind: theorem
status: stated
af: none
contract: The same chain, stated in a regime the construction actually holds in.
deps: lem-cap
---

The same chain, stated in a regime the construction actually holds in.

```signature
{
  "post": [
    {
      "gap": [
        "inv-poly",
        "const"
      ],
      "obj": "def-promise-gap"
    }
  ],
  "pre": [
    {
      "obj": "def-local-hamiltonian",
      "qdim": "const"
    }
  ],
  "profile": "rk-corpus.v1",
  "regime": [
    {
      "norm": "relative",
      "qdim": "const"
    }
  ],
  "schema_version": "1"
}
```
