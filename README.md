# jacky-proxy

[![npm version](https://img.shields.io/npm/v/jacky-proxy.svg)](https://www.npmjs.com/package/jacky-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

通用 Mock 服务器 - 适用于任意网站的 HTTP 请求拦截和 Mock 响应系统。

## ✨ 特性

- 🚀 **零配置启动**：支持直接启动 Raw 文件夹，自动转换后启动
- 🎯 **智能匹配**：根据请求参数智能匹配对应的 Mock 响应
- 🔧 **配置驱动**：完全配置化，适用于任意网站
- 📦 **接口识别**：支持多种接口识别策略（URL、请求头、请求体等）
- 🎨 **Web 管理界面**：提供可视化的接口管理界面
- 🔄 **动态场景切换**：支持接口级别的场景切换
- 📝 **TypeScript 支持**：原生支持 TypeScript Mock 文件

## 📦 安装

```bash
npm install -g jacky-proxy
```

或作为项目依赖安装：

```bash
npm install jacky-proxy
```

## 🚀 快速开始

### 方式一：直接启动 Raw 文件夹（推荐）

如果你有 Proxyman 导出的 Raw 文件夹（以 `.folder` 结尾），可以直接启动：

```bash
# 直接启动 Raw 文件夹，自动转换后启动
jacky-proxy start Raw_01-06-2026-00-38-22.folder

# 指定场景名称和目标文件夹
jacky-proxy start Raw_01-06-2026-00-38-22.folder -s "场景1" -t "mocks/test-folder"

# 忽略某些接口
jacky-proxy start Raw_01-06-2026-00-38-22.folder --ignore "saveLogInfo,commonQueryCommentSummary"
```

### 方式二：先转换再启动

```bash
# 1. 从 Raw 文件夹生成 Mock 数据（交互式模式）
jacky-proxy migrate

# 或使用命令行模式
jacky-proxy migrate -s "场景1" -t "mocks/test-folder" -r "Raw_01-06-2026-00-38-22.folder"

# 2. 启动服务器（使用自动生成的场景 ID）
jacky-proxy start 1
```

### 方式三：使用已有的 base-data + mocks 结构

```bash
# 直接启动，使用场景 ID
jacky-proxy start 1

# 指定端口
jacky-proxy start 1 -p 5000
```

## 📖 使用指南

### 项目结构

```
jacky-proxy/                    # 项目根目录（npm 包）
├── server.js                    # 主服务器文件
├── bin/                         # CLI 命令入口
├── src/                         # 命令实现
├── utils/                       # 工具函数
└── ...

工作目录（用户项目）            # 用户运行命令的目录
├── proxy.config.json            # 接口集配置（自动生成）
├── config/
│   └── match-rules.json        # 匹配规则配置（自动生成）
├── base-data/                   # Mock 数据存储目录
│   └── {interfaceName}/
│       ├── 场景1-1.json
│       └── 场景1-1-request.json
└── mocks/                       # Mock 文件目录
    └── {folder}/
        └── {interfaceName}.mock.ts
```

### 配置文件

#### proxy.config.json

接口集配置文件，用于存储所有包含 Mock 文件的文件夹配置：

```json
{
  "libraryId": 2773,
  "folders": {
    "list": [
      {
        "id": 1,
        "path": "mocks/test-folder",
        "name": "场景1"
      }
    ]
  }
}
```

**生成配置**：

```bash
# 自动扫描并生成配置
jacky-proxy config generate

# 验证配置
jacky-proxy config validate

# 合并新发现的文件夹到现有配置
jacky-proxy config merge
```

#### config/match-rules.json

匹配规则配置文件，用于过滤请求中的随机参数。**此文件在工作目录自动生成**，无需手动创建：

```json
{
  "global": {
    "ignoreProps": [
      "timestamp",
      "traceId",
      "clientInfo"
    ]
  },
  "interfaces": [
    {
      "interfaceName": "productSearch",
      "ignoreProps": ["location", "client_locatedDistrictId"],
      "deepIgnore": true
    }
  ]
}
```

**管理匹配规则**：

```bash
# 列出所有规则
jacky-proxy rules list

# 添加规则
jacky-proxy rules add -i productSearch --ignore "location,clientInfo"

# 删除规则
jacky-proxy rules remove -i productSearch

# 测试规则
jacky-proxy rules test -i productSearch -r request.json
```

### 创建 Mock 文件

在 `mocks/` 目录下创建 `.mock.ts` 文件，例如 `productSearch.mock.ts`：

```typescript
// 从 base-data 导入请求和响应数据
import response1 from '../base-data/productSearch/场景1.json';
import request1 from '../base-data/productSearch/场景1-request.json';

const requestList = [request1];
const responseList = [response1];

import { matchResponse } from '../utils/common/match-response';

// 直接导出异步函数
export default async (request) => {
  const response = matchResponse(request, requestList, responseList, {
    interfaceName: 'productSearch',  // 从文件名提取
    deepIgnore: true
  });
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: response,
  };
};
```

**重要**：文件名 `productSearch.mock.ts` 会自动提取为接口标识符 `productSearch`。

### 配置 Proxyman

在 Proxyman 的脚本配置中使用以下代码：

```javascript
async function onRequest(context, url, request) {
  // 转发到本地服务器
  request.scheme = 'http';
  request.host = 'localhost';
  request.port = 5000;  // 默认端口 5000
  
  return request;
}
```

## 📚 CLI 命令

### migrate

从 Raw 文件夹生成 Mock 数据文件：

```bash
# 交互式模式（推荐）
jacky-proxy migrate

# 命令行模式
jacky-proxy migrate -s "场景1" -t "mocks/test-folder" -r "Raw_01-06-2026-00-38-22.folder"

# 忽略某些接口
jacky-proxy migrate --ignore "saveLogInfo,commonQueryCommentSummary"
```

**选项**：
- `-s, --scenario <name>`: 场景名称（默认：场景1）
- `-t, --target <path>`: 目标文件夹路径（默认：mocks/test-folder）
- `-r, --raw <path>`: Raw 文件夹路径（可选，会自动检测）
- `--ignore <interfaces>`: 要忽略的接口（逗号分隔）
- `-i, --interactive`: 交互式模式（默认开启）
- `--no-interactive`: 禁用交互式模式

### start

启动 Mock 服务器：

```bash
# 启动已有的场景（通过 ID）
jacky-proxy start 1

# 直接启动 Raw 文件夹（自动转换后启动）
jacky-proxy start Raw_01-06-2026-00-38-22.folder

# 指定端口
jacky-proxy start 1 -p 5000

# 启动 Raw 文件夹并指定场景名称
jacky-proxy start Raw_01-06-2026-00-38-22.folder -s "场景1" -t "mocks/test-folder"

# 开启 Debug 模式
jacky-proxy start 1 --debug
```

**选项**：
- `-p, --port <port>`: 监听端口（默认：5001）
- `-m, --mock-id <id>`: 接口集 ID（如果未在命令中指定）
- `-c, --config <path>`: 配置文件路径（默认：proxy.config.json）
- `-s, --scenario <name>`: 场景名称（当启动 Raw 文件夹时使用）
- `-t, --target <path>`: 目标文件夹路径（当启动 Raw 文件夹时使用）
- `--ignore <interfaces>`: 要忽略的接口（逗号分隔）
- `--no-migrate`: 不自动迁移，直接启动
- `--debug`: 开启 Debug 模式，输出详细的请求日志

### config

管理接口集配置：

```bash
# 生成配置
jacky-proxy config generate

# 验证配置
jacky-proxy config validate

# 合并配置
jacky-proxy config merge
```

### rules

管理匹配规则配置：

```bash
# 列出所有规则
jacky-proxy rules list

# 添加规则
jacky-proxy rules add -i productSearch --ignore "location,clientInfo"

# 删除规则
jacky-proxy rules remove -i productSearch

# 测试规则
jacky-proxy rules test -i productSearch -r request.json
```

## 🎯 核心概念

### 接口标识符

接口标识符用于识别和匹配 Mock 文件。系统支持多种识别策略：

- **URL 路径模式**：从 URL 中提取（最常用）
- **请求头**：从请求头中提取
- **请求体**：从请求体中提取
- **查询参数**：从查询参数中提取
- **自定义函数**：使用自定义逻辑提取

默认策略：
1. 从 URL 最后一段提取（如 `/api/productSearch` -> `productSearch`）
2. 从请求头 `X-Interface-Name` 提取

### 匹配规则

匹配规则用于过滤请求中的随机参数，确保匹配的准确性：

- **全局规则**：所有接口都会应用的规则
- **接口规则**：针对特定接口的规则
- **深度忽略**：递归删除嵌套属性

### 接口集

一个接口集（folder）包含多个 Mock 文件，通过 `proxy.config.json` 配置。启动时通过 `jacky-proxy start <mockId>` 指定要使用的接口集。

## 🌐 Web 管理界面

启动服务器后，访问 `http://localhost:5001/mock-admin` 可以：

- 查看所有可用的接口集
- 切换接口集（mockId）
- 查看和管理接口场景
- 启用/禁用接口
- 动态切换接口场景

## 🔧 高级配置

### 自定义接口识别策略

在 `server.js` 中修改 `interfaceIdentifierConfig`：

```javascript
const interfaceIdentifierConfig = {
  strategies: [
    {
      type: 'urlPattern',
      pattern: '/api/v1/([^/]+)',
      group: 1,
      description: '从 /api/v1/ 路径提取接口名'
    },
    {
      type: 'header',
      key: 'X-API-Name',
      description: '从请求头提取'
    }
  ]
};
```

### 匹配规则选项

```json
{
  "interfaces": [
    {
      "interfaceName": "productSearch",
      "ignoreProps": ["location"],
      "essentialProps": ["destination", "keyword"],
      "deepIgnore": true,
      "sortProps": [
        {
          "prop": "districtInfo",
          "compareKey": "key"
        }
      ]
    }
  ]
}
```

**选项说明**：
- `ignoreProps`: 要忽略的属性列表（会被过滤掉）
- `essentialProps`: 必需属性（即使在其他忽略列表中也会保留）
- `deepIgnore`: 是否深度忽略（递归删除嵌套属性）
- `sortProps`: 数组排序配置

## 📝 注意事项

1. Mock 文件名会自动提取为接口标识符（去掉 `.mock.ts` 后缀）
2. 确保 `base-data` 目录中的请求和响应数据格式正确
3. 匹配规则配置需要与接口名称对应
4. 接口识别策略需要根据实际接口格式配置

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT

## 🔗 相关链接

- [GitHub Repository](https://github.com/wangjs-jacky/jacky-proxy)
- [npm Package](https://www.npmjs.com/package/jacky-proxy)
