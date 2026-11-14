import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@carenta/shared';

import { ApiRequestError, ClientErrorCode, errorMessage } from './errors';
import { apiUrl, sendRequest } from './request';

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

async function caught(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ApiRequestError)) throw new Error('expected an ApiRequestError');
  return error;
}

describe('apiUrl', () => {
  it('prefixes /api/v1 and builds the query string', () => {
    const url = apiUrl('', '/cars', {
      province: 'HCM',
      amenities: ['GPS', 'BLUETOOTH'],
      instantBook: true,
      seats: 7,
      startAt: new Date('2026-12-01T01:00:00.000Z'),
      empty: '',
      missing: undefined,
      none: null,
    });
    expect(url).toBe(
      '/api/v1/cars?province=HCM&amenities=GPS&amenities=BLUETOOTH&instantBook=true&seats=7' +
        '&startAt=2026-12-01T01%3A00%3A00.000Z',
    );
  });

  it('leaves out the question mark when there is no query', () => {
    expect(apiUrl('http://api:4000', '/auth/me', { q: undefined })).toBe(
      'http://api:4000/api/v1/auth/me',
    );
  });
});

describe('sendRequest', () => {
  it('sends JSON and parses the JSON answer', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'b1' }));

    await expect(sendRequest('', '/bookings', { method: 'POST', body: { a: 1 } })).resolves.toEqual(
      { id: 'b1' },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/bookings');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('sends no body or content type on GET', async () => {
    fetchMock.mockResolvedValueOnce(json(200, []));
    await sendRequest('', '/cars');
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(sendRequest('', '/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns the API error body into ApiRequestError', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Dữ liệu không hợp lệ.',
        details: [{ path: 'email', message: 'Email không hợp lệ.' }],
      }),
    );

    const error = await caught(sendRequest('', '/auth/register', { method: 'POST', body: {} }));
    expect(error.status).toBe(400);
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.message).toBe('Dữ liệu không hợp lệ.');
    expect(error.details).toEqual([{ path: 'email', message: 'Email không hợp lệ.' }]);
    expect(error.isClientError).toBe(true);
  });

  it('gives a generic Vietnamese message when the error body is not the API shape', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = await caught(sendRequest('', '/cars'));
    expect(error.status).toBe(502);
    expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(error.isClientError).toBe(false);
    expect(error.message).toMatch(/thử lại/);
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await caught(sendRequest('', '/cars'));
    expect(error.status).toBe(0);
    expect(error.code).toBe(ClientErrorCode.NETWORK_ERROR);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('rethrows aborts untouched', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);

    await expect(sendRequest('', '/cars', { signal: controller.signal })).rejects.toBe(abort);
  });

  it('reports a 2xx body that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    const error = await caught(sendRequest('', '/cars'));
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });
});

describe('errorMessage', () => {
  it('uses the API message and hides anything else', () => {
    expect(errorMessage(new ApiRequestError(409, 'CONFLICT', 'Xe đã có người đặt.'))).toBe(
      'Xe đã có người đặt.',
    );
    expect(errorMessage(new Error('Cannot read properties of undefined'))).toBe(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
  });
});
