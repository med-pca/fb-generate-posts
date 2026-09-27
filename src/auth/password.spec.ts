import { hashPassword, newAutomationKey, verifyPassword } from './password';

describe('hashPassword', () => {
  it('ne garde jamais le mot de passe', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(stored).not.toContain('correct horse');
    expect(stored.split(':')).toHaveLength(2);
  });

  // Deux comptes au même mot de passe ne doivent pas se reconnaître dans la
  // base : un sel par empreinte.
  it('rend une empreinte différente à chaque fois', () => {
    expect(hashPassword('même mot de passe')).not.toBe(
      hashPassword('même mot de passe'),
    );
  });

  it('reconnaît le bon mot de passe', () => {
    expect(
      verifyPassword('s3cret-assez-long', hashPassword('s3cret-assez-long')),
    ).toBe(true);
  });

  it('refuse le mauvais', () => {
    expect(
      verifyPassword('autre-chose', hashPassword('s3cret-assez-long')),
    ).toBe(false);
  });

  it('refuse une empreinte mal formée sans lever d’erreur', () => {
    for (const stored of ['', 'sans-deux-points', ':', 'sel:']) {
      expect(verifyPassword('peu importe', stored)).toBe(false);
    }
  });
});

describe('newAutomationKey', () => {
  it('rend une clé longue et jamais deux fois la même', () => {
    const keys = new Set(Array.from({ length: 50 }, newAutomationKey));
    expect(keys.size).toBe(50);
    expect([...keys][0]).toHaveLength(64);
  });
});
