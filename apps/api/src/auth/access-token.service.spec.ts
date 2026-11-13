import { SignJWT } from 'jose';
import { z } from 'zod';

import { testConfig } from '../../test/test-config.js';
import { AccessTokenService } from './access-token.service.js';

const claims = { userId: '019a7c3e-0000-7000-8000-000000000001', sessionId: 'session-1' };

describe('AccessTokenService', () => {
  const service = new AccessTokenService(testConfig().config);

  it('round-trips the user and session ids', async () => {
    await expect(service.verify(await service.sign(claims))).resolves.toEqual(claims);
  });

  it('expires tokens after 15 minutes', async () => {
    const token = await service.sign(claims);
    const [, payload] = token.split('.');
    const { iat, exp } = z
      .object({ iat: z.number(), exp: z.number() })
      .parse(JSON.parse(Buffer.from(payload!, 'base64url').toString()));

    expect(exp - iat).toBe(15 * 60);
  });

  it('rejects tokens signed with another secret, tampered with, or expired', async () => {
    const other = new AccessTokenService(
      testConfig({ JWT_SECRET: 'another-secret-that-is-at-least-32-chars' }).config,
    );
    const token = await service.sign(claims);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'someone-else', sid: 'x', iss: 'carenta-api', exp: 9_999_999_999 }),
    ).toString('base64url');
    const expired = await new SignJWT({ sid: 's' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuer('carenta-api')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(testConfig().env.JWT_SECRET));

    await expect(service.verify(await other.sign(claims))).resolves.toBeNull();
    await expect(service.verify(`${header}.${forgedPayload}.${signature}`)).resolves.toBeNull();
    await expect(service.verify(expired)).resolves.toBeNull();
    await expect(service.verify('not-a-jwt')).resolves.toBeNull();
  });

  it('rejects unsigned (alg: none) tokens', async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: claims.userId, sid: claims.sessionId, iss: 'carenta-api' }),
    ).toString('base64url')}.`;

    await expect(service.verify(none)).resolves.toBeNull();
  });
});
