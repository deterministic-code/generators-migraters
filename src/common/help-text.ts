import { fill } from "@deterministic-code/generators-common/fill";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  migrateCommand,
  usageLine,
  type MigrateVerb,
} from "./cli-contract.ts";
import { PACK_ROOT } from "./pack-root.ts";

const HELP_ROOT = join(PACK_ROOT, "templates", "help");

export const loadHelpText = async (verb: MigrateVerb): Promise<string> => {
  const text = await readFile(join(HELP_ROOT, `${verb}.txt`), "utf8");
  return fill(text.replace(/\n$/, ""), {
    command: migrateCommand(verb),
    usage: usageLine(verb),
  });
};
