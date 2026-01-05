# 使用指南

## 项目概述

本项目是一个完全通用化的 Mock 服务器系统，根据 `universal-mock-server.mdc` 文档要求开发，完全移除了 SOA 相关代码，支持任意网站的接口匹配。

## 核心特性

### ✅ 已实现的功能

1. **通用接口识别系统**
   - 支持 URL 路径模式匹配
   - 支持请求头、请求体、查询参数提取
   - 支持自定义识别函数
   - 完全移除 SOA 相关代码

2. **配置化匹配规则**
   - 全局匹配规则配置
   - 接口级别匹配规则
   - 渠道特定规则（H5、CRN 等）
   - 支持深度忽略、排序等高级功能

3. **Mock 文件系统**
   - 从文件名自动提取接口标识符
   - 支持 TypeScript Mock 文件
   - 完全移除 @ctrip/api-mock 依赖
   - 直接导出异步函数，无需包装器

4. **请求匹配引擎**
   - 根据 payload 动态匹配
   - 支持参数过滤（忽略随机参数）
   - 支持深度比较和自定义比较逻辑

## 项目结构说明

```
jacky-proxy/
├── server.js                    # 主服务器（Express）
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── proxy.config.json      # 接口集配置
├── config/
│   └── match-rules.json         # 匹配规则配置
├── utils/
│   ├── interface-identifier.ts  # 接口识别工具
│   └── common/
│       └── match-response.ts    # 请求匹配核心函数
├── base-data/                    # Mock 数据存储
│   ├── productSearch/
│   └── getProductInfo/
└── mocks/                        # Mock 文件目录
    └── api/
        ├── productSearch.mock.ts
        └── getProductInfo.mock.ts
```

## 使用步骤

### 1. 安装依赖

```bash
cd jacky-proxy
npm install
```

### 2. 配置接口集

编辑 `proxy.config.json`：

```json
{
  "libraryId": 2773,
  "folders": {
    "list": [
      {
        "id": 1,
        "path": "mocks/api",
        "name": "API Mocks"
      }
    ]
  }
}
```

### 3. 创建 Mock 数据

在 `base-data/` 目录下创建接口数据：

```
base-data/
└── yourInterface/
    ├── 场景1.json          # 响应数据
    └── 场景1-request.json   # 请求数据
```

### 4. 创建 Mock 文件

在 `mocks/api/` 目录下创建 `.mock.ts` 文件：

```typescript
import response1 from '../../base-data/yourInterface/场景1.json';
import request1 from '../../base-data/yourInterface/场景1-request.json';

const requestList = [request1];
const responseList = [response1];

import { matchResponse } from '../../utils/common/match-response';

export default async (request) => {
  const response = matchResponse(request, requestList, responseList, {
    interfaceName: 'yourInterface',
    deepIgnore: true
  });
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: response,
  };
};
```

**重要**：文件名 `yourInterface.mock.ts` 会自动提取为接口标识符 `yourInterface`。

### 5. 配置匹配规则（可选）

编辑 `config/match-rules.json`：

```json
{
  "global": {
    "ignoreProps": ["timestamp", "traceId"]
  },
  "interfaces": [
    {
      "interfaceName": "yourInterface",
      "ignoreProps": ["randomParam"],
      "deepIgnore": true
    }
  ]
}
```

### 6. 启动服务器

```bash
# 使用接口集 ID 1
npm run start 1

# 开发模式（自动重启）
npm run dev 1
```

服务器将在 `http://localhost:5000` 启动。

### 7. 配置 Proxyman

在 Proxyman 的脚本配置中添加：

```javascript
async function onRequest(context, url, request) {
  request.scheme = 'http';
  request.host = 'localhost';
  request.port = 5000;
  return request;
}
```

## 接口识别配置

### 默认策略

系统默认使用以下策略识别接口：

1. 从 URL 最后一段提取（如 `/api/productSearch` -> `productSearch`）
2. 从请求头 `X-Interface-Name` 提取

### 自定义策略

可以在 `server.js` 中修改 `interfaceIdentifierConfig`：

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
    },
    {
      type: 'body',
      path: 'apiName',
      description: '从请求体提取'
    },
    {
      type: 'custom',
      function: (req) => {
        // 自定义逻辑
        return req.query.action || null;
      }
    }
  ]
};
```

## 匹配规则说明

### 全局规则

所有接口都会应用的规则：

```json
{
  "global": {
    "ignoreProps": ["timestamp", "traceId", "clientInfo"]
  }
}
```

### 接口规则

针对特定接口的规则：

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

### 规则选项说明

- **ignoreProps**: 要忽略的属性列表（会被过滤掉）
- **essentialProps**: 必需属性（即使在其他忽略列表中也会保留）
- **deepIgnore**: 是否深度忽略（递归删除嵌套属性）
- **sortProps**: 数组排序配置
- **channelSpecific**: 渠道特定规则（如 H5、CRN）

## 常见问题

### 1. Mock 文件加载失败

- 确保文件扩展名为 `.mock.ts` 或 `.mock.js`
- 确保文件导出了默认函数
- 检查文件路径是否正确

### 2. 接口识别失败

- 检查 URL 格式是否符合识别策略
- 可以在 `server.js` 中添加自定义识别策略
- 查看控制台日志，了解识别过程

### 3. 匹配失败

- 检查请求数据格式是否与 Mock 数据一致
- 检查匹配规则配置是否正确
- 查看返回的错误信息，对比实际请求和 Mock 请求

### 4. TypeScript 编译错误

- 确保安装了 `ts-node` 依赖
- 检查 `tsconfig.json` 配置
- 确保所有 TypeScript 文件语法正确

## 开发建议

1. **接口标识符命名**：使用有意义的接口标识符，与 Mock 文件名保持一致
2. **匹配规则优化**：根据实际需求配置忽略属性，提高匹配准确性
3. **数据组织**：合理组织 `base-data` 目录结构，便于维护
4. **错误处理**：Mock 文件应包含适当的错误处理逻辑

## 与文档要求的对比

### ✅ 已完全实现

- [x] 完全移除 SOA 相关代码
- [x] 移除 @ctrip/api-mock 依赖
- [x] 通用接口识别系统
- [x] 配置化匹配规则
- [x] 从文件名提取接口标识符
- [x] 支持多种识别策略
- [x] 支持深度忽略、排序等高级功能

### 📝 可选扩展功能

- [ ] Web 界面管理配置
- [ ] 配置生成 API
- [ ] 请求历史记录
- [ ] 配置热重载

## 总结

本项目完全按照 `universal-mock-server.mdc` 文档要求开发，实现了通用化的 Mock 服务器系统，适用于任意网站的接口匹配需求。所有业务特定代码已移除，系统完全配置驱动。

