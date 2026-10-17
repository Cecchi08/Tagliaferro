// Production must provide the public API origin at build time. Localhost is
// only a development fallback, never silently baked into a production build.
const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '');
if (import.meta.env.PROD && !API) {
  throw new Error('Falta VITE_API_URL: configurá el origen HTTPS del backend en el proyecto Vercel del frontend.');
}
let csrfToken = '';
export function setCsrfToken(token: string) { csrfToken = token; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (csrfToken && options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'No se pudo completar la solicitud.');
  return body as T;
}
