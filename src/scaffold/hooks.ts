// PURITY: pure — no fs/network/clock (L3). M1.2 (`rk init`): builds the two hook artifacts this
// WP stamps — `.claude/settings.json` (Claude Code session hooks) and the git `pre-commit` hook
// script — as pure data/strings; `src/cli/init.ts` is the edge that writes them (and chmods the
// shell script executable). PRD C1: "Installs hooks: SessionStart (`bd prime`, `fr board`),
// UserPromptSubmit (`fr turn-begin` + board), Stop (`fr check`), PreCompact (`bd prime`), pre-
// commit (`rk check`)."

interface HookEntry {
  type: "command";
  command: string;
}
interface HookGroup {
  matcher: string;
  hooks: HookEntry[];
}
export interface ClaudeSettings {
  hooks: {
    SessionStart: HookGroup[];
    UserPromptSubmit: HookGroup[];
    Stop: HookGroup[];
    PreCompact: HookGroup[];
  };
}

function cmd(command: string): HookEntry {
  return { type: "command", command };
}
function group(...commands: string[]): HookGroup[] {
  return [{ matcher: "", hooks: commands.map(cmd) }];
}

/** The stamped repo's `.claude/settings.json` — same `{matcher, hooks: [{type, command}]}` shape
 * rk's own `.claude/settings.json` uses (SessionStart/PreCompact today), extended with the two
 * PRD C1 names this WP's brief adds. */
export function buildClaudeSettings(): ClaudeSettings {
  return {
    hooks: {
      SessionStart: group("bd prime", "fr board"),
      UserPromptSubmit: group("fr turn-begin", "fr board"),
      Stop: group("fr check"),
      PreCompact: group("bd prime"),
    },
  };
}

/** The git `pre-commit` hook script content: runs `rk check` and propagates its exit code, so a
 * failing gate blocks the commit (CLAUDE.md Rule 5: "pre-commit hook once gates exist"). */
export function buildPreCommitHookScript(): string {
  return (
    "#!/bin/sh\n" +
    "# Installed by `rk init` (M1.2, PRD C1). Runs the single local gate before every commit.\n" +
    "exec rk check\n"
  );
}
