<!-- ROLE: death certificates. UPDATE POLICY: append-only; an entry is never deleted, only
     superseded by a later entry that cites it. TRIGGER: read BEFORE dispatching any attack on a
     claim; a route listed here is not re-walked without new evidence named in the brief. -->

# DEAD ROUTES

Format per entry:

## DR-NN — <route, one line> (date)
**Target.** claim id.
**The wall.** The precise obstruction, with `key:line` evidence where a source is involved.
**What was tried.** One line per attempt (wave, worker family).
**What would revive it.** A concrete new fact; otherwise "nothing known".
