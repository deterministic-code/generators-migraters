import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HELP_FLAGS,
  MIGRATE_VERBS,
  migrateCommand,
  usageLine,
} from "../src/common/cli-contract.ts";
import { fill } from "@deterministic-code/generators-common/fill";
import { loadHelpText } from "../src/common/help-text.ts";
import { PACK_ROOT } from "../src/common/pack-root.ts";

const HELP_ROOT = join(PACK_ROOT, "templates", "help");

describe("unified help templates", () => {
  it("has exactly one template file per verb and no language subdirectories", async () => {
    const names = await readdir(HELP_ROOT);
    expect(names.sort()).toEqual(["create.txt", "down.txt", "setup.txt", "up.txt"]);
  });

  it("uses {{command}} instead of a hardcoded binary or subcommand name", async () => {
    for (const verb of MIGRATE_VERBS) {
      const raw = await readFile(join(HELP_ROOT, `${verb}.txt`), "utf8");
      expect(raw).toContain("{{command}}");
      expect(raw).not.toMatch(/^Usage: (create|up|down|setup) /m);
      expect(raw).not.toContain("Usage: migrate-");
    }
  });

  it("fills to the same Usage line for every language when the command token is migrate-<verb>", async () => {
    for (const verb of MIGRATE_VERBS) {
      const raw = await readFile(join(HELP_ROOT, `${verb}.txt`), "utf8");
      const filled = fill(raw, {
        command: migrateCommand(verb),
        usage: usageLine(verb),
      });
      expect(filled.split("\n")[0]).toBe(usageLine(verb));
      expect(await loadHelpText(verb)).toBe(filled.replace(/\n$/, ""));
    }
  });

  it("documents the shared flag set for each verb", async () => {
    for (const verb of MIGRATE_VERBS) {
      const filled = await loadHelpText(verb);
      for (const flag of HELP_FLAGS[verb]) {
        expect(filled).toContain(flag);
      }
    }
  });

  it("does not mention a language-specific caller in examples", async () => {
    for (const verb of MIGRATE_VERBS) {
      const filled = await loadHelpText(verb);
      expect(filled).not.toMatch(/typescript only/i);
      expect(filled).not.toMatch(/dotnet run --project/);
      expect(filled).not.toMatch(/cargo run --release --bin/);
      expect(filled).not.toMatch(/^Usage: (create|up|down|setup) /m);
      expect(filled).not.toMatch(/^\s+(create|up|down|setup) --provider/m);
    }
  });
});
