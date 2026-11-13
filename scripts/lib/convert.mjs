// Pure conversion of a merged catalogue (docs-manifest.json + one body per topic
// and locale, as `scflow docs build` writes them) into Starlight pages.
// No file system here: the caller reads the bodies and writes the pages.

export const LOCALES = ["en", "fr"];
export const DEFAULT_LOCALE = "en";
export const AUDIENCES = ["user", "plugin-dev", "model-dev"];
export const KINDS = ["tutorial", "how-to", "reference", "explanation"];

const NOTICES = {
  fr: "Cette page n'est pas encore traduite en français : la version anglaise est affichée.",
  en: "This page is not available in English yet: the French version is shown.",
};
const NOTICE_TITLES = { fr: "Version anglaise", en: "French version" };

/** Where a topic lives under a locale: `<audience>/<kind>/<id>`. Never depends on the locale. */
export const topicPath = (topic) => `${topic.audience}/${topic.kind}/${topic.id}`;

export const topicUrl = (topic, locale, base = "") => `${base}/${locale}/${topicPath(topic)}/`;

// Fenced blocks and inline code are never rewritten.
const CODE = /((?:^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)|`[^`\n]*`)/;
const LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/**
 * Rewrites `[[id]]` and `[[id|label]]` to Markdown links.
 * `resolve(id)` gives `{ url, title }` or undefined. An unresolved link stays
 * readable (its label or id in code style) and is passed to `onUnresolved`.
 */
export function rewriteLinks(body, resolve, onUnresolved = () => {}) {
  return body
    .split(CODE)
    .map((part, i) => {
      // split with two capture groups: parts cycle [text, code, fence marker]
      if (i % 3 !== 0) return part;
      return part.replace(LINK, (_all, rawId, rawLabel) => {
        const id = rawId.trim();
        const target = resolve(id);
        const label = rawLabel?.trim();
        if (!target) {
          onUnresolved(id);
          return label || `\`${id}\``;
        }
        return `[${label || target.title}](${target.url})`;
      });
    })
    .filter((_part, i) => i % 3 !== 2)
    .join("");
}

const q = (value) => JSON.stringify(value); // a JSON string is a valid YAML scalar

/** Front matter of a page: the topic fields (checked again by the site schema) plus what Starlight needs. */
export function frontMatter(topic, locale, fallbackFrom) {
  const lines = [
    "---",
    `title: ${q(topic.title)}`,
    `description: ${q(topic.summary)}`,
    `id: ${q(topic.id)}`,
    `summary: ${q(topic.summary)}`,
    `kind: ${q(topic.kind)}`,
    `audience: ${q(topic.audience)}`,
    `locale: ${q(locale)}`,
    `context: ${JSON.stringify(topic.context ?? [])}`,
    `uses: ${JSON.stringify(topic.uses ?? [])}`,
    `generated: ${topic.generated === true}`,
  ];
  if (fallbackFrom) lines.push(`fallback: ${q(fallbackFrom)}`);
  lines.push("---", "");
  return lines.join("\n");
}

/** The visible notice put at the top of a page shown in place of a missing translation. */
export const fallbackNotice = (locale) => `:::note[${NOTICE_TITLES[locale]}]\n${NOTICES[locale]}\n:::\n\n`;

function landing(locale, entries, base) {
  const heading = { en: "SCFlow documentation", fr: "Documentation SCFlow" }[locale];
  const audienceTitle = {
    en: { user: "Using SCFlow", "plugin-dev": "Developing plugins", "model-dev": "Developing models and modules" },
    fr: { user: "Utiliser SCFlow", "plugin-dev": "Développer des plugins", "model-dev": "Développer des modèles et modules" },
  }[locale];
  // The landing page is generated too, so it carries the topic fields the site schema requires.
  const out = [frontMatter({ id: "site/index", title: heading, summary: heading, kind: "explanation", audience: "user", generated: true }, locale)];
  for (const audience of AUDIENCES) {
    const items = entries.filter((e) => e.topic.audience === audience).sort((a, b) => a.topic.id.localeCompare(b.topic.id));
    if (items.length === 0) continue;
    out.push(`## ${audienceTitle[audience]}\n`);
    for (const { topic, titles } of items) out.push(`- [${titles[locale]}](${topicUrl(topic, locale, base)}) — ${topic.summary}`);
    out.push("");
  }
  return out.join("\n");
}

/**
 * Builds every page.
 * @param manifest   parsed docs-manifest.json: `{ version, topics: Topic[] }` (one entry per id and locale)
 * @param readBody   (id, locale) => body text, for an entry of the manifest
 * @returns `{ pages: [{ path, content }], sidebar, problems }`; paths are relative to `src/content/docs`
 */
export function buildPages({ manifest, readBody, locales = LOCALES, base = "" }) {
  const problems = [];
  // id -> locale -> entry
  const byId = new Map();
  for (const topic of manifest.topics) {
    if (!byId.has(topic.id)) byId.set(topic.id, new Map());
    byId.get(topic.id).set(topic.locale, topic);
  }

  const entries = [];
  for (const [id, perLocale] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
    const home = perLocale.get(DEFAULT_LOCALE) ?? [...perLocale.values()][0]; // places the topic in the tree
    const titles = {};
    const sources = {};
    for (const locale of locales) {
      const own = perLocale.get(locale);
      const used = own ?? home;
      sources[locale] = { entry: used, fallback: own ? undefined : used.locale };
      titles[locale] = used.title;
    }
    entries.push({ id, topic: home, titles, sources });
  }

  const index = new Map(entries.map((e) => [e.id, e]));
  const pages = [];
  for (const locale of locales) {
    for (const e of entries) {
      const { entry, fallback } = e.sources[locale];
      const resolve = (id) => {
        const target = index.get(id);
        return target && { url: topicUrl(target.topic, locale, base), title: target.titles[locale] };
      };
      const body = rewriteLinks(readBody(entry.id, entry.locale), resolve, (missing) =>
        problems.push(`${entry.id} (${locale}): unresolved link [[${missing}]]`),
      );
      const page = { ...e.topic, title: entry.title, summary: entry.summary, context: entry.context, uses: entry.uses, generated: entry.generated };
      pages.push({
        path: `${locale}/${topicPath(e.topic)}.md`,
        content: frontMatter(page, locale, fallback) + (fallback ? fallbackNotice(locale) : "") + body.replace(/^\n+/, ""),
      });
    }
    pages.push({ path: `${locale}/index.md`, content: landing(locale, entries, base) });
  }

  // Sidebar: audiences, then kinds, only those that hold a topic.
  const sidebar = AUDIENCES.map((audience) => ({
    audience,
    kinds: KINDS.filter((kind) => entries.some((e) => e.topic.audience === audience && e.topic.kind === kind)),
  })).filter((s) => s.kinds.length > 0);

  return { pages, sidebar, problems };
}
