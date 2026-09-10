import type { CollectionConfig } from 'payload'

/**
 * The Answer Layer — subscribers.
 *
 * This is the import target for subscribers.php?export=payload. Field names,
 * types and option values match that export exactly, so the import is a read
 * and an upsert with no transformation in between.
 *
 * Two decisions worth keeping when this grows:
 *
 * 1. `externalId` is the match key for imports, not `email`. People change
 *    email addresses; the id that came out of the static site does not. Match
 *    on email and a corrected typo becomes a duplicate person.
 *
 * 2. `consent` and `history` are not decoration. A double opt-in list is only
 *    worth having because you can show when and from where each person agreed
 *    — under GDPR that record is the lawful basis, and under Gmail's bulk
 *    sender rules it is what you produce when a complaint rate is questioned.
 *    Keep them read-only in the admin so they cannot be tidied away.
 */
export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'status', 'signupAt', 'source'],
    group: 'Audience',
  },
  access: {
    // Nothing here is public. A newsletter list is the highest-value, least
    // replaceable data the business holds.
    read: ({ req: { user } }) => Boolean(user),
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  indexes: [
    { fields: ['email'], unique: true },
    { fields: ['status', 'signupAt'] },
  ],
  fields: [
    {
      name: 'externalId',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Id issued by the static site. The match key for re-imports.',
      },
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'dedupeKey',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description:
          'Lower-cased, plus-address stripped, Gmail dots folded. Catches one person subscribing as dana+1@, dana+2@ and so on.',
      },
    },
    { name: 'name', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending confirmation', value: 'pending' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Unsubscribed', value: 'unsubscribed' },
        { label: 'Bounced', value: 'bounced' },
      ],
      admin: {
        description: 'Only `confirmed` may be mailed. Enforced in code, not by hope.',
      },
    },
    { name: 'signupAt', type: 'date', required: true, index: true },
    { name: 'confirmedAt', type: 'date' },
    { name: 'unsubscribedAt', type: 'date' },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'newsletter',
      options: [
        { label: 'Newsletter form', value: 'newsletter' },
        { label: 'Chat widget', value: 'chat' },
        { label: 'Brief form', value: 'form' },
        { label: 'Roadmap request', value: 'roadmap' },
        { label: 'Imported', value: 'import' },
      ],
    },
    {
      name: 'sourcePage',
      type: 'text',
      admin: { description: 'Which page or section they signed up from.' },
    },
    {
      name: 'tags',
      type: 'array',
      fields: [{ name: 'tag', type: 'text', required: true }],
    },
    {
      name: 'consent',
      type: 'group',
      admin: { description: 'Proof of permission. Keep it; do not tidy it.' },
      fields: [
        {
          name: 'method',
          type: 'select',
          defaultValue: 'double-opt-in',
          options: [
            { label: 'Double opt-in', value: 'double-opt-in' },
            { label: 'Unsubscribed', value: 'unsubscribed' },
            { label: 'Imported — single opt-in', value: 'single-opt-in' },
          ],
        },
        { name: 'requestedAt', type: 'date', admin: { readOnly: true } },
        { name: 'confirmedAt', type: 'date', admin: { readOnly: true } },
        { name: 'ip', type: 'text', admin: { readOnly: true } },
        { name: 'userAgent', type: 'textarea', admin: { readOnly: true } },
      ],
    },
    {
      name: 'history',
      type: 'array',
      admin: {
        readOnly: true,
        description: 'Every status change, oldest first, from the append-only log.',
      },
      fields: [
        { name: 'status', type: 'text' },
        { name: 'at', type: 'date' },
      ],
    },
    {
      name: 'meta',
      type: 'json',
      admin: { description: 'Referrer, campaign, timezone, screen, language, role-address flag.' },
    },
    {
      name: 'schemaVersion',
      type: 'number',
      defaultValue: 1,
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        // Timestamps follow from status rather than being set by hand, so a
        // record can never claim to be confirmed with no date attached.
        if (data.status === 'confirmed' && !data.confirmedAt) {
          data.confirmedAt = new Date().toISOString()
        }
        if (data.status === 'unsubscribed' && !data.unsubscribedAt) {
          data.unsubscribedAt = new Date().toISOString()
        }
        return data
      },
    ],
  },
}

export default Subscribers
