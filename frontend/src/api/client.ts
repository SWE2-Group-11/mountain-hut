const BASE_URL = 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, 'method' | 'body'>;

async function handleResponse(response: Response) {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      data?.message || data?.error || response.statusText || 'An error occurred';
    throw new ApiError(response.status, message);
  }

  return data;
}

async function request(
  method: string,
  endpoint: string,
  body?: unknown,
  options: RequestOptions = {},
) {
  const { headers, ...rest } = options;
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...rest,
    method,
    credentials: 'include', // keep the session cookie
    headers: {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string> | undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse(response);
}

export const apiClient = {
  get: (endpoint: string, options?: RequestOptions) =>
    request('GET', endpoint, undefined, options),

  post: (endpoint: string, body?: unknown, options?: RequestOptions) =>
    request('POST', endpoint, body, options),

  delete: (endpoint: string, options?: RequestOptions) =>
    request('DELETE', endpoint, undefined, options),
};