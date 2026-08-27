import { describe, expect, it } from "vitest";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { generate } from "../typescript/generate.ts";

const mockCtx = (settings: Record<string, string> = {}): GenerateContext => ({
  reader: memoryReader({}),
  settings: {
    "backend.datasources": "sqlite",
    "backend.languages": "typescript",
    ...settings,
  },
});

describe("typescript migrate patches target the cased app file", () => {
  it("defaults to app.ts", async () => {
    const entries = await generate(mockCtx());
    const hooks = entries.filter(
      (entry) =>
        entry.kind === "patch" &&
        (entry.section === "APP_DB_IMPORTS" ||
          entry.section === "APP_BEFORE_HOOK"),
    );
    expect(hooks).toHaveLength(2);
    expect(hooks.map((entry) => entry.filename)).toEqual(["app.ts", "app.ts"]);
    expect(
      hooks.every(
        (entry) =>
          entry.kind === "patch" && entry.appendIfNotExists === "None",
      ),
    ).toBe(true);
  });

  it("uses App.ts when typescript file_names is pascal", async () => {
    const entries = await generate(
      mockCtx({ "languages.typescript.casing.file_names": "pascal" }),
    );
    const hooks = entries.filter(
      (entry) =>
        entry.kind === "patch" &&
        (entry.section === "APP_DB_IMPORTS" ||
          entry.section === "APP_BEFORE_HOOK"),
    );
    expect(hooks.map((entry) => entry.filename)).toEqual(["App.ts", "App.ts"]);
    expect(hooks.some((entry) => entry.filename === "app.ts")).toBe(false);
    expect(
      hooks.every(
        (entry) =>
          entry.kind === "patch" && entry.appendIfNotExists === "None",
      ),
    ).toBe(true);
  });
});
