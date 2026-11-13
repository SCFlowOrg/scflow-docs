# Publishing the site

The site is built by `.github/workflows/site.yml` and served by GitHub Pages on `https://docs.supplychainflow.org`. This page lists the one-time setup, in order, and how to operate it afterwards. Nothing here is stored in the repository: the token, the Pages settings and the DNS record live in GitHub and at the registrar.

## One-time setup

1. **Token to read the sources.** The three source repositories are private, so the build needs a credential that can read them.
   - Create a fine-grained personal access token (or, better for the organization, a GitHub App) with read-only `Contents` access to `scflow-core`, `scflow-framework` and `scflow-plugins`.
   - Add it to this repository as the Actions secret `SOURCES_READ_TOKEN` (Settings > Secrets and variables > Actions).
   - Set an expiry reminder: when the token expires, the build fails at checkout.
2. **First build.** Run the workflow by hand (Actions > Documentation site > Run workflow). It must pass on `main`: this is the first run against the real sources, so expect to fix real content errors reported by `npm run generate -- --strict`.
3. **GitHub Pages.** Settings > Pages > Source: **GitHub Actions**. Do not set the custom domain yet.
4. **Switch publication on.** Settings > Secrets and variables > Actions > Variables: add `PUBLISH_SITE` = `true`. The next run on `main` deploys the site to `https://scflowOrg.github.io/scflow-docs/` (check it there first; absolute links may still point at the final domain).
5. **DNS at IONOS.** Add one record to the zone of `supplychainflow.org`: type `CNAME`, host `docs`, value `scfloworg.github.io`. The main domain is not touched.
6. **Custom domain.** Once the record resolves, Settings > Pages > Custom domain: `docs.supplychainflow.org`, then tick **Enforce HTTPS** when GitHub has issued the certificate (a few minutes to an hour).

## Operating it

- **Rebuild triggers:** push to `main`, nightly at 03:17 UTC, and a manual run. The source repositories send no event on purpose, so they need no workflow of their own: a change in their documentation reaches the site at the next nightly run. To publish it at once, click Run workflow (Actions > Documentation site) or run `gh workflow run site.yml -R SCFlowOrg/scflow-docs`.
- **Pause publication:** set `PUBLISH_SITE` to anything other than `true`. Builds still run and are checked.
- **A build fails:** the log of `Generate the content` names the topic and the problem; fix it in the repository that owns the topic, not here.

## Still open

- Licence of the documentation content.
- French topics (the site falls back to English with a notice).
