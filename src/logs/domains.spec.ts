import { domainOf, domainWhere } from './domains';

describe('domainOf — le rangement des journaux', () => {
  it.each([
    ['JOB_CLAIMED', 'publication'],
    ['POST_PUBLISHED', 'publication'],
    ['COMMENT_LINK_UPDATED', 'publication'],
    ['TARGET_FORCED', 'publication'],
    ['GROUP_POSTS_REMOVED', 'publication'],
    ['ARTICLE_ARCHIVED', 'publication'],
    ['INGEST_REJECTED', 'capture'],
    ['INGEST_FAILED', 'capture'],
    ['WORDPRESS_ARTICLE_NO_POST', 'sync'],
    ['SITE_PLUGIN_CHANGED', 'sync'],
    ['PROFILES_SYNCED', 'sync'],
    ['GROUP_JOIN_UPDATED', 'groups'],
    ['QUELQUE_CHOSE', 'other'],
  ])('%s → %s', (eventType, domain) => {
    expect(domainOf(eventType)).toBe(domain);
  });

  it('un exact d’un autre domaine ne tombe pas sous nos préfixes', () => {
    // GROUP_POSTS_REMOVED commence par GROUP_ mais appartient à la publication.
    expect(JSON.stringify(domainWhere('groups'))).toContain('GROUP_POSTS_REMOVED');
    expect(JSON.stringify(domainWhere('groups'))).toContain('notIn');
  });

  it('« autres » exclut tous les domaines connus', () => {
    const where = JSON.stringify(domainWhere('other'));
    for (const prefix of ['JOB_', 'INGEST_', 'WORDPRESS_', 'GROUP_JOIN']) {
      expect(where).toContain(prefix);
    }
    expect(where).toContain('NOT');
  });
});
