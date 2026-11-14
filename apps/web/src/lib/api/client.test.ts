import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@carenta/shared';

import { api } from './client';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const expired = () =>
  json(401, { code: ErrorCode.UNAUTHORIZED, message: 'Vui lòng đăng nhập để tiếp tục.' });
const refreshed = () => new Response(null, { status: 204 });

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function calls() {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${urlOf(url)}`);
}

describe('api (browser client)', () => {
  it("calls this site's /api/v1 so the proxy carries the cookies", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 'u1' }));
    await expect(api.get('/auth/me')).resolves.toEqual({ id: 'u1' });
    expect(calls()).toEqual(['GET /api/v1/auth/me']);
  });

  it('refreshes the session once after 401 UNAUTHORIZED and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(json(200, { id: 'u1' }));

    await expect(api.get('/auth/me')).resolves.toEqual({ id: 'u1' });
    expect(calls()).toEqual([
      'GET /api/v1/auth/me',
      'POST /api/v1/auth/refresh',
      'GET /api/v1/auth/me',
    ]);
  });

  it('throws the original 401 when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(
      json(401, {
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      }),
    );

    await expect(api.get('/auth/me')).rejects.toMatchObject({
      status: 401,
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh for other 401s such as a wrong password', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, {
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng.',
      }),
    );

    await expect(api.post('/auth/login', { email: 'a@b.vn', password: 'x' })).rejects.toMatchObject(
      { code: ErrorCode.INVALID_CREDENTIALS },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh after 403', async () => {
    fetchMock.mockResolvedValueOnce(
      json(403, {
        code: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền thực hiện thao tác này.',
      }),
    );
    await expect(api.get('/console/users')).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent expired calls', async () => {
    let finishRefresh: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      if (url.endsWith('/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        });
      }
      const retried = fetchMock.mock.calls.filter(([other]) => urlOf(other) === url).length > 1;
      return Promise.resolve(retried ? json(200, { url }) : expired());
    });

    const both = Promise.all([api.get('/bookings'), api.get('/owner/bookings')]);
    // Both calls have failed with 401 and are waiting on the same refresh.
    await vi.waitFor(() => {
      expect(calls()).toHaveLength(3);
    });
    finishRefresh?.(refreshed());

    await expect(both).resolves.toEqual([
      { url: '/api/v1/bookings' },
      { url: '/api/v1/owner/bookings' },
    ]);
    expect(calls().filter((call) => call.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('refreshes again when the session expires later', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(json(200, 1))
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(json(200, 2));

    await expect(api.get('/a')).resolves.toBe(1);
    await expect(api.get('/b')).resolves.toBe(2);
    expect(calls().filter((call) => call.endsWith('/auth/refresh'))).toHaveLength(2);
  });
});
