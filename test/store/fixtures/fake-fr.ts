// Test-only fixture: stands in for the real `fr` binary in test/store/fr-load.test.ts. Invoked
// exactly like the real thing (from a chosen cwd): `bun run fake-fr.ts export`. Reads
// `<cwd>/fake-fr-exit-code` (if present, exits with that code, printing nothing to stdout — the
// real `fr export`'s own absence contract) else cats `<cwd>/fake-fr-response.json` to stdout.
const exitFile = Bun.file("fake-fr-exit-code");
if (await exitFile.exists()) {
  process.exit(Number((await exitFile.text()).trim()));
}
console.log(await Bun.file("fake-fr-response.json").text());
