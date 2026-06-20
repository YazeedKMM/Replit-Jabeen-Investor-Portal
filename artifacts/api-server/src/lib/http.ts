/**
 * Lightweight HTTP error helpers shared across route handlers.
 *
 * Throwing an `HttpError` from any (async) handler is caught by Express 5's
 * automatic promise-rejection forwarding and translated to a JSON response by
 * the global error handler in app.ts.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Parse a numeric route param. Throws a 404 HttpError for non-numeric input so
 * malformed URLs (e.g. /projects/abc) return a clean 404 instead of crashing on
 * a `NaN` database query.
 */
export function parseId(raw: string | string[]): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!/^\d+$/.test(value ?? "")) {
    throw new HttpError(404, "Not found");
  }
  return parseInt(value, 10);
}
