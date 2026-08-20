---
id: thm-loose
kind: theorem
status: stated
af: none
contract: A theorem whose ambient only caps the qudit dimension at polylog.
deps: lem-const-dim
---

A theorem whose ambient only caps the qudit dimension at polylog.

```signature
{
  "post": [],
  "pre": [
    {
      "gap": "inv-log",
      "obj": "def-promise-gap"
    }
  ],
  "profile": "rk-corpus.v1",
  "regime": [
    {
      "qdim_cap": "polylog"
    }
  ],
  "schema_version": "1"
}
```
