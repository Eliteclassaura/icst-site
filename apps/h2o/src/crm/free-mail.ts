/**
 * Personal-mailbox domains — **the one list**, shared by Typeform intake (`identity.ts`) and the CSV import.
 *
 * E0.1: "Do not infer employer from Gmail, Yahoo, Outlook, Hotmail, iCloud, AOL, or other consumer/free
 * domains." The list is the named set plus their common regional/brand variants. A domain absent from the
 * list is **not** thereby proven corporate — it simply may be matched against *verified* account domains.
 */
export const CONSUMER_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.jp',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'qq.com',
  '163.com',
  '126.com',
  // Wave 1 W1-3 (legacy-file profiling): ISP and regional free-mail domains are personal addresses too, so they
  // never name an employer, match an account or create one.
  'mail.ru',
  'yandex.ru',
  'inbox.ru',
  'bk.ru',
  'list.ru',
  'rambler.ru',
  'comcast.net',
  'att.net',
  'sbcglobal.net',
  'verizon.net',
  'bellsouth.net',
  'cox.net',
  'charter.net',
  'earthlink.net',
  'optonline.net',
  'frontier.com',
  'windstream.net',
  'centurylink.net',
  'q.com',
  'juno.com',
  'roadrunner.com',
  'rr.com',
  'twc.com',
  'mchsi.com',
  'embarqmail.com',
  'suddenlink.net',
  'netzero.net',
  'aim.com',
  'prodigy.net',
  'pacbell.net',
  'ameritech.net',
  'swbell.net',
  'rocketmail.com',
  'live.co.uk',
  'outlook.co.uk',
  'yahoo.ca',
  'yahoo.com.mx',
  'yahoo.co.in',
  'yahoo.es',
  'hotmail.fr',
  'hotmail.es',
  'outlook.es',
  'rediffmail.com',
  'web.de',
  't-online.de',
  'naver.com',
  'hanmail.net',
  // Regional free mail (CT legacy spot-check 2026-10-05: inbox.lv, wp.pl were creating accounts).
  'inbox.lv', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'op.pl', 'seznam.cz', 'email.cz', 'centrum.cz', 'azet.sk',
  'freemail.hu', 'abv.bg', 'ukr.net', 'i.ua', 'mail.ee', 'libero.it', 'virgilio.it', 'orange.fr', 'laposte.net',
  'free.fr', 'daum.net', 'sina.com', 'email.com', 'citromail.hu', 'mail.bg', 'mail.de', 'vp.pl', 'ro.ru',
  // Forwarding/relay aliases: deliverable, but never an employer.
  'mozmail.com', 'duck.com', 'privaterelay.appleid.com',
])


/** Two-part public suffixes, so the registrable label of "foo.co.uk" is "foo", not "co". */
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.jp', 'ne.jp', 'or.jp', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.mx',
  'com.ar', 'com.cn', 'com.hk', 'com.sg', 'com.my', 'com.tw', 'co.in', 'co.kr', 'co.za', 'com.tr', 'com.vn', 'co.id', 'com.ph',
])

/** The registrable label of a domain: "mail.acme.co.uk" → "acme", "acme.com" → "acme". */
export function registrableLabel(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean)
  if (parts.length < 2) return parts[0] ?? ''
  const lastTwo = parts.slice(-2).join('.')
  return TWO_PART_SUFFIXES.has(lastTwo) && parts.length >= 3 ? parts[parts.length - 3]! : parts[parts.length - 2]!
}

/**
 * Wave 1 (CT ruling 2026-10-05, §8.1b): hosting, ISP, telecom and webmail **providers** whose domains the exact list
 * can't enumerate (every regional variant of a provider). A domain whose registrable label is one of these is a
 * personal mailbox, not an employer — it never matches, verifies or creates an account. Deliberately conservative:
 * short or generic words that are also common company names are not listed.
 */
export const PROVIDER_LABELS: ReadonlySet<string> = new Set([
  // webmail
  'gmail', 'googlemail', 'yahoo', 'ymail', 'rocketmail', 'hotmail', 'outlook', 'msn', 'icloud', 'aol', 'aim',
  'protonmail', 'tutanota', 'fastmail', 'gmx', 'yandex', 'rambler', 'zoho', 'zohomail', 'mailfence', 'hushmail',
  'rediffmail', 'qq', 'sina', 'sohu', 'naver', 'daum', 'hanmail', 'libero', 'virgilio', 'seznam', 'interia', 'onet',
  // ISPs and telecoms
  'comcast', 'xfinity', 'sbcglobal', 'bellsouth', 'verizon', 'cox', 'charter', 'spectrum', 'earthlink', 'optonline', 'rr',
  'optimum', 'frontier', 'windstream', 'centurylink', 'centurytel', 'roadrunner', 'mchsi', 'embarqmail', 'suddenlink',
  'netzero', 'juno', 'prodigy', 'pacbell', 'ameritech', 'swbell', 'wowway', 'mediacombb', 'frontiernet', 'cableone',
  'btinternet', 'virginmedia', 'ntlworld', 'talktalk', 'tiscali', 'blueyonder', 'wanadoo', 'orange', 'laposte',
  'telus', 'shaw', 'rogers', 'sympatico', 'bigpond', 'optusnet', 'telstra', 'xtra', 'telenet', 'ziggo', 'kpnmail',
  'chello', 'upcmail', 'bluewin', 't-online', 'freenet', 'arcor', 'telefonica', 'movistar',
  // hosting / mailbox providers
  'secureserver', 'godaddy', 'hostgator', 'bluehost', 'dreamhost', 'ionos', 'zohocorp',
])

/** A domain on a provider label (see PROVIDER_LABELS). */
export const isProviderDomain = (domain: string): boolean => PROVIDER_LABELS.has(registrableLabel(domain))

/** Personal mailbox: on the exact list, or on a provider's domain. Free mail never names an employer. */
export const isConsumerDomain = (domain: string): boolean => CONSUMER_EMAIL_DOMAINS.has(domain.toLowerCase()) || isProviderDomain(domain)
