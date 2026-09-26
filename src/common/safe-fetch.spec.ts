import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { assertSafeRemoteUrl, isPrivateIp } from './safe-fetch';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lookup } = require('node:dns/promises') as {
  lookup: jest.Mock<Promise<Array<{ address: string; family: number }>>>;
};

const resolvesTo = (...addresses: string[]) =>
  lookup.mockResolvedValue(
    addresses.map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    })),
  );

beforeEach(() => lookup.mockReset());

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.169.254',
    '::1',
    'fd00::1',
    'fe80::1',
  ])('écarte %s', (address) => expect(isPrivateIp(address)).toBe(true));

  it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '2606:4700::1111'])(
    'laisse passer %s',
    (address) => expect(isPrivateIp(address)).toBe(false),
  );

  // Une résolution qui ne rend pas une adresse IP n'est pas exploitable :
  // la refuser vaut mieux que la suivre.
  it.each(['', 'localhost', 'pas-une-adresse'])(
    'écarte ce qui n’est pas une adresse : %s',
    (value) => expect(isPrivateIp(value)).toBe(true),
  );
});

describe('assertSafeRemoteUrl', () => {
  it('rend l’URL analysée quand le nom ne résout que vers du public', async () => {
    resolvesTo('93.184.216.34');
    const url = await assertSafeRemoteUrl('https://exemple.test/article');
    expect(url.hostname).toBe('exemple.test');
    expect(lookup).toHaveBeenCalledWith('exemple.test', { all: true });
  });

  it('refuse tout ce qui n’est pas HTTPS, sans même résoudre', async () => {
    await expect(
      assertSafeRemoteUrl('http://exemple.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuse une adresse privée', async () => {
    resolvesTo('10.1.2.3');
    await expect(
      assertSafeRemoteUrl('https://interne.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Un nom qui rend une adresse publique et une adresse privée reste un
  // moyen d'atteindre l'intérieur : `fetch` choisira sans nous consulter.
  it('refuse dès qu’une seule des adresses est privée', async () => {
    resolvesTo('93.184.216.34', '127.0.0.1');
    await expect(
      assertSafeRemoteUrl('https://mixte.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un nom qui ne résout vers rien', async () => {
    lookup.mockResolvedValue([]);
    await expect(
      assertSafeRemoteUrl('https://vide.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signale une résolution en échec comme une panne de la source', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      assertSafeRemoteUrl('https://absent.test'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
