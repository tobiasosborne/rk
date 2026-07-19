// Test-only fixture: stands in for the real `af` binary in test/store/af-load.test.ts, so the
// primary-path (subprocess + JSON parse) branch of src/store/af-load.ts is exercised without
// depending on a real `af` binary being on PATH. Invoked exactly like the real thing:
// `bun run fake-af.ts export --graph json --dir <workspace>`. Reads `<workspace>/fake-af-
// exit-code` (if present, exits with that code and prints `<workspace>/fake-af-stderr` to
// stderr) else cats `<workspace>/fake-af-response.json` to stdout.
const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const dir = dirIdx >= 0 ? args[dirIdx + 1]! : ".";

const exitFile = Bun.file(`${dir}/fake-af-exit-code`);
if (await exitFile.exists()) {
  const code = Number((await exitFile.text()).trim());
  const stderrFile = Bun.file(`${dir}/fake-af-stderr`);
  if (await stderrFile.exists()) console.error((await stderrFile.text()).trim());
  process.exit(code);
}

console.log(await Bun.file(`${dir}/fake-af-response.json`).text());
