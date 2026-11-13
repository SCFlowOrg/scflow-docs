#!/usr/bin/env node
// Generates the Starlight content of the site from the three source repositories.
//
//   node scripts/generate.mjs [--from <dir>] [--strict]
//
// SCFLOW_PARENT  parent folder of scflow-core, scflow-framework, scflow-plugins (default: parent of this repo)
// SCFLOW_CLI     command used instead of the built CLI of scflow-core (e.g. "scflow")
// DOCS_BASE      base path of the site (default: none)
// --from <dir>   use an existing `scflow docs build` output instead of running it
// --strict       fail on an unresolved [[id]] link
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPages } from "./lib/convert.mjs";
import { mergeCatalogues, readFolderTopics } from "./lib/topics.mjs";
import { locateRepos, runScflowDocs, stageModules } from "./lib/sources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

let repos;
let catalogue = option("--from");
if (catalogue) catalogue = resolve(catalogue);
else {
  const parent = resolve(process.env.SCFLOW_PARENT ?? join(root, ".."));
  repos = locateRepos(parent);
  const staging = join(root, ".work", "modules");
  catalogue = join(root, ".work", "catalogue");
  const { staged, skipped } = stageModules(repos, staging);
  console.log(`staged ${staged.length} module(s) from ${parent}`);
  for (const line of skipped) console.log(`  not staged: ${line}`);
  if (staged.length === 0) throw new Error("no module with docs found in the source repositories");
  runScflowDocs({ core: repos["scflow-core"], staging, out: catalogue });
}

let source = {
  manifest: JSON.parse(readFileSync(join(catalogue, "docs-manifest.json"), "utf8")),
  readBody: (id, locale) => readFileSync(join(catalogue, locale, `${id}.md`), "utf8"),
};
let sourceProblems = [];
if (repos) {
  // `scflow docs` reads modules only: the plain folders of topics are read here (see lib/topics.mjs).
  const folder = readFolderTopics(repos);
  console.log(`folder topics: ${folder.entries.length} file(s)`);
  const merged = mergeCatalogues(source, folder);
  source = merged;
  sourceProblems = merged.problems;
}
const { manifest, readBody } = source;
const { pages, sidebar, problems } = buildPages({ manifest, readBody, base: (process.env.DOCS_BASE ?? "").replace(/\/$/, "") });

const out = join(root, "src", "content", "docs");
rmSync(out, { recursive: true, force: true });
for (const page of pages) {
  const file = join(out, page.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page.content);
}
mkdirSync(join(root, "src", "generated"), { recursive: true });
writeFileSync(join(root, "src", "generated", "sidebar.json"), `${JSON.stringify(sidebar, null, 2)}\n`);

for (const problem of sourceProblems) console.error(`error: ${problem}`);
if (sourceProblems.length > 0) process.exit(1);
for (const problem of problems) console.warn(`warning: ${problem}`);
const counts = {};
for (const t of manifest.topics) counts[`${t.audience}/${t.locale}`] = (counts[`${t.audience}/${t.locale}`] ?? 0) + 1;
console.log(`topics by audience/locale: ${JSON.stringify(counts)}`);
console.log(`wrote ${pages.length} page(s) for ${manifest.topics.length} topic entries`);
if (flag("--strict") && problems.length > 0) process.exit(1);
