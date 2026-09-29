import { classifyPluginResponse } from './plugin-check.service';

describe('classifyPluginResponse', () => {
  it('reconnaît une extension branchée', () => {
    expect(
      classifyPluginResponse(200, {
        plugin: 'data-fb-posting',
        version: '1.3.0',
        endpointConfigured: true,
      }),
    ).toMatchObject({ state: 'CONNECTED', version: '1.3.0' });
  });

  it('signale une extension qui ne nous enverra rien', () => {
    const check = classifyPluginResponse(200, {
      plugin: 'data-fb-posting',
      version: '1.3.0',
      endpointConfigured: false,
    });
    expect(check.state).toBe('CONNECTED');
    expect(check.message).toMatch(/URL de l’API/);
  });

  it('distingue une clé refusée d’une extension absente', () => {
    expect(
      classifyPluginResponse(401, {
        code: 'dfb_bad_key',
        message: 'La clé présentée ne correspond pas',
        data: { status: 401, version: '1.3.0' },
      }),
    ).toMatchObject({ state: 'BAD_KEY', version: '1.3.0' });
    expect(
      classifyPluginResponse(404, { code: 'rest_no_route' }),
    ).toMatchObject({ state: 'MISSING' });
    // Un site qui renvoie sa page d'accueil HTML au lieu de l'API.
    expect(classifyPluginResponse(200, null).state).toBe('MISSING');
  });
});
