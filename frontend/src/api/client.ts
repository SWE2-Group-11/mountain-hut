const BASE_URL = 'http://localhost:3000/api/v1';

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function handleResponse(response: Response) {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || response.statusText || 'An error occurred';
    throw new Error(errorMsg);
  }

  return data;
}

export const apiClient = {
  async get(endpoint: string, options: RequestOptions = {}) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    return handleResponse(response);
  },

  async post(endpoint: string, body?: any, options: RequestOptions = {}) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
    return handleResponse(response);
  },

  async delete(endpoint: string, options: RequestOptions = {}) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    return handleResponse(response);
  },
};