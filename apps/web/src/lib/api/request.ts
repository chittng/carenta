import { ErrorCode } from '@carenta/shared';

import { ApiRequestError, errorFromResponse, networkError } from './errors';

/** Path prefix of every API route; also what the web app proxies to the API. */
export const API_PREFIX = '/api/v1';

type QueryValue = string | number | boolean | Date | null | undefined;

/** Query parameters. Arrays repeat the key (`?amenities=a&amenities=b`); empty values are dropped. */
export type Query = Record<string, QueryValue | readonly QueryValue[]>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  /** Sent as JSON. */
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /** Extra `fetch` options, e.g. Next's `{ next: { revalidate } }` on the server. */
  init?: RequestInit;
}

function queryString(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const values: readonly QueryValue[] = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      params.append(key, value instanceof Date ? value.toISOString() : String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** `/cars` + query → `/api/v1/cars?...`, relative to `baseUrl` (empty in the browser). */
export function apiUrl(baseUrl: string, path: string, query?: Query): string {
  return `${baseUrl}${API_PREFIX}${path}${queryString(query)}`;
}

/**
 * One HTTP call to the API: JSON in and out, `ApiRequestError` on failure. Retrying after an
 * expired session is the browser client's job, not this function's.
 */
export async function sendRequest<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, body, headers, signal, init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(apiUrl(baseUrl, path, query), {
      ...init,
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // Let TanStack Query and callers see their own cancellations as such.
    if (signal?.aborted) throw error;
    throw networkError(error);
  }

  if (!response.ok) throw await errorFromResponse(response);
  // 204 and other empty answers read as ''.
  const text = await response.text();
  try {
    // Response types come from @carenta/shared and the API is trusted to honour them; this
    // is the client's one unchecked cast.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (text === '' ? undefined : JSON.parse(text)) as T;
  } catch (error) {
    throw new ApiRequestError(
      response.status,
      ErrorCode.INTERNAL_ERROR,
      'Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.',
      [],
      { cause: error },
    );
  }
}
