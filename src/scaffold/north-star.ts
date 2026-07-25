// PURITY: pure — no fs/network/clock (L3). The one place the seeded north-star shard's identity is
// written down. `rk init` receives the north-star CONTRACT (a string) as its argument, but PRD C2's
// continuously-checked critical-path provenance guarantee is keyed on `.rk/config.json`'s
// `northStarId` — a REGISTRY ID. Before this module the two never met: rk stamped the contract into
// three prose documents and left `northStarId` unset, so the guarantee ran against an empty path in
// every repo rk created and reported itself satisfied (generality audit 2026-07-25, finding M3).
//
// The ordering problem ("the id names a registry shard, and at stamp time no shard exists") is
// resolved by dissolving it: `rk init` stamps the shard too. The north star is the one registry
// result that IS knowable on day one — its contract was literally passed on the command line — so
// seeding it costs nothing, makes the id bindable immediately, and gives the linker, `rk graph
// --critical-path`, `rk graph --blocks` and the render dashboard a real root from minute one.
//
// Three places must agree about this id, and a test asserts each pairing rather than trusting the
// convention: (1) `templates/manifest.json`'s stamped path (`argument/<id>.md` — Gate 2 requires
// `id` to equal the filename stem), (2) the `{{RK_SLOT_NORTH_STAR_ID}}` value `src/cli/init.ts`
// substitutes into `templates/argument/north-star.md.tmpl`'s `id:` line, and (3)
// `src/scaffold/config-stub.ts`'s `northStarId`.
//
// Deliberately a CONSTANT, not a `--north-star-id` flag: a fixed, self-describing id needs no
// renaming as the campaign's framing evolves, keeps the manifest path a literal (manifest paths are
// not slot-substituted), and leaves exactly one rename procedure to document. The user renaming it
// later is fully supported and fails LOUD if done halfway — a `northStarId` that resolves to no
// registry node is a hard ERROR in `src/gates/linker-crossvendor.ts`, never a silent pass.

/** The registry id of the shard `rk init` seeds for the campaign's north-star contract. */
export const NORTH_STAR_SHARD_ID = "thm-north-star";

/** Repo-relative path of that shard. `basename(path, ".md") === NORTH_STAR_SHARD_ID` is Gate 2's
 * id-equals-stem rule, asserted in test/templates/templates.test.ts. */
export const NORTH_STAR_SHARD_PATH = `argument/${NORTH_STAR_SHARD_ID}.md`;
