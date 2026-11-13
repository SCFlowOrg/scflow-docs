# scflow-docs

Public documentation site of SCFlow, planned at <https://docs.supplychainflow.org>. Built with [Starlight](https://starlight.astro.build) (Astro). English and French, latest version only, Pagefind search.

This repository **only assembles**: it holds no documentation content. The topics are written in the product repositories (scflow-core, scflow-framework, scflow-plugins) and merged by `@scfloworg/docs` and its CLI (ADR-0014 in scflow-hub). Tracked by SCFlowOrg/scflow-hub#9.

## Pipeline

```
scflow-core ┐
scflow-framework ├─ module folders ─▶ scflow docs check / build ─▶ scripts/generate.mjs ─▶ src/content/docs ─▶ astro build ─▶ dist/
scflow-plugins ┘                      (docs-manifest.json + bodies)   (Starlight pages)
```

1. **Sources.** The three repos sit side by side. `SCFLOW_PARENT` names their parent folder (default: the parent of this repo; in CI they are checked out beside it).
2. **Catalogue.** The generator copies every folder holding a `module.yaml` (repo root, `packages/*`, `plugins/*`) into `.work/modules`, then runs the CLI of scflow-core: `scflow docs check` (a defect stops the build) and `scflow docs build .work/catalogue --modules .work/modules`. That gives `docs-manifest.json` and one body per topic and locale, generated reference topics included.
   **Folder topics.** `scflow docs` reads installed modules only, so the generator also reads two kinds of plain topic folders itself, with the same rules as `@scfloworg/docs` (`scripts/lib/topics.mjs`): `docs/topics/<locale>/*.md` of scflow-framework (the synced copies in other repos are ignored) and `plugins/*/resources/docs/<locale>/*.md` of any repo. They are merged into the catalogue; a bad file, a duplicate id and locale (the module catalogue wins) or a help key listed by two topics fails the generation.
3. **Conversion** (`scripts/lib/convert.mjs`, pure and tested), one file per topic and locale under `src/content/docs/<locale>/<audience>/<kind>/<id>.md`:
   - front matter carries the topic fields (`id`, `title`, `summary`, `kind`, `audience`, `locale`, `context`, `uses`, `generated`); the site schema (`src/content.config.ts`) validates them on every build;
   - `[[id]]` and `[[id|label]]` become links to the page of that topic in the same locale (not inside code); an unresolved link stays readable and is reported (`--strict` fails on it);
   - **audiences are sections** (`user`, `plugin-dev`, `model-dev`), each split by kind (tutorial, how-to, reference, explanation); `src/generated/sidebar.json` lists the non-empty ones and `astro.config.mjs` builds the sidebar from it;
   - **fallback:** a topic with no French file gets the English page under `/fr/` with `fallback: "en"` in its front matter and a visible note at the top;
   - a landing page per locale lists the topics by audience.
4. **Site.** `astro build` writes `dist/` and the Pagefind index. `/` redirects to `/en/`.

## Commands

Node 22.23.4 or later (CI uses 24).

```bash
npm ci
npm test                                   # generator tests
npm run generate                           # sources -> src/content/docs (needs the scflow CLI built in scflow-core)
npm run generate -- --from <dir>           # from an existing `scflow docs build` output, no CLI needed
npm run dev                                # or: npm run build
```

`SCFLOW_CLI` replaces the built CLI (for example `SCFLOW_CLI=scflow`); `DOCS_BASE` sets a base path.

## CI

`.github/workflows/site.yml` runs on push to `main`, pull requests, a nightly schedule and manually (the sources send no event, so a change in their documentation reaches the site at the next nightly run, or at once by running the workflow by hand). It checks out the three sources at `main` with the secret `SOURCES_READ_TOKEN` (read access to the three private repos), builds scflow-core with bun, then tests, generates (`--strict`) and builds the site, and uploads the Pages artifact.

The `deploy` job runs on `main` only when the repository variable `PUBLISH_SITE` is `true`. The one-time setup (token, Pages, DNS) is in [PUBLISHING.md](PUBLISHING.md).

## TODO

- Licence: the documentation content is CC BY 4.0, attribution "SCFlow contributors" (see [LICENSE.md](LICENSE.md)). The code of this repository has no licence chosen yet.
- DNS, the secret and the Pages settings are set up outside this repository, see [PUBLISHING.md](PUBLISHING.md).
