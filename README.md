# Web 文件仓库

pnpm workspace Monorepo 全栈项目：多级目录 + 逻辑文件 + 文件版本（同目录同名上传自动生成历史版本）的本地文件仓库，已通过真实集成测试与浏览器端到端验收。

## 技术栈

- Node.js >= 24、TypeScript、pnpm >= 10
- 前端：React + Vite + Tailwind CSS + shadcn/ui + TanStack Query
- 后端：Express + Multer + SQLite + Prisma
- 测试：Vitest + React Testing Library + Supertest

## 目录结构与模块职责

```text
.
├── apps/api                # Express 后端
│   ├── prisma              # schema 与 migrations（Prisma SQLite）
│   ├── src/routes          # directories.ts / files.ts：全部 API 路由
│   ├── src/storage         # StorageAdapter 接口 + LocalStorageAdapter
│   ├── src/lib             # 错误中间件、ID/名称校验、根目录初始化
│   └── src/test            # 测试基础设施（独立临时库与存储）
├── apps/web                # React 前端工作台
│   ├── src/api             # fetch client、类型、TanStack Query hooks
│   ├── src/components      # 工作台、面包屑、上传/版本/移动/删除/新建弹窗、toast
│   └── src/lib             # 格式化、面包屑链构建
└── packages/shared         # 前后端共享常量与类型（健康检查、默认端口）
```

职责边界：后端路由只依赖 `StorageAdapter` 接口与 Prisma，不直接操作文件系统路径；前端全部通过真实 API 交互，无静态假数据。

## 安装与初始化

```bash
pnpm install
pnpm db:init
```

- `pnpm db:init` 通过 `prisma migrate deploy` 将 `apps/api/prisma/migrations` 应用到 `apps/api/.env` 中的 `DATABASE_URL`（默认 `apps/api/data/zhishu.db`）。
- 首次使用请复制 `apps/api/.env.example` 为 `apps/api/.env`（仓库已提供本地默认值）。

## 启动方式

```bash
pnpm dev
```

- 前端：http://localhost:5173（Vite 将 `/api` 代理到后端）
- 后端：http://localhost:3001（健康检查 GET /api/health）

## 数据模型与唯一约束

- `Directory`：`id`（根目录固定 `root` 且 `parentId` 指向自身）、`name`、`parentId`、`createdAt`、`updatedAt`；`@@unique([parentId, name])`。
- `File`：逻辑文件，不保存版本内容；`id`、`name`、`directoryId`、`createdAt`、`updatedAt`；`@@unique([directoryId, name])`。
- `FileVersion`：`id`、`fileId`、`version`、`storageKey`（唯一）、`size`、`mimeType`、`createdAt`；`@@unique([fileId, version])`；删除 `File` 时版本元数据级联删除（`onDelete: Cascade`）。
- 根目录由 `ensureRootDirectory` 在应用启动与测试初始化时幂等创建。
- 目录名/文件名采用**大小写敏感**策略（SQLite UNIQUE 约束按字节比较）：`Foo.txt` 与 `foo.txt` 视为不同文件。

## 完整 API

统一错误响应：`{ "error": { "code", "message" } }`。

### 目录

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/directories/tree` | 返回全部目录扁平列表（`id/name/parentId`），供前端移动目标选择 |
| GET | `/api/directories/:id/content` | 当前目录 + 直接子目录 + 文件列表（仅最新版本：`latestVersion/size/mimeType/updatedAt`） |
| POST | `/api/directories` | 创建子目录 `{ name, parentId }`；同级重名 409，父目录不存在 404 |
| DELETE | `/api/directories/:id` | 删除**空**目录；成功返回 **204 无响应体**；root 返回 400（`ROOT_DIRECTORY`），非空返回 409（`NOT_EMPTY`），不存在 404 |

### 文件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/files/upload` | multipart：`directoryId` + `files`（最多 20 个、单文件 ≤50MB）；逐项返回 `created \| versioned \| failed`；无文件 400、目录不存在 404、超限 413/400 |
| GET | `/api/files/:fileId/versions` | 按版本号倒序返回历史版本 |
| GET | `/api/files/:fileId/download?version=N` | 未传 `version` 下载最新；指定版本不存在 404；中文文件名使用 `filename*=UTF-8''` |
| POST | `/api/files/:fileId/move` | `{ targetDirectoryId }`；数据库事务内完成；目标已有同名文件 409 且双方数据不变 |
| DELETE | `/api/files/:fileId` | 删除逻辑文件全部版本元数据与对应物理文件 |

### 错误码

- `400`：`INVALID_NAME`、`INVALID_ID`、`NO_FILES`、`TOO_MANY_FILES`、`INVALID_VERSION`、`INVALID_JSON`、`ROOT_DIRECTORY`、`MULTIPART_ERROR`
- `404`：`NOT_FOUND`、`VERSION_NOT_FOUND`
- `409`：`CONFLICT`、`NOT_EMPTY`
- `413`：`FILE_TOO_LARGE`
- `500`：`INTERNAL_ERROR`、`STORAGE_DELETE_FAILED`、`STORAGE_MISSING`

