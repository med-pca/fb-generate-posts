import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WordpressGuard } from './wordpress.guard';

const context = (key?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-api-key': key } }),
    }),
  }) as ExecutionContext;
describe('WordPress authentication', () => {
  const guard = (key?: string) =>
    new WordpressGuard({ get: () => key } as unknown as ConfigService);
  it('accepts the dedicated key', () =>
    expect(guard('secret').canActivate(context('secret'))).toBe(true));
  it('rejects missing and wrong keys', () => {
    expect(() => guard('secret').canActivate(context())).toThrow(
      'Clé WordPress invalide',
    );
    expect(() => guard('secret').canActivate(context('wrong'))).toThrow(
      'Clé WordPress invalide',
    );
  });
  it('fails closed when not configured', () =>
    expect(() => guard().canActivate(context('secret'))).toThrow(
      'WORDPRESS_API_KEY',
    ));
});
