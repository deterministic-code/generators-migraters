import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { settingsList, settingsStr } from "./settings.ts";

const CONTAINER_SQL_ROOT = "/app/sql";

export const backendLaneDir = ({
  combined,
  multiLanguage,
  language,
}: {
  combined: boolean;
  multiLanguage: boolean;
  language: string;
}): string => {
  const parts: string[] = [];
  if (combined) parts.push("backend");
  if (multiLanguage) parts.push(language);
  return parts.length > 0 ? `${parts.join("/")}/` : "";
};

export const migrateLayout = (
  settings: GenerateContext["settings"],
  language: string,
) => {
  const langs = settingsList(settings, "backend.languages");
  const multiLanguage = langs.length > 1;
  const combined = settingsStr(settings, "application_tier") === "full-stack";
  return {
    combined,
    multiLanguage,
    migrationsPath: (dialect: string) =>
      `${multiLanguage ? "../sql" : "sql"}/${dialect}/migrations`,
    containerSqlRoot: () => CONTAINER_SQL_ROOT,
    containerMigrationsDir: (dialect: string) =>
      `${CONTAINER_SQL_ROOT}/${dialect}/migrations`,
    dockerPrefixes: () => ({
      lane: backendLaneDir({ combined, multiLanguage, language }),
      shared: backendLaneDir({ combined, multiLanguage: false, language }),
    }),
  };
};

export const resolveDatasourceDialects = (
  settings: GenerateContext["settings"],
): string[] => {
  const datasources = settingsList(settings, "backend.datasources");
  return datasources.length > 0 ? datasources : ["sqlite"];
};

export const migrateInitFlags = (dialects: string[]): string =>
  dialects.map((dialect) => `--dialect ${dialect}`).join(" ");

export const setCargoDefaultFeatures = (
  cargoToml: string,
  dialects: string[],
): string => {
  const features = dialects.map((dialect) => `"${dialect}"`).join(", ");
  const replacement = `default = [${features}]`;
  const lines = cargoToml.split("\n");
  let replaced = false;
  const out = lines.map((line) => {
    if (replaced || !line.trimStart().startsWith("default = [")) return line;
    replaced = true;
    const indent = line.slice(0, line.length - line.trimStart().length);
    return `${indent}${replacement}`;
  });
  if (!replaced) {
    throw new Error("Cargo.toml is missing a features default = [...] line");
  }
  return out.join("\n");
};

export const libraryReferenceMode = (
  settings: GenerateContext["settings"],
  language: string,
): string => {
  const mode = settingsStr(
    settings,
    `languages.${language}.library_reference_mode`,
  );
  return mode === undefined || mode === "" ? "npm" : mode;
};

export type MigrateMode = "bundled" | "reference";

export const migrateMode = (
  settings: GenerateContext["settings"],
  language: string,
): MigrateMode => {
  const raw =
    settingsStr(settings, `languages.${language}.migrate_mode`) ??
    settingsStr(settings, "migrate_mode") ??
    (language === "typescript" ? "reference" : "bundled");
  const normalized = raw.trim().toLowerCase();
  if (normalized === "bundled") return "bundled";
  if (normalized === "reference") return "reference";
  throw new Error(
    `migrate_mode must be Bundled or Reference, got ${JSON.stringify(raw)}`,
  );
};
