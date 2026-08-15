import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  createFetchMock,
  directory,
  emptyRootContent,
  fileEntry,
  renderApp,
  rootOnlyTree,
  type FetchCall,
} from './test/test-utils';

const treeWithDirB = {
  directories: [
    directory('root', 'root', 'root'),
    directory('dir-b-id', 'dir-b', 'root'),
  ],
};

const rootWithFile = {
  directory: directory('root', 'root', 'root'),
  subdirectories: [directory('dir-a-id', 'dir-a', 'root')],
  files: [fileEntry('file-1', 'a.txt', 2)],
};

function jsonCall(calls: FetchCall[], urlSuffix: string, method = 'POST') {
  return calls.find((c) => c.url.endsWith(urlSuffix) && c.init?.method === method);
}

describe('工作台 API 交互', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('新建文件夹：POST 请求体正确、成功后刷新目录并关闭弹窗', async () => {
    let contentCalls = 0;
    const { calls } = createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        contentCalls += 1;
        return {
          ok: true,
          status: 200,
          body:
            contentCalls === 1
              ? emptyRootContent
              : {
                  ...emptyRootContent,
                  subdirectories: [directory('d1', 'new-dir', 'root')],
                },
        };
      }
      if (url.endsWith('/api/directories') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          body: directory('d1', 'new-dir', 'root'),
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('此目录为空');

    fireEvent.click(screen.getByRole('button', { name: /新建文件夹/ }));
    const input = await screen.findByPlaceholderText('文件夹名称');
    fireEvent.change(input, { target: { value: 'new-dir' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByText('new-dir')).toBeInTheDocument();
    const post = jsonCall(calls, '/api/directories');
    expect(post).toBeDefined();
    expect(post!.init!.method).toBe('POST');
    expect(post!.init!.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(post!.init!.body))).toEqual({ name: 'new-dir', parentId: 'root' });
    expect(contentCalls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByPlaceholderText('文件夹名称')).not.toBeInTheDocument();
  });

  it('新建文件夹：409 冲突在弹窗中展示且弹窗不关闭', async () => {
    createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: emptyRootContent };
      }
      if (url.endsWith('/api/directories') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          body: { error: { code: 'CONFLICT', message: '同级目录已存在同名目录' } },
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('此目录为空');
    fireEvent.click(screen.getByRole('button', { name: /新建文件夹/ }));
    fireEvent.change(await screen.findByPlaceholderText('文件夹名称'), { target: { value: 'dup' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByText('同级目录已存在同名目录')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('文件夹名称')).toBeInTheDocument();
  });
  it('上传：FormData 携带 directoryId 与文件，成功结果通过 toast 展示', async () => {
    let contentCalls = 0;
    const { calls } = createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        contentCalls += 1;
        return {
          ok: true,
          status: 200,
          body:
            contentCalls === 1
              ? emptyRootContent
              : {
                  ...emptyRootContent,
                  files: [fileEntry('f1', 'a.txt', 2)],
                },
        };
      }
      if (url.endsWith('/api/files/upload') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          body: {
            results: [
              { originalName: 'a.txt', status: 'created', fileId: 'f1', version: 1 },
              { originalName: 'a.txt', status: 'versioned', fileId: 'f1', version: 2 },
            ],
          },
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('此目录为空');
    fireEvent.click(screen.getByRole('button', { name: /上传文件/ }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const file = new File(['content'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    fireEvent.click(screen.getByRole('button', { name: '上传' }));

    expect(await screen.findByText('上传完成：新增 1 个文件，1 个文件生成新版本')).toBeInTheDocument();
    const upload = jsonCall(calls, '/api/files/upload');
    expect(upload).toBeDefined();
    expect(upload!.init!.method).toBe('POST');
    const form = upload!.init!.body as FormData;
    expect(form.get('directoryId')).toBe('root');
    const uploaded = form.getAll('files') as File[];
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].name).toBe('a.txt');
    expect(contentCalls).toBeGreaterThanOrEqual(2);
  });

  it('上传：失败结果在弹窗内可见且弹窗不关闭', async () => {
    createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: emptyRootContent };
      }
      if (url.endsWith('/api/files/upload') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          body: {
            results: [{ originalName: 'c.txt', status: 'failed', error: '名称不能包含 /、\\ 或空字符' }],
          },
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('此目录为空');
    fireEvent.click(screen.getByRole('button', { name: /上传文件/ }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [new File(['x'], 'c.txt', { type: 'text/plain' })],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.click(screen.getByRole('button', { name: '上传' }));

    expect(await screen.findByText(/1 个文件上传失败/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('版本弹窗：展示 v1/v2 且下载链接指向指定版本', async () => {
    createFetchMock((url) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: rootWithFile };
      }
      if (url.includes('/api/files/file-1/versions')) {
        return {
          ok: true,
          status: 200,
          body: {
            file: { id: 'file-1', name: 'a.txt', directoryId: 'root' },
            versions: [
              { id: 'v2', version: 2, size: 5, mimeType: 'text/plain', createdAt: '2026-08-12T10:00:00.000Z' },
              { id: 'v1', version: 1, size: 5, mimeType: 'text/plain', createdAt: '2026-08-12T10:00:00.000Z' },
            ],
          },
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('a.txt');
    fireEvent.click(screen.getByRole('button', { name: '版本' }));

    expect(await screen.findByText('版本历史：a.txt')).toBeInTheDocument();
    expect(await screen.findByText('v2')).toBeInTheDocument();
    expect(await screen.findByText('v1')).toBeInTheDocument();
    const links = Array.from(document.querySelectorAll('a[href*="/download"]')).map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('/api/files/file-1/download?version=1');
    expect(links).toContain('/api/files/file-1/download?version=2');
  });
  it('移动：目录树加载、当前目录禁用、POST move 请求体正确', async () => {
    const { calls } = createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: treeWithDirB };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: rootWithFile };
      }
      if (url.endsWith('/api/files/file-1/move') && init?.method === 'POST') {
        return { ok: true, status: 200, body: { fileId: 'file-1', directoryId: 'dir-b-id' } };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('a.txt');
    fireEvent.click(screen.getByRole('button', { name: '移动' }));

    expect(await screen.findByText('移动文件')).toBeInTheDocument();
    expect(screen.getByText('dir-b')).toBeInTheDocument();
    expect(screen.getByTitle('不能移动到当前目录')).toBeDisabled();

    fireEvent.click(screen.getByText('dir-b'));
    fireEvent.click(screen.getByRole('button', { name: '移动到此文件夹' }));

    await waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/api/files/file-1/move'))).toBe(true);
    });
    const move = jsonCall(calls, '/api/files/file-1/move');
    expect(move).toBeDefined();
    expect(move!.init!.method).toBe('POST');
    expect(JSON.parse(String(move!.init!.body))).toEqual({ targetDirectoryId: 'dir-b-id' });
  });

  it('移动：409 冲突消息在弹窗内展示且弹窗保持打开', async () => {
    createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: treeWithDirB };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: rootWithFile };
      }
      if (url.endsWith('/api/files/file-1/move') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          body: { error: { code: 'CONFLICT', message: '目标目录已存在同名文件' } },
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('a.txt');
    fireEvent.click(screen.getByRole('button', { name: '移动' }));
    await screen.findByText('移动文件');
    fireEvent.click(screen.getByText('dir-b'));
    fireEvent.click(screen.getByRole('button', { name: '移动到此文件夹' }));

    expect(await screen.findByText('目标目录已存在同名文件')).toBeInTheDocument();
    expect(screen.getByText('移动文件')).toBeInTheDocument();
  });

  it('文件删除：二次确认后调用 DELETE 并刷新目录', async () => {
    let contentCalls = 0;
    const { calls } = createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        contentCalls += 1;
        return {
          ok: true,
          status: 200,
          body: contentCalls === 1 ? rootWithFile : emptyRootContent,
        };
      }
      if (url.endsWith('/api/files/file-1') && init?.method === 'DELETE') {
        return { ok: true, status: 200, body: { fileId: 'file-1', deleted: true, deletedVersions: 2 } };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('a.txt');
    const fileRow = screen.getByText('a.txt').closest('div[class*="hover:bg-muted"]') as HTMLElement;
    fireEvent.click(within(fileRow).getByRole('button', { name: '删除' }));
    expect(await screen.findByText('确认删除文件')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(await screen.findByText('此目录为空')).toBeInTheDocument();
    expect(await screen.findByText(/已删除文件/)).toBeInTheDocument();
    const del = jsonCall(calls, '/api/files/file-1', 'DELETE');
    expect(del).toBeDefined();
    expect(del!.init!.method).toBe('DELETE');
  });

  it('目录删除：二次确认后调用 DELETE（204），成功后刷新', async () => {
    let contentCalls = 0;
    const { calls } = createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        contentCalls += 1;
        return {
          ok: true,
          status: 200,
          body:
            contentCalls === 1
              ? {
                  ...emptyRootContent,
                  subdirectories: [directory('dir-a-id', 'dir-a', 'root')],
                }
              : emptyRootContent,
        };
      }
      if (url.endsWith('/api/directories/dir-a-id') && init?.method === 'DELETE') {
        return { ok: true, status: 204, body: undefined };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('dir-a');
    const dirRow = screen.getByText('dir-a').closest('div[class*="hover:bg-muted"]') as HTMLElement;
    fireEvent.click(within(dirRow).getByRole('button', { name: '删除' }));
    expect(await screen.findByText('确认删除文件夹')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(await screen.findByText('此目录为空')).toBeInTheDocument();
    const del = jsonCall(calls, '/api/directories/dir-a-id', 'DELETE');
    expect(del).toBeDefined();
    expect(del!.init!.method).toBe('DELETE');
  });

  it('删除非空目录：409 错误通过 toast 展示', async () => {
    createFetchMock((url, init) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: rootOnlyTree };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return {
          ok: true,
          status: 200,
          body: {
            ...emptyRootContent,
            subdirectories: [directory('dir-a-id', 'dir-a', 'root')],
          },
        };
      }
      if (url.endsWith('/api/directories/dir-a-id') && init?.method === 'DELETE') {
        return {
          ok: false,
          status: 409,
          body: { error: { code: 'NOT_EMPTY', message: '目录非空，无法删除' } },
        };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();
    await screen.findByText('dir-a');
    const dirRow = screen.getByText('dir-a').closest('div[class*="hover:bg-muted"]') as HTMLElement;
    fireEvent.click(within(dirRow).getByRole('button', { name: '删除' }));
    await screen.findByText('确认删除文件夹');
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(await screen.findByText('目录非空，无法删除')).toBeInTheDocument();
  });
});