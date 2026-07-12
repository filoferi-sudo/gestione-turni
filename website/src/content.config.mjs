// Content collections (Astro 5, Content Layer API). Sorgenti di verità in Markdown:
//  - settori: aggiungere un settore = aggiungere UN file .md in src/content/settori/ (nessun codice)
//  - blog: articoli (definito qui, popolato in Fase 4)
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const settori = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/settori' }),
  schema: z.object({
    title: z.string(),
    order: z.number().default(99),
    status: z.enum(['live', 'coming']).default('live'),
    icon: z.string().default('layers'), // chiave di Icon.astro
    hook: z.string(), // frase d'aggancio (usata anche nelle card home/settori)
    pains: z.array(z.string()).length(3),
    solutions: z.array(z.object({ title: z.string(), text: z.string() })).length(3),
    screenshot: z.string().optional(), // filename in /public/screenshots/ (se assente → mock)
    screenshotMock: z.enum(['calendario', 'sostituzione', 'copertura']).default('calendario'),
    seoTitle: z.string(),
    seoDescription: z.string(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.date(),
      updatedDate: z.date().optional(),
      category: z.enum(['generale', 'ristoranti', 'bar', 'piscine', 'palestre']).default('generale'),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      cover: image().optional(),
    }),
});

export const collections = { settori, blog };
