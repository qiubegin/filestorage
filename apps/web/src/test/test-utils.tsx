import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import App from '../App';

export interface MockResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

export function createFetchMock(handler: (url: string, init?: RequestInit) => MockResponse | Error) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const result = handler(url, init);
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve({
      ok: result.ok,
      status: result.status,
      json: async () => result.body,
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

export const directory = (id: string, name: string, parentId: string) => ({
  id,
  name,
  parentId,
  createdAt: '',
  updatedAt: '',
});

export const fileEntry = (id: string, name: string, latestVersion: number) => ({
  id,
  name,
  latestVersion,
  size: 5,
  mimeType: 'text/plain',
  updatedAt: '2026-08-12T10:00:00.000Z',
});

export const emptyRootContent = {
  directory: directory('root', 'root', 'root'),
  subdirectories: [],
  files: [],
};

export const rootOnlyTree = {
  directories: [directory('root', 'root', 'root')],
};