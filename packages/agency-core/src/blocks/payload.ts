/**
 * Payload block configs for the registry — the editor-facing half. This file must not import React
 * or CSS: it is loaded by payload.config.ts (server + admin bundle). Field names mirror the component
 * props so `render.tsx` can map data → props with almost no translation.
 */
import type { Block, Field } from 'payload'

const link = (name: string, label: string, required = false): Field => ({
  name,
  type: 'group',
  label,
  fields: [
    { name: 'label', type: 'text', required },
    {
      name: 'href',
      type: 'text',
      required,
      admin: { description: 'Internal path (/geo-pricing/) or full URL.' },
    },
    { name: 'external', type: 'checkbox', defaultValue: false },
  ],
})

const ctaPair: Field = {
  name: 'cta',
  type: 'group',
  fields: [link('primary', 'Primary action'), link('secondary', 'Secondary action')],
}

const sectionHead: Field[] = [
  { name: 'eyebrow', type: 'text', admin: { description: 'Small label above the heading.' } },
  { name: 'title', type: 'text' },
  { name: 'lede', type: 'textarea' },
]

export const RichTextBlockConfig: Block = {
  slug: 'richText',
  labels: { singular: 'Rich text', plural: 'Rich text' },
  fields: [
    { name: 'body', type: 'richText', required: true },
    { name: 'measure', type: 'select', defaultValue: 'prose', options: ['prose', 'wide', 'full'] },
  ],
}

export const HeroBlockConfig: Block = {
  slug: 'hero',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'lede', type: 'textarea' },
    {
      name: 'status',
      type: 'text',
      admin: { description: 'Short status line with live dot, e.g. availability.' },
    },
    {
      name: 'eyebrow',
      type: 'text',
      admin: { description: 'Small label without the dot (sub-page heroes).' },
    },
    { name: 'variant', type: 'select', defaultValue: 'media', options: ['media', 'plain'] },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { condition: (_, s) => s?.variant !== 'plain' },
    },
    ctaPair,
    {
      name: 'as',
      type: 'select',
      defaultValue: 'h1',
      options: ['h1', 'h2'],
      admin: { description: 'h1 unless the page already has one.' },
    },
  ],
}

export const TakeawayListBlockConfig: Block = {
  slug: 'takeawayList',
  labels: { singular: 'Takeaway list', plural: 'Takeaway lists' },
  fields: [
    { name: 'label', type: 'text', required: true, defaultValue: 'The short version' },
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'lead', type: 'text', required: true },
        { name: 'text', type: 'textarea', required: true },
      ],
    },
  ],
}

export const EvidenceGridBlockConfig: Block = {
  slug: 'evidenceGrid',
  labels: { singular: 'Evidence grid', plural: 'Evidence grids' },
  fields: [
    ...sectionHead,
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'figure',
          type: 'text',
          required: true,
          admin: { description: 'Exactly as displayed: 90%, 4.4×, −34.5%' },
        },
        { name: 'claim', type: 'text', required: true },
        { name: 'detail', type: 'textarea' },
        {
          name: 'source',
          type: 'group',
          fields: [
            { name: 'publisher', type: 'text', required: true },
            { name: 'title', type: 'text', required: true },
            { name: 'href', type: 'text', required: true },
            { name: 'date', type: 'text', required: true },
          ],
        },
      ],
    },
  ],
}

export const CtaBlockConfig: Block = {
  slug: 'cta',
  labels: { singular: 'Call to action', plural: 'Calls to action' },
  fields: [
    { name: 'eyebrow', type: 'text' },
    { name: 'title', type: 'text', required: true },
    { name: 'text', type: 'textarea' },
    { ...ctaPair, required: true } as Field,
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Decorative background; alt is ignored.' },
    },
  ],
}

export const FaqBlockConfig: Block = {
  slug: 'faq',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  fields: [
    ...sectionHead,
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'textarea', required: true },
        {
          name: 'anchor',
          type: 'text',
          admin: { description: 'Stable anchor id; derived from the question when empty.' },
        },
      ],
    },
  ],
}

export const GlossaryListBlockConfig: Block = {
  slug: 'glossaryList',
  labels: { singular: 'Glossary list', plural: 'Glossary lists' },
  fields: [
    ...sectionHead,
    link('more', 'Link to the full glossary'),
    {
      name: 'schemaSetId',
      type: 'text',
      admin: {
        description: 'DefinedTermSet fragment id (legacy: glossary on the home page, set on /glossary/).',
      },
    },
    {
      name: 'terms',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'anchor',
          type: 'text',
          required: true,
          admin: { description: 'Stable id (#geo). Parity gate checks these.' },
        },
        {
          name: 'schemaId',
          type: 'text',
          admin: {
            description: 'DefinedTerm fragment id when it differs from the anchor (legacy carry-over).',
          },
        },
        { name: 'term', type: 'text', required: true },
        { name: 'definition', type: 'textarea', required: true },
        { name: 'aside', type: 'text' },
        {
          name: 'notes',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'text', type: 'textarea', required: true },
          ],
        },
      ],
    },
  ],
}

