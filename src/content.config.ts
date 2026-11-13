import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// The topic fields of @scfloworg/docs (docs/docs.md, Topic): every build validates them.
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/, "a topic id is namespace/name"),
        summary: z.string().min(1),
        kind: z.enum(["tutorial", "how-to", "reference", "explanation"]),
        audience: z.enum(["user", "plugin-dev", "model-dev"]),
        locale: z.string().min(2),
        context: z.array(z.string()).default([]),
        uses: z.array(z.string()).default([]),
        generated: z.boolean().default(false),
        // set when the page shows another locale in place of a missing translation
        fallback: z.string().optional(),
      }),
    }),
  }),
};
