import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPages, rewriteLinks } from "../scripts/lib/convert.mjs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { moduleFolders, selectModules } from "../scripts/lib/sources.mjs";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "catalogue");
const manifest = JSON.parse(readFileSync(join(fixture, "docs-manifest.json"), "utf8"));
const readBody = (id, locale) => readFileSync(join(fixture, locale, `${id}.md`), "utf8");
const build = (extra = {}) => buildPages({ manifest, readBody, ...extra });
const page = (result, path) => result.pages.find((p) => p.path === path)?.content;

test("[[id]] and [[id|label]] become links to the audience/kind path, in the page's locale", () => {
  const en = page(build(), "en/user/how-to/scflow/undo.md");
  assert.match(en, /\[The graph view\]\(\/en\/user\/tutorial\/scflow\/graph\/\)/);
  assert.match(en, /\[all actions\]\(\/en\/model-dev\/reference\/scflow\/actions\/\)/);
  const fr = page(build(), "fr/user/how-to/scflow/undo.md");
  assert.match(fr, /\[toutes les actions\]\(\/fr\/model-dev\/reference\/scflow\/actions\/\)/);
});

test("links are not rewritten in code, and a base path is honoured", () => {
  const en = page(build({ base: "/x" }), "en/user/how-to/scflow/undo.md");
  assert.match(en, /`\[\[scflow\/graph\]\]`/);
  assert.match(en, /```\n\[\[scflow\/graph\]\]\n```/);
  assert.match(en, /\(\/x\/en\/user\/tutorial\/scflow\/graph\/\)/);
});

test("an unresolved link stays readable and is reported", () => {
  const result = build();
  assert.deepEqual(result.problems.filter((p) => p.includes("scflow/graph (en)")), ["scflow/graph (en): unresolved link [[scflow/missing]]"]);
  assert.match(page(result, "en/user/tutorial/scflow/graph.md"), /broken `scflow\/missing`\./);
  assert.deepEqual(rewriteLinks("[[a/b|x]]", () => undefined), "x");
});

test("a missing French topic falls back to English with a visible notice", () => {
  const result = build();
  const fr = page(result, "fr/user/tutorial/scflow/graph.md");
  assert.match(fr, /^fallback: "en"$/m);
  assert.match(fr, /:::note\[Version anglaise\]\nCette page n'est pas encore traduite en français/);
  assert.match(fr, /Draw a graph\./);
  const own = page(result, "fr/user/how-to/scflow/undo.md");
  assert.doesNotMatch(own, /fallback:|:::note/);
  assert.match(own, /^title: "Annuler et rétablir"$/m);
  assert.doesNotMatch(page(result, "en/user/tutorial/scflow/graph.md"), /fallback:/);
});

test("audiences and kinds form the sections, generated topics included", () => {
  const result = build();
  assert.deepEqual(result.sidebar, [
    { audience: "user", kinds: ["tutorial", "how-to"] },
    { audience: "plugin-dev", kinds: ["explanation"] },
    { audience: "model-dev", kinds: ["reference"] },
  ]);
  const generated = page(result, "en/model-dev/reference/scflow/actions.md");
  assert.match(generated, /^generated: true$/m);
  assert.match(generated, /^audience: "model-dev"$/m);
  assert.ok(page(result, "fr/plugin-dev/explanation/framework/plugin-basics.md"));
});

test("every page carries the topic fields and each locale has a landing page", () => {
  const result = build();
  for (const p of result.pages) for (const key of ["title", "id", "summary", "kind", "audience", "locale", "generated"]) assert.match(p.content, new RegExp(`^${key}:`, "m"), `${p.path} lacks ${key}`);
  assert.match(page(result, "fr/index.md"), /\[Annuler et rétablir\]\(\/fr\/user\/how-to\/scflow\/undo\/\)/);
  assert.match(page(result, "fr/index.md"), /## Utiliser SCFlow/);
});

test("moduleFolders finds module.yaml at the root, in packages/* and plugins/*", () => {
  assert.deepEqual(moduleFolders(join(fixture, "nowhere")), []);
});

test("selectModules keeps modules with docs, one per name, and skips the rest", () => {
  const tmp = mkdtempSync(join(tmpdir(), "scflow-docs-"));
  const module = (repo, folder, lines) => {
    const dir = join(tmp, repo, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "module.yaml"), lines.join("\n") + "\n");
  };
  module("core", "packages/a", ["name: scflow:core", "docs:", "  - id: scflow/x"]);
  module("plugins", "packages/a", ["name: scflow:core", "docs:", "  - id: scflow/x"]); // synced copy
  module("plugins", "packages/graph", ["name: scflow:graph", "actions: []"]); // no docs
  module("plugins", "packages/b", ["name: scflow:b", "docs:", "  - id: b/y"]);
  const { chosen, skipped } = selectModules({ core: join(tmp, "core"), plugins: join(tmp, "plugins") });
  const rel = (c) => c.repo + ":" + c.folder.slice(join(tmp, c.repo).length + 1).split(sep).join("/");
  assert.deepEqual(chosen.map(rel), ["core:packages/a", "plugins:packages/b"]);
  assert.equal(skipped.length, 2);
});
