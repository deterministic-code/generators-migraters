import { describe, expect, it, vi } from "vitest";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate as generateCsharp } from "../csharp/generate.ts";
import { generate as generateRust } from "../rust/generate.ts";
import { generate as generateTypescript } from "../typescript/generate.ts";
import {
  HELP_FLAGS,
  migrateCommand,
  type MigrateVerb,
} from "../src/common/cli-contract.ts";

const mockCtx = (settings: Record<string, string> = {}): GenerateContext => ({
  reader: memoryReader({}),
  settings: {
    "backend.datasources": "sqlite,postgres",
    "backend.languages": "typescript",
    ...settings,
  },
});

const contentsByName = (entries: GenerateEntry[]): Map<string, string> => {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e.kind === "content") out.set(e.filename, e.contents);
  }
  return out;
};

const hasSuffix = (files: Map<string, string>, suffix: string): boolean =>
  [...files.keys()].some((name) => name.endsWith(suffix));

describe("generate lanes emit the same CLI help", () => {
  it("does not read the mocked deterministic reader (help is pack templates only)", async () => {
    const read = vi.fn(async (name: string) => {
      throw new Error(`reader should not be consulted for ${name}`);
    });
    const exists = vi.fn(async () => false);
    const ctx: GenerateContext = {
      reader: { read, exists },
      settings: { "backend.datasources": "sqlite", "backend.languages": "rust" },
    };
    await generateRust(ctx);
    await generateCsharp(ctx);
    await generateTypescript(ctx);
    expect(read).not.toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalled();
  });

  it("bundles rust bins, csharp commands, and shared help templates", async () => {
    const ctx = mockCtx({ "backend.languages": "rust,csharp" });
    const [rustEntries, csEntries] = await Promise.all([
      generateRust(ctx),
      generateCsharp(ctx),
    ]);
    const rust = contentsByName(rustEntries);
    const cs = contentsByName(csEntries);
    const verbs: MigrateVerb[] = ["setup", "up", "down", "create"];
    for (const verb of verbs) {
      expect(hasSuffix(rust, `migrate_${verb}.rs`)).toBe(true);
      expect(hasSuffix(cs, `Migrate${verb[0]!.toUpperCase()}${verb.slice(1)}.cs`)).toBe(
        true,
      );
      expect(hasSuffix(rust, `help/${verb}.txt`)).toBe(true);
      expect(hasSuffix(cs, `help/${verb}.txt`)).toBe(true);
      expect(migrateCommand(verb)).toBe(`migrate-${verb}`);
      for (const flag of HELP_FLAGS[verb]) {
        expect(flag.startsWith("--")).toBe(true);
      }
    }
  });

  it("wires typescript npm scripts and rust bins to migrate-<verb>", async () => {
    const ctx = mockCtx();
    const [tsEntries, rustEntries] = await Promise.all([
      generateTypescript(ctx),
      generateRust(ctx),
    ]);
    const pkg = tsEntries.find(
      (e) => e.kind === "patch" && e.filename === "package.json",
    );
    if (!pkg || pkg.kind !== "patch") throw new Error("package.json patch missing");
    const merge = JSON.parse(pkg.content) as {
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
      allowScripts?: Record<string, boolean>;
      overrides?: Record<string, string>;
    };
    expect(merge.scripts["migrate:setup"]).toContain(
      "migrate-setup --provider",
    );
    expect(merge.scripts.migrate).toContain("migrate-up --provider");
    expect(merge.scripts["migrate:down"]).toContain("migrate-down --provider");
    expect(merge.scripts["migrate:build"]).toBe(
      "migrate-init --dialect sqlite --dialect postgres",
    );
    expect(merge.dependencies?.["@deterministic-code/migraters"]).toBe(
      "github:deterministic-code/migraters",
    );
    expect(merge.dependencies?.mysql2).toBeUndefined();
    expect(merge.dependencies?.mssql).toBeUndefined();
    expect(merge.dependencies?.oracledb).toBeUndefined();
    expect(merge.allowScripts?.["better-sqlite3"]).toBe(true);
    expect(merge.allowScripts?.["@deterministic-code/deterministic"]).toBe(true);
    expect(merge.allowScripts?.["github:deterministic-code/migraters"]).toBe(
      true,
    );
    expect(merge.overrides?.["better-sqlite3"]).toBeUndefined();
    expect(merge.overrides?.glob).toBe("^13.0.6");
    expect(
      tsEntries.some(
        (e) =>
          e.kind === "content" &&
          e.filename === "migraters/typescript/package.json",
      ),
    ).toBe(false);
    const rust = contentsByName(rustEntries);
    expect(hasSuffix(rust, "migrate_setup.rs")).toBe(true);
    expect(hasSuffix(rust, "migrate_up.rs")).toBe(true);
    expect(hasSuffix(rust, "migrate_down.rs")).toBe(true);
    expect(hasSuffix(rust, "migrate_create.rs")).toBe(true);
    const cargoToml = rust.get("migraters/rust/Cargo.toml");
    expect(cargoToml).toMatch(/^default = \["sqlite", "postgres"\]$/m);
    expect(cargoToml).not.toMatch(/default = \[[^\]]*(oracle|sqlserver)/);
    expect(hasSuffix(rust, "dialects/oracle.rs")).toBe(true);
    const rustCopy = rustEntries.find(
      (e) =>
        e.kind === "patch" &&
        e.filename === "Dockerfile" &&
        e.section === "MIGRATE_COPY",
    );
    if (!rustCopy || rustCopy.kind !== "patch") {
      throw new Error("rust MIGRATE_COPY patch missing");
    }
    expect(rustCopy.content).toContain(
      "RUN cargo run --manifest-path migraters/rust/init/Cargo.toml -- --dialect sqlite --dialect postgres",
    );
    expect(rustCopy.content.indexOf("cargo run --manifest-path migraters/rust/init")).toBeLessThan(
      rustCopy.content.indexOf("RUN cargo build --release --manifest-path migraters/rust/Cargo.toml"),
    );
  });

  it("keeps entrypoint invocations on the unified binary names", async () => {
    const ctx = mockCtx({ "backend.languages": "typescript,rust,csharp" });
    const [ts, rust, cs] = await Promise.all([
      generateTypescript(ctx),
      generateRust(ctx),
      generateCsharp(ctx),
    ]);
    const hook = (entries: GenerateEntry[]) => {
      const e = entries.find(
        (x) =>
          x.kind === "patch" &&
          x.filename === "scripts/entrypoint.sh" &&
          x.section === "MIGRATE_HOOK",
      );
      if (!e || e.kind !== "patch") throw new Error("entrypoint hook missing");
      return e.content;
    };
    expect(hook(ts)).toContain("migrate-setup --provider");
    expect(hook(ts)).toContain("migrate-up --provider");
    expect(hook(rust)).toContain("migrate-setup --provider");
    expect(hook(rust)).toContain("migrate-up --provider");
    expect(hook(cs)).toContain(" --provider");
    expect(hook(cs)).toMatch(/MigrateRunner\.dll (setup|up)/);
  });
});
