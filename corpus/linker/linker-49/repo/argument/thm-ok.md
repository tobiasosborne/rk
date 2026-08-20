---
id: thm-ok
kind: theorem
status: stated
af: none
contract: The same chain, stated in the regime the amplifier actually holds in.
deps: lem-amp
---

The same chain, stated in the regime the amplifier actually holds in.

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
      "obj": "def-local-hamiltonian",
      "qdim": "poly"
    }
  ],
  "profile": "rk-corpus.v1",
  "regime": [
    {
      "norm": "relative",
      "qdim": "poly",
      "qdim_cap": "const"
    }
  ],
  "schema_version": "1"
}
```
