import { readFileSync, existsSync } from "node:fs";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Written by `npm run generate`: the audiences and kinds that hold at least one topic.
const generated = new URL("./src/generated/sidebar.json", import.meta.url);
const sections = existsSync(generated) ? JSON.parse(readFileSync(generated, "utf8")) : [];

const AUDIENCE = {
  user: { label: "Using SCFlow", translations: { fr: "Utiliser SCFlow" } },
  "plugin-dev": { label: "Developing plugins", translations: { fr: "Développer des plugins" } },
  "model-dev": { label: "Developing models and modules", translations: { fr: "Développer des modèles et modules" } },
};
const KIND = {
  tutorial: { label: "Tutorials", translations: { fr: "Tutoriels" } },
  "how-to": { label: "How-to guides", translations: { fr: "Guides pratiques" } },
  reference: { label: "Reference", translations: { fr: "Référence" } },
  explanation: { label: "Concepts", translations: { fr: "Concepts" } },
};

const sidebar = sections.map(({ audience, kinds }) => ({
  ...AUDIENCE[audience],
  items: kinds.map((kind) => ({ ...KIND[kind], items: [{ autogenerate: { directory: `${audience}/${kind}` } }] })),
}));

export default defineConfig({
  site: "https://docs.supplychainflow.org",
  redirects: { "/": "/en/" },
  integrations: [
    starlight({
      title: { en: "SCFlow documentation", fr: "Documentation SCFlow" },
      defaultLocale: "en",
      locales: {
        en: { label: "English", lang: "en" },
        fr: { label: "Français", lang: "fr" },
      },
      // Pagefind search is Starlight's default (`pagefind: true`).
      pagefind: true,
      sidebar,
      components: { Footer: "./src/components/Footer.astro" },
    }),
  ],
});
