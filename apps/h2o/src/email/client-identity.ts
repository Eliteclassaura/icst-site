import { client, type ClientConfig } from '../client'

/**
 * KIT-0 H4: the company identity the email code needs, read from the client manifest (`client()`): who a message is from, the
 * sales address, the domains an address may use, and the names a template says. Pure functions of a `ClientConfig` so tests can
 * build them from any manifest; the module-level `identity` is the process client's.
 *
 * Domain lists: the canonical domain and its aliases without `www.`. The order is part of the messages an admin sees
 * ("an address at A or B"), so it is fixed by rule: sender domains list the aliases first and the canonical domain last; the sales
 * address lists the canonical domain first.
 */
const bare = (host: string): string => host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase()

export function mailDomains(c: Pick<ClientConfig, 'origin' | 'manifest'>): { canonical: string; aliases: string[] } {
  const canonical = bare(c.origin)
  const aliases: string[] = []
  for (const a of c.manifest.domains.aliases) {
    const d = bare(a)
    if (d !== canonical && !aliases.includes(d)) aliases.push(d)
  }
  return { canonical, aliases }
}

export function identityOf(c: ClientConfig) {
  const d = mailDomains(c)
  return {
    /** The sender's display name when none is configured. */
    senderName: c.defaultSender.displayName,
    /** The public sales address and the default sender address. */
    salesAddress: c.defaultSender.address,
    /** The team signature: its name, then its lines (the sales address is added where the template asks for it). */
    signature: { name: c.manifest.email.signature.name, lines: c.manifest.email.signature.lines },
    /** The text a template says: the company's display name, its short name, and the bare web domain. */
    displayName: c.manifest.client.displayName,
    shortName: c.manifest.client.shortName,
    host: d.canonical,
    /** Defaults for the sender and sales-address domain allow-lists (environment settings still win). */
    senderDomains: [...d.aliases, d.canonical],
    salesDomains: [d.canonical, ...d.aliases],
    /** How a notice from the system signs off. */
    emailFrom: c.brandName('emailFrom'),
  }
}
export type EmailIdentity = ReturnType<typeof identityOf>
export const identity: EmailIdentity = identityOf(client())
