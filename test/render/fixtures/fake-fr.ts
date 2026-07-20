// Test-only fixture for test/render/fr-edge.test.ts: stands in for the real `fr` binary. Own copy
// (not test/store/fixtures/fake-fr.ts — that fixture belongs to a different lane's test scope this
// session; same behavior, kept local so this lane's tests never depend on files outside its scope).
// Invoked exactly like the real thing (from a chosen cwd): `bun run fake-fr.ts export`. Reads
// `<cwd>/fake-fr-exit-code` (if present, exits with that code, printing nothing to stdout — the
// real `fr export`'s own loud-absence contract, export-v1.md) else cats `<cwd>/fake-fr-response.json`
// (or `fake-fr-response.txt` for a deliberately-unparseable-stdout case) to stdout verbatim.
const exitFile = Bun.file("fake-fr-exit-code");
if (await exitFile.exists()) {
  process.exit(Number((await exitFile.text()).trim()));
}
const rawFile = Bun.file("fake-fr-response.txt");
if (await rawFile.exists()) {
  console.log(await rawFile.text());
  process.exit(0);
}
console.log(await Bun.file("fake-fr-response.json").text());
