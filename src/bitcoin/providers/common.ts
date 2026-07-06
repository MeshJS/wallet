/**
 * Shared HTTP plumbing for Bitcoin data providers.
 *
 * Providers use the platform `fetch` (Node 18+ / browsers) so the package does
 * not carry an HTTP client dependency. All non-2xx responses are normalized
 * into a `ProviderHttpError` carrying the response details.
 */

export type HttpErrorDetails = {
  status?: number;
  statusText?: string;
  body?: unknown;
  url?: string;
};

/**
 * Error thrown by provider HTTP helpers. Carries the response details so
 * callers can branch on `status` when needed.
 */
export class ProviderHttpError extends Error {
  readonly details: HttpErrorDetails;

  constructor(details: HttpErrorDetails) {
    super(JSON.stringify(details));
    this.name = "ProviderHttpError";
    this.details = details;
  }
}

/**
 * Perform a request against `baseUrl + path` and parse the response.
 * Returns parsed JSON when the response body is JSON, otherwise the raw text
 * (e.g. the plain-text txid returned by Esplora's POST /tx).
 * Throws `ProviderHttpError` on any non-2xx status.
 */
export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, init);

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length ? JSON.parse(text) : undefined;
  } catch {
    // Non-JSON body — keep the raw text.
  }

  if (!response.ok) {
    throw new ProviderHttpError({
      status: response.status,
      statusText: response.statusText,
      body,
      url,
    });
  }

  return body as T;
}
