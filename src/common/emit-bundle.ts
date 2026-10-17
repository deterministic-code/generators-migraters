import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  BUNDLE_FILES_DIR,
  BUNDLE_MANIFEST_PATH,
  pathsForLanguage,
  readManifestFile,
} from "./fetch-bundle.ts";
import type { BundleManifest } from "./manifest.ts";
import { languageSpec } from "./manifest.ts";
import { PACK_ROOT } from "./pack-root.ts";

const siblingMigratersDirs = [
  join(PACK_ROOT, "..", "migraters"),
  join(PACK_ROOT, "..", "..", "migraters"),
  join(PACK_ROOT, "..", "..", "..", "migraters"),
];

const readable = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const siblingMigratersRoot = async (): Promise<string | undefined> => {
  for (const dir of siblingMigratersDirs) {
    if (await readable(join(dir, "bundle.yaml"))) return dir;
  }
  return undefined;
};

export const loadManifest = async (): Promise<BundleManifest> => {
  const sibling = await siblingMigratersRoot();
  const paths = [
    BUNDLE_MANIFEST_PATH,
    ...(sibling === undefined ? [] : [join(sibling, "bundle.yaml")]),
  ];
  for (const path of paths) {
    if (await readable(path)) return readManifestFile(path);
  }
  throw new Error(
    "migrate bundle manifest not found — run `npm run fetch-bundle -- --from <migraters>`",
  );
};

export const bundleSourceRoot = async (): Promise<string> => {
  if (await readable(join(BUNDLE_FILES_DIR, "cli.yaml"))) return BUNDLE_FILES_DIR;
  const sibling = await siblingMigratersRoot();
  if (sibling !== undefined) return sibling;
  throw new Error(
    "migrate bundle files not found — run `npm run fetch-bundle -- --from <migraters>`",
  );
};

export const bundledEntries = async (
  language: string,
  dialects: string[],
): Promise<GenerateEntry[]> => {
  const manifest = await loadManifest();
  const spec = languageSpec(manifest, language);
  const root = await bundleSourceRoot();
  const rels = await pathsForLanguage(root, spec, dialects);
  return Promise.all(
    rels.map(async (rel) =>
      content(`${spec.root}/${rel}`, await readFile(join(root, rel), "utf8")),
    ),
  );
};
