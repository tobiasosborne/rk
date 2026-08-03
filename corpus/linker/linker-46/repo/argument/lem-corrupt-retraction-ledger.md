---
id: lem-corrupt-retraction-ledger
kind: lemma
status: proved-mod-audit
af: none
contract: A promoted shard whose retraction ledger cannot be read at all.
---

The fail-closed half of Check 16 (gates-F14). `.rk/retractions.jsonl` carries a TRUNCATED second
line: its own `itemId` is unknowable, so no item in this repo can be confirmed un-retracted. The
store is poisoned as a whole, not partially trusted — one ERROR per problem attributed to the
ledger, and every already-promoted `proved-mod-audit` shard loses its confirmation even though
its L5 verdict is a fresh `VALID` bound to these exact bytes.

Reading "nothing retracted" off an unreadable ledger is the false-validity direction; that is why
a corrupt line yields ZERO live retractions AND a loud ERROR, never a quietly-degraded answer.
