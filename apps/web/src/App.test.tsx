import { fireEvent, screen } from '@testing-library/react';

import { createFetchMock, directory, fileEntry, renderApp } from './test/test-utils';

const rootContent = {
  directory: directory('root', 'root', 'root'),
  subdirectories: [directory('c1', 'dir-a', 'root')],
  files: [fileEntry('f1', 'a.txt', 2)],
};

const treeResponse = {
  directories: [directory('root', 'root', 'root'), directory('c1', 'dir-a', 'root')],
};

const emptyRootContent = {
  directory: directory('root', 'root', 'root'),
  subdirectories: [],
  files: [],
};

describe('工作台 App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渲染根目录的文件夹与文件列表', async () => {
    createFetchMock((url) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: treeResponse };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: rootContent };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();

    expect(await screen.findByText('dir-a')).toBeInTheDocument();
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText(/最新 v2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建文件夹/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传文件/ })).toBeInTheDocument();
  });

  it('点击文件夹进入子目录并展示面包屑', async () => {
    createFetchMock((url) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: treeResponse };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: rootContent };
      }
      if (url.includes('/api/directories/c1/content')) {
        return { ok: true, status: 200, body: emptyRootContent };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();

    fireEvent.click(await screen.findByText('dir-a'));
    expect(await screen.findByText('此目录为空')).toBeInTheDocument();
    expect(screen.getAllByText('dir-a').length).toBeGreaterThan(0);
  });

  it('空目录展示明确提示', async () => {
    createFetchMock((url) => {
      if (url.endsWith('/api/directories/tree')) {
        return { ok: true, status: 200, body: { directories: [] } };
      }
      if (url.endsWith('/api/directories/root/content')) {
        return { ok: true, status: 200, body: emptyRootContent };
      }
      return { ok: false, status: 404, body: { error: { message: 'not found' } } };
    });

    renderApp();

    expect(await screen.findByText('此目录为空')).toBeInTheDocument();
  });

  it('加载失败展示错误与重试按钮', async () => {
    createFetchMock(() => new Error('network down'));

    renderApp();

    expect(await screen.findByText(/加载失败/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});