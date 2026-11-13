import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPages } from "../scripts/lib/convert.mjs";
import { mergeCatalogues, parseTopicFile, readFolderTopics, topicFolders } from "../scripts/lib/topics.mjs";

const topicFile = ({ id, locale = "en", audience = "plugin-dev", kind = "how-to", context = "[]", body = "Body." }) =>
  ["---", `id: ${id}`, `title: "Title ${id} ${locale}"`, `summary: "Summary."`, `kind: ${kind}`, `audience: ${audience}`, `locale: ${locale}`, `context: ${context}`, "uses: []", "generated: false", "---", body, ""].join("\n");

function fixtureRepos() {
  const tmp = mkdtempSync(join(tmpdir(), "scflow-topics-"));
  const put = (path, text) => {
    const file = join(tmp, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, text);
  };
  put("scflow-framework/docs/topics/en/framework-a.md", topicFile({ id: "framework/a", body: "See [[framework/b]] and [[scflow-plugin/graph]]." }));
  put("scflow-framework/docs/topics/fr/framework-a.md", topicFile({ id: "framework/a", locale: "fr" }));
  put("scflow-framework/docs/topics/en/framework-b.md", topicFile({ id: "framework/b" }));
  // a synced copy of the framework topics in another repo is not a source
  put("scflow-plugins/docs/topics/en/framework-a.md", topicFile({ id: "framework/a" }));
  put("scflow-plugins/plugins/scflow/resources/docs/en/graph.md", topicFile({ id: "scflow-plugin/graph", audience: "user", context: '["scflow.graph"]' }));
  put("scflow-plugins/plugins/scflow/resources/docs/fr/graph.md", topicFile({ id: "scflow-plugin/graph", audience: "user", locale: "fr", context: '["scflow.graph"]' }));
  return { "scflow-framework": join(tmp, "scflow-framework"), "scflow-plugins": join(tmp, "scflow-plugins"), tmp };
}

test("the framework's docs/topics and the plugins' resources/docs are the folder sources", () => {
  const { tmp, ...repos } = fixtureRepos();
  assert.deepEqual(topicFolders(repos["scflow-framework"], "scflow-framework").map((f) => f.label), ["scflow-framework:docs/topics"]);
  assert.deepEqual(topicFolders(repos["scflow-plugins"], "scflow-plugins").map((f) => f.label), ["scflow-plugins:plugins/scflow/resources/docs"]);
  const { entries, problems } = readFolderTopics(repos);
  assert.deepEqual(problems, []);
  assert.deepEqual(entries.map((e) => `${e.topic.id}/${e.topic.locale}`).sort(), ["framework/a/en", "framework/a/fr", "framework/b/en", "scflow-plugin/graph/en", "scflow-plugin/graph/fr"]);
});

test("a topic file is read with the front matter rules of @scfloworg/docs", () => {
  const { topic, body } = parseTopicFile(topicFile({ id: "x/y", context: '["a.b", "c"]' }), "f");
  assert.deepEqual(topic.context, ["a.b", "c"]);
  assert.equal(body.trim(), "Body.");
  assert.throws(() => parseTopicFile("no front matter", "f"), /no front matter/);
  assert.throws(() => parseTopicFile(topicFile({ id: "nonamespace" }), "f"), /"id" must be/);
  assert.throws(() => parseTopicFile(topicFile({ id: "x/y", kind: "essay" }), "f"), /"kind" must be one of/);
});

test("a wrong file or locale folder is a problem, not a silent skip", () => {
  const { tmp, ...repos } = fixtureRepos();
  mkdirSync(join(tmp, "scflow-framework/docs/topics/de"), { recursive: true });
  writeFileSync(join(tmp, "scflow-framework/docs/topics/de/framework-x.md"), topicFile({ id: "framework/x", locale: "en" }));
  writeFileSync(join(tmp, "scflow-framework/docs/topics/en/framework-bad.md"), "oops");
  const { problems } = readFolderTopics(repos);
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => p.includes("is not the folder's")));
  assert.ok(problems.some((p) => p.includes("no front matter")));
});

test("merge: the module catalogue keeps a duplicate id, a shared help key is reported", () => {
  const { tmp, ...repos } = fixtureRepos();
  const manifest = {
    version: 1,
    topics: [
      { id: "framework/b", title: "From a module", summary: "s", kind: "how-to", audience: "plugin-dev", locale: "en", context: ["scflow.graph"], uses: [], generated: false },
    ],
  };
  const merged = mergeCatalogues({ manifest, readBody: () => "module body" }, readFolderTopics(repos));
  assert.equal(merged.readBody("framework/b", "en"), "module body");
  assert.equal(merged.readBody("framework/a", "en").trim(), "See [[framework/b]] and [[scflow-plugin/graph]].");
  assert.ok(merged.problems.some((p) => p.startsWith("framework/b (en): duplicate")));
  assert.ok(merged.problems.some((p) => p.startsWith("help key scflow.graph: ambiguous")));
});

test("merged topics become pages in their audience, with cross-source links and the French fallback", () => {
  const { tmp, ...repos } = fixtureRepos();
  const merged = mergeCatalogues({ manifest: { version: 1, topics: [] }, readBody: () => "" }, readFolderTopics(repos));
  assert.deepEqual(merged.problems, []);
  const result = buildPages(merged);
  assert.deepEqual(result.problems, []);
  const en = result.pages.find((p) => p.path === "en/plugin-dev/how-to/framework/a.md").content;
  assert.match(en, /\(\/en\/plugin-dev\/how-to\/framework\/b\/\)/);
  assert.match(en, /\(\/en\/user\/how-to\/scflow-plugin\/graph\/\)/);
  const frB = result.pages.find((p) => p.path === "fr/plugin-dev/how-to/framework/b.md").content;
  assert.match(frB, /^fallback: "en"$/m);
  assert.ok(result.pages.find((p) => p.path === "fr/user/how-to/scflow-plugin/graph.md"));
});
