import { Prisma } from '@prisma/client';

/** Les journaux, rangés par ce qu'ils racontent. Le rangement se déduit du
 * type d'événement : rien à stocker, et l'historique est rangé d'emblée.
 *
 * Un événement inconnu — un automate qui en invente un — tombe dans
 * « autres » : on le voit toujours, il n'est simplement pas classé. */
export const LOG_DOMAINS = {
  publication: {
    label: 'Publication',
    prefixes: ['JOB_', 'JOBS_', 'CLAIM_', 'POST_', 'COMMENT_', 'TARGET_'],
    exact: ['GROUP_POSTS_REMOVED', 'ARTICLE_ARCHIVED'],
  },
  capture: {
    label: 'Captures',
    prefixes: ['INGEST_', 'SCRAPE_', 'CAPTURE_'],
    exact: [] as string[],
  },
  sync: {
    label: 'Synchronisation',
    prefixes: ['WORDPRESS_', 'SITE_', 'PLUGIN_', 'PROFILES_', 'NST_'],
    exact: [] as string[],
  },
  groups: {
    label: 'Groupes & pilotage',
    prefixes: ['GROUP_JOIN', 'BROWSER_', 'RUNNER_'],
    exact: [] as string[],
  },
} as const;

export type LogDomain = keyof typeof LOG_DOMAINS | 'other';
export const LOG_DOMAIN_KEYS = [
  ...(Object.keys(LOG_DOMAINS) as Array<keyof typeof LOG_DOMAINS>),
  'other',
] as const;

type Definition = { prefixes: readonly string[]; exact: readonly string[] };

const matches = (eventType: string, def: Definition) =>
  def.exact.includes(eventType) ||
  def.prefixes.some((prefix) => eventType.startsWith(prefix));

export function domainOf(eventType: string): LogDomain {
  // Les correspondances exactes d'abord : GROUP_POSTS_REMOVED est de la
  // publication, pas une adhésion à un groupe.
  for (const [key, def] of Object.entries(LOG_DOMAINS)) {
    if ((def.exact as readonly string[]).includes(eventType)) {
      return key as LogDomain;
    }
  }
  for (const [key, def] of Object.entries(LOG_DOMAINS)) {
    if (matches(eventType, def)) return key as LogDomain;
  }
  return 'other';
}

const conditionsOf = (def: Definition): Prisma.ActivityLogWhereInput[] => [
  ...(def.exact.length ? [{ eventType: { in: [...def.exact] } }] : []),
  ...def.prefixes.map((prefix) => ({ eventType: { startsWith: prefix } })),
];

/** Le filtre SQL d'un domaine, fidèle à `domainOf`. */
export function domainWhere(domain: LogDomain): Prisma.ActivityLogWhereInput {
  const all = Object.values(LOG_DOMAINS).flatMap(conditionsOf);
  if (domain === 'other') return { NOT: { OR: all } };
  const own = { OR: conditionsOf(LOG_DOMAINS[domain]) };
  // Un exact d'un AUTRE domaine qui commencerait par un de nos préfixes
  // reste chez lui (GROUP_POSTS_REMOVED ne tombe pas dans GROUP_JOIN*).
  const foreignExact = Object.entries(LOG_DOMAINS)
    .filter(([key]) => key !== domain)
    .flatMap(([, def]) => [...def.exact]);
  return foreignExact.length
    ? { AND: [own, { eventType: { notIn: foreignExact } }] }
    : own;
}