## 删除规则与失败边界

- 目录删除：仅允许删除空目录；root 不可删除（400）、非空目录（含子目录或文件）返回 409、成功返回 204。
- 文件删除顺序：**先在数据库事务内删除元数据（File 级联删除 FileVersion），再删除物理文件**。
  - 物理文件删除失败时返回 `500 STORAGE_DELETE_FAILED` 并记录明确错误，不伪装删除成功；此时元数据已删除、失败对应的物理文件保留。
  - 物理文件已不存在（ENOENT）视为目标已达成，记录警告并继续。
- 上传顺序：**先保存物理文件，再创建元数据**；元数据创建失败会尽力删除刚写入的物理文件，避免孤儿文件。

## 本地存储与替换 StorageAdapter

- 存储目录由 `STORAGE_DIR` 环境变量控制（默认 `./storage`，相对 api 包根目录，启动自动创建）。
- `storageKey` 由服务端 `randomUUID()` 生成，绝不使用用户文件名拼接物理路径；`LocalStorageAdapter` 同时校验 storageKey 格式与解析路径不越出存储根目录。
- 业务路由只依赖 `StorageAdapter`（`save/read/delete`）。替换 S3 / OSS / Git 时实现该接口并注入 `createApp` 即可，版本/目录核心逻辑与 API 契约不变。

## 版本与移动语义

- 同目录同名上传只新增 `FileVersion`（版本号 +1），不新增逻辑文件；不同目录允许同名文件。
- 移动只作用于文件；全部历史版本随逻辑文件迁移；移动不产生新版本；目标目录已有同名文件返回 409 且源/目标数据均不变。
- 名称校验：trim 后非空、最大 255 字符、禁止 `/`、`\` 与空字符；路径参数 ID 校验 `root` / cuid / UUID 格式与长度。
- multipart 文件名按 latin1 修复为 UTF-8，中文文件名不乱码。

## 测试

后端测试每个 worker 使用独立临时 SQLite 库（`prisma migrate deploy` 建表）与独立临时存储目录，不污染开发库/开发存储。

```bash
pnpm test
```

覆盖：根目录初始化、多级目录、同名冲突、v1/v2 版本递增、不同目录同名、下载内容与历史版本、版本倒序、移动可见性/历史/内容不变、移动冲突 409 双方不变、删除后物理文件清理（从数据库读取 storageKey 断言文件不存在）、物理删除失败边界（500 + 元数据已删 + 失败文件保留）、目录删除 204/400/409/404、中文文件名、重建连接后的持久化、前端各交互的真实请求断言（路径/方法/请求体/FormData/下载链接/二次确认/错误展示）。

## 已实现、未实现与主动简化

**已实现**：目录/文件/版本数据模型与迁移、本地存储抽象、完整 API、统一错误中间件、真实前端工作台（目录列表、面包屑、新建/上传/版本/移动/删除弹窗、toast 提示、二次确认）、后端与前端测试。

**未实现（题外，明确不做）**：登录认证、分享链接、在线预览、重命名、拖拽上传、文件夹移动、递归删除、分片上传、OSS/S3 实际接入。

**主动简化**：无用户系统（单用户本地仓库）；上传走内存缓冲（单文件 50MB 上限内可接受）；移动弹窗以扁平目录树渲染；删除目录接口本阶段仅支持空目录。

## 若再增加两小时，优先改进

1. 上传进度与流式写入（内存缓冲 → 临时文件流式落盘，降低大文件内存占用）。
2. 并发一致性加固：上传同名并发冲突的自动化并发测试与友好重试。
3. 前端体验：文件大小/类型预览、移动后自动定位目标目录、错误 toast 可重试。
4. 数据备份：SQLite 备份与 storage 一致性巡检脚本。
5. 接入对象存储的 `StorageAdapter` 参考实现与对应集成测试。

## 验证记录（最终验收）

在 Node v24.9.0 / pnpm 10.34.5 下真实执行：

```bash
pnpm db:init
```

结果：通过。`prisma migrate deploy` 应用迁移 `20260812115942_init_directories_files_versions`，空库从零建表成功。

```bash
pnpm test
```

结果：通过。api 3 个测试文件 35/35（health/404 语义 2、目录 12、文件 21）；web 2 个测试文件 14/14（基础渲染 4、API 交互 10）。

```bash
pnpm typecheck
```

结果：通过。shared / api / web 三包 `tsc --noEmit` 全部通过。

```bash
pnpm lint
```

结果：通过。0 错误；3 个 warning（`toast.tsx` 与两个 shadcn/ui 组件导出常量的 fast-refresh 提示）。

```bash
pnpm build
```

结果：通过。api esbuild 产出 `dist/index.js`（19.8 kB）；web Vite 构建成功（1701 模块）。