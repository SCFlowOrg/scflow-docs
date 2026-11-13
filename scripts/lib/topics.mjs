// Topic files that sit in plain folders of the source repositories (no module): the
// framework's `docs/topics/<locale>/*.md` and the plugins' `plugins/*/resources/docs/<locale>/*.md`.
// `scflow docs` only reads installed modules, so these are read here with the same rules as
// `@scfloworg/docs` (front matter subset, topic fields, duplicates, help keys); links are
// checked later, on the merged catalogue, by the conversion.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const TOPIC_KINDS = ["tutorial", "how-to", "reference", "explanation"];
export const AUDIENCES = ["user", "plugin-dev", "model-dev"];
const TOPIC_ID = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
const FRAMEWORK = "scflow-framework";
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

function scalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~" || value === "") return null;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

function stripComment(line) {
  let quote = "";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function flowList(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === "") return [];
  const items = [];
  let current = "";
  let quote = "";
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else current += char;
  }
  items.push(current);
  return items.map(scalar);
}

/** The YAML subset of a topic: `key: value`, `[a, b]`, block lists, `#` comments. Throws on anything else. */
export function parseFrontMatterBlock(block, where) {
  const data = {};
  let list = null;
  for (const [index, original] of block.split("\n").entries()) {
    const line = stripComment(original).trimEnd();
    if (line.trim() === "") continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item) {
      if (!list) throw new Error(`${where}: front matter line ${index + 1} is a list item outside a list`);
      list.push(scalar(item[1]));
      continue;
    }
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(line);
    if (!pair) throw new Error(`${where}: front matter line ${index + 1} is not "key: value"`);
    const [, key, value] = pair;
    list = null;
    if (key in data) throw new Error(`${where}: front matter key "${key}" appears twice`);
    if (value === undefined || value.trim() === "") data[key] = list = [];
    else if (value.trim().startsWith("[")) {
      if (!value.trim().endsWith("]")) throw new Error(`${where}: the list of "${key}" must close on its line`);
      data[key] = flowList(value);
    } else data[key] = scalar(value);
  }
  return data;
}

const strings = (value, field, where) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v === "")) throw new Error(`${where}: "${field}" must be a list of non-empty strings`);
  return [...new Set(value)];
};
const required = (value, field, where) => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${where}: "${field}" is required`);
  return value.trim();
};

/** Reads a topic file: `{ topic, body }`, the topic normalized as `validateTopic` of @scfloworg/docs does. */
export function parseTopicFile(source, where) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${where}: the file has no front matter`);
  const raw = parseFrontMatterBlock(match[1].replace(/\r/g, ""), where);
  if (typeof raw.id !== "string" || !TOPIC_ID.test(raw.id)) throw new Error(`${where}: "id" must be "namespace/name", got ${JSON.stringify(raw.id)}`);
  const here = `${where} "${raw.id}"`;
  if (!TOPIC_KINDS.includes(raw.kind)) throw new Error(`${here}: "kind" must be one of ${TOPIC_KINDS.join(", ")}`);
  if (!AUDIENCES.includes(raw.audience)) throw new Error(`${here}: "audience" must be one of ${AUDIENCES.join(", ")}`);
  const locale = raw.locale === undefined ? "en" : raw.locale;
  if (typeof locale !== "string" || !LOCALE.test(locale)) throw new Error(`${here}: "locale" must be a language tag such as "en" or "fr"`);
  if (raw.generated !== undefined && typeof raw.generated !== "boolean") throw new Error(`${here}: "generated" must be true or false`);
  return {
    topic: {
      id: raw.id,
      title: required(raw.title, "title", here),
      summary: required(raw.summary, "summary", here),
      kind: raw.kind,
      audience: raw.audience,
      locale,
      context: strings(raw.context, "context", here),
      uses: strings(raw.uses, "uses", here),
      generated: raw.generated === true,
    },
    body: match[2],
  };
}

const dirs = (path) => (existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
const mdFiles = (path) => (existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name) : []);

/**
 * The folders of topics of a repo: `{ label, folder }`, each holding `<locale>/*.md`.
 * `docs/topics` is the framework's own: other repos hold synced copies of it, which are not sources.
 */
export function topicFolders(repo, repoName) {
  const found = [];
  if (repoName === FRAMEWORK && existsSync(join(repo, "docs", "topics"))) found.push({ label: `${repoName}:docs/topics`, folder: join(repo, "docs", "topics") });
  for (const plugin of dirs(join(repo, "plugins"))) {
    const folder = join(repo, "plugins", plugin, "resources", "docs");
    if (existsSync(folder)) found.push({ label: `${repoName}:plugins/${plugin}/resources/docs`, folder });
  }
  return found;
}

/**
 * Reads every topic file of the folder sources of the repos.
 * Returns `{ entries: [{ topic, body, origin }], problems }`; a file that fails to parse, or whose
 * locale is not its folder's, is a problem and is left out.
 */
export function readFolderTopics(repos) {
  const entries = [];
  const problems = [];
  for (const [repoName, repo] of Object.entries(repos)) {
    for (const { label, folder } of topicFolders(repo, repoName)) {
      for (const locale of dirs(folder)) {
        for (const name of mdFiles(join(folder, locale))) {
          const where = `${label}/${locale}/${name}`;
          try {
            const { topic, body } = parseTopicFile(readFileSync(join(folder, locale, name), "utf8"), where);
            if (topic.locale !== locale) throw new Error(`${where}: locale "${topic.locale}" is not the folder's "${locale}"`);
            entries.push({ topic, body, origin: where });
          } catch (error) {
            problems.push(error.message);
          }
        }
      }
    }
  }
  return { entries, problems };
}

/**
 * Merges the topics of the module catalogue with the folder topics, with the rules of `catalogue.check()`:
 * the first source keeps an id and locale (a duplicate is a problem), and a help key listed by two ids is a problem.
 * Returns `{ manifest, readBody, problems }`; `readBody(id, locale)` serves both sources.
 */
export function mergeCatalogues({ manifest, readBody }, folder) {
  const problems = [...folder.problems];
  const topics = [...manifest.topics];
  const bodies = new Map();
  const taken = new Set(topics.map((t) => `${t.id}|${t.locale}`));
  for (const { topic, body, origin } of folder.entries) {
    const key = `${topic.id}|${topic.locale}`;
    if (taken.has(key)) {
      problems.push(`${topic.id} (${topic.locale}): duplicate, also given by ${origin}`);
      continue;
    }
    taken.add(key);
    topics.push(topic);
    bodies.set(key, body);
  }
  const owners = new Map();
  for (const topic of topics) {
    for (const key of topic.context ?? []) {
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(topic.id);
    }
  }
  for (const [key, ids] of owners) if (ids.size > 1) problems.push(`help key ${key}: ambiguous, listed by ${[...ids].join(", ")}`);
  return {
    manifest: { ...manifest, topics },
    readBody: (id, locale) => bodies.get(`${id}|${locale}`) ?? readBody(id, locale),
    problems,
  };
}