export const BriefFormBlockConfig: Block = {
  slug: 'briefForm',
  labels: { singular: 'Brief form', plural: 'Brief forms' },
  fields: [
    ...sectionHead,
    { name: 'submitLabel', type: 'text', required: true, defaultValue: 'Send the brief' },
    { name: 'briefPlaceholder', type: 'text' },
    {
      name: 'optIn',
      type: 'group',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        { name: 'label', type: 'text' },
        { name: 'text', type: 'textarea' },
      ],
    },
    // Select options are NOT stored here: they come from the `form-config` global so chat and form agree.
  ],
}

export const DataTableBlockConfig: Block = {
  slug: 'dataTable',
  labels: { singular: 'Data table', plural: 'Data tables' },
  fields: [
    ...sectionHead,
    { name: 'caption', type: 'text', required: true },
    { name: 'rowHeader', type: 'text', defaultValue: '' },
    { name: 'variant', type: 'select', defaultValue: 'plain', options: ['plain', 'compare', 'price'] },
    {
      name: 'columns',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [{ name: 'label', type: 'text', required: true }],
    },
    {
      name: 'rows',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'cells',
          type: 'array',
          required: true,
          fields: [{ name: 'text', type: 'text', required: true }],
        },
      ],
    },
    { name: 'footnote', type: 'text' },
    {
      name: 'schemaExtra',
      type: 'json',
      admin: {
        description:
          'OfferCatalog node carried from legacy until pricing is generated from the Services collection (Release 2).',
      },
    },
  ],
}

export const StepsBlockConfig: Block = {
  slug: 'steps',
  labels: { singular: 'Steps', plural: 'Steps' },
  fields: [
    ...sectionHead,
    {
      name: 'ordered',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'On when the order carries meaning (a method).' },
    },
    {
      name: 'howTo',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Emit HowTo JSON-LD (ordered lists only).' },
    },
    { name: 'layout', type: 'select', defaultValue: 'split', options: ['split', 'stack'] },
    {
      name: 'schemaExtra',
      type: 'json',
      admin: {
        description:
          'HowTo extras (supply, tool, totalTime, name) carried from legacy; the steps themselves come from items.',
      },
    },
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'text', type: 'textarea', required: true },
      ],
    },
  ],
}

export const RelatedLinksBlockConfig: Block = {
  slug: 'relatedLinks',
  labels: { singular: 'Related links', plural: 'Related links' },
  fields: [
    { name: 'label', type: 'text', defaultValue: 'Related' },
    {
      name: 'links',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
        { name: 'description', type: 'text' },
      ],
    },
  ],
}

export const BreadcrumbBlockConfig: Block = {
  slug: 'breadcrumb',
  labels: { singular: 'Breadcrumb', plural: 'Breadcrumbs' },
  fields: [
    {
      name: 'trail',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
      ],
    },
    { name: 'current', type: 'text', required: true },
  ],
}

export const SubNavBlockConfig: Block = {
  slug: 'subNav',
  labels: { singular: 'Section navigation', plural: 'Section navigations' },
  fields: [
    { name: 'label', type: 'text', defaultValue: 'On this page' },
    {
      name: 'links',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
      ],
    },
  ],
}

export const OfficesBlockConfig: Block = {
  slug: 'offices',
  labels: { singular: 'Offices', plural: 'Offices' },
  fields: [...sectionHead],
  // Office rows come from the Offices collection via the render context — never duplicated here.
}

/** Blocks editors can place in `pages.layout` (chrome blocks are rendered from globals, not placed). */
export const layoutBlocks: Block[] = [
  HeroBlockConfig,
  RichTextBlockConfig,
  TakeawayListBlockConfig,
  EvidenceGridBlockConfig,
  FaqBlockConfig,
  GlossaryListBlockConfig,
  CtaBlockConfig,
  BriefFormBlockConfig,
  DataTableBlockConfig,
  StepsBlockConfig,
  RelatedLinksBlockConfig,
  BreadcrumbBlockConfig,
  SubNavBlockConfig,
  OfficesBlockConfig,
]
