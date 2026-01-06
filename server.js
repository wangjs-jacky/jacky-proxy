/**
 * 通用 Mock 服务器 - 主服务器文件
 * 接收 Proxyman 转发的请求，根据接口标识符匹配对应的 Mock 响应
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// 使用 ts-node 支持 TypeScript 文件
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    baseUrl: __dirname,
    paths: {
      '*': ['*', 'utils/*', 'utils/common/*']
    }
  }
});

// 设置项目根目录环境变量，供 Mock 文件使用
process.env.JACKY_PROXY_ROOT = __dirname;

const { extractInterfaceIdentifier } = require('./utils/interface-identifier');
const { matchResponse } = require('./utils/common/match-response');
const { generateConfig, validateConfig, mergeConfig } = require('./scripts/generate-config');

const app = express();
const PORT = process.env.PORT || 5001;

// 中间件：解析 JSON 和 URL 编码的请求体（必须在日志中间件之前，以便日志可以打印 body）
// 配置 strict: false 以允许控制字符（如换行符、制表符等）
app.use(express.json({ 
  limit: '50mb',
  strict: false
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// JSON 解析错误处理中间件（必须在 express.json() 之后）
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // 只在 debug 模式打印 JSON 解析错误
    const isDebugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    if (isDebugMode) {
      console.warn('⚠️  JSON 解析错误:', err.message);
      console.warn('   请求路径:', req.path);
      console.warn('   请求方法:', req.method);
    }
    // 设置空 body 并继续处理，避免中断请求
    req.body = req.body || {};
    next();
  } else {
    next(err);
  }
});

/**
 * ANSI 颜色代码
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

/**
 * 获取格式化的时间戳（带颜色）
 */
function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  return `${colors.gray}[${hours}:${minutes}:${seconds}.${milliseconds}]${colors.reset}`;
}

/**
 * 请求日志中间件
 * 必须在所有路由之前应用，确保所有请求都会被记录
 */
function requestLogger(req, res, next) {
  const isDebugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
  const method = req.method;
  const url = req.url;
  const path = req.path;

  if (isDebugMode) {
    // Debug 模式：输出详细信息
    const timestamp = new Date().toISOString();
    const fullUrl = req.originalUrl || url;
    const query = req.query;
    const headers = req.headers;
    const body = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    console.log('\n========== 请求拦截 ==========');
    console.log(`时间: ${timestamp}`);
    console.log(`方法: ${method}`);
    console.log(`URL: ${url}`);
    console.log(`完整路径: ${fullUrl}`);
    console.log(`路径: ${path}`);
    console.log(`Headers:`, JSON.stringify(headers, null, 2));
    if (Object.keys(query).length > 0) {
      console.log(`Query参数:`, JSON.stringify(query, null, 2));
    }
    if (body && Object.keys(body).length > 0) {
      console.log(`Body:`, JSON.stringify(body, null, 2));
    }
    console.log(`IP: ${ip}`);
    console.log('================================\n');
  } else {
    // 精简模式：只输出关键信息（带时间戳和颜色）
    const methodColor = method === 'GET' ? colors.cyan : method === 'POST' ? colors.blue : colors.white;
    console.log(`${getTimestamp()} ${methodColor}${method}${colors.reset} ${colors.dim}${path}${colors.reset}`);
  }

  next();
}

// 应用请求日志中间件（在所有路由之前）
app.use(requestLogger);

// 静态文件服务（Web 界面）- 放在日志中间件之后，这样静态文件请求也会被记录
app.use(express.static(path.join(__dirname, 'public')));

// 加载配置文件
let mockConfig = null;
let currentMockId = null;

/**
 * 获取工作目录（数据存储目录）
 * 如果设置了 WORK_DIR 环境变量，使用工作目录；否则使用项目根目录
 */
function getWorkDir() {
  return process.env.WORK_DIR || __dirname;
}

/**
 * 加载 proxy.config.json 配置文件
 */
function loadMockConfig() {
  try {
    // 优先使用环境变量指定的配置文件路径
    let configPath;
    if (process.env.CONFIG_PATH) {
      configPath = process.env.CONFIG_PATH;
    } else {
      // 否则使用工作目录的配置文件
      const workDir = getWorkDir();
      configPath = path.join(workDir, 'proxy.config.json');
    }
    
    // 确保路径是绝对路径
    if (!path.isAbsolute(configPath)) {
      configPath = path.resolve(configPath);
    }
    
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      mockConfig = JSON.parse(configContent);
      console.log(`✅ 已加载配置文件: ${configPath}`);
      return mockConfig;
    } else {
      console.warn(`配置文件不存在: ${configPath}`);
      if (process.env.CONFIG_PATH) {
        console.warn(`  CONFIG_PATH 环境变量: ${process.env.CONFIG_PATH}`);
      }
      if (process.env.WORK_DIR) {
        console.warn(`  WORK_DIR 环境变量: ${process.env.WORK_DIR}`);
      }
      return null;
    }
  } catch (error) {
    console.error('加载配置文件失败:', error);
    return null;
  }
}

/**
 * 根据 mockId 获取接口集路径
 */
function getMockFolderPath(mockId) {
  if (!mockConfig) {
    loadMockConfig();
  }

  if (!mockConfig || !mockConfig.folders || !mockConfig.folders.list) {
    return null;
  }

  const folder = mockConfig.folders.list.find(f => f.id === parseInt(mockId));
  if (!folder) {
    return null;
  }

  // 使用工作目录作为基础路径
  const workDir = getWorkDir();
  const folderPath = path.join(workDir, folder.path);
  
  return folderPath;
}

/**
 * 扫描目录，加载所有 .mock.ts 文件
 */
function loadMockFiles(folderPath) {
  const mockFiles = {};

  if (!fs.existsSync(folderPath)) {
    console.warn(`${colors.yellow}⚠️  接口集路径不存在:${colors.reset} ${colors.dim}${folderPath}${colors.reset}`);
    return mockFiles;
  }

  // 获取项目根目录，用于模块解析
  const projectRoot = __dirname;
  
  // 保存原始的 NODE_PATH
  const originalNodePath = process.env.NODE_PATH || '';
  
  // 将项目根目录添加到 NODE_PATH，这样 Mock 文件可以导入项目根目录的模块
  const nodePaths = originalNodePath ? originalNodePath.split(path.delimiter) : [];
  if (!nodePaths.includes(projectRoot)) {
    nodePaths.unshift(projectRoot);
    process.env.NODE_PATH = nodePaths.join(path.delimiter);
  }
  
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // 递归扫描子目录
        scanDirectory(filePath);
      } else if (file.endsWith('.mock.ts') || file.endsWith('.mock.js')) {
        // 从文件名提取接口标识符（去掉 .mock.ts 后缀）
        const interfaceName = file.replace(/\.mock\.(ts|js)$/, '');

        try {
          // 动态加载 Mock 文件
          // 注意：这里需要支持 TypeScript，可以使用 ts-node 或先编译
          delete require.cache[require.resolve(filePath)];
          const mockModule = require(filePath);
            
          // 支持 default 导出或直接导出函数
          const mockHandler = mockModule.default || mockModule;

          if (typeof mockHandler === 'function') {
            mockFiles[interfaceName] = mockHandler;
            // 保存该 handler 对应的本地文件路径（绝对路径）
            mockFilePaths[interfaceName] = filePath;
            console.log(`${colors.green}✓${colors.reset} ${colors.dim}加载 Mock 文件:${colors.reset} ${colors.cyan}${file}${colors.reset} ${colors.gray}->${colors.reset} ${colors.bright}${interfaceName}${colors.reset}`);
          } else {
            console.warn(`${colors.yellow}⚠${colors.reset} ${colors.yellow}Mock 文件 ${colors.cyan}${file}${colors.yellow} 未导出函数${colors.reset}`);
          }
        } catch (error) {
          console.error(`${colors.red}✗${colors.reset} ${colors.red}加载 Mock 文件失败:${colors.reset} ${colors.cyan}${file}${colors.reset} ${colors.red}${error.message}${colors.reset}`);
          // 打印更详细的错误信息
          if (error.code === 'MODULE_NOT_FOUND') {
            console.error(`   无法找到模块: ${error.message}`);
            console.error(`   Mock 文件路径: ${filePath}`);
            console.error(`   项目根目录: ${projectRoot}`);
          }
        }
      }
    }
  }

  try {
    scanDirectory(folderPath);
  } finally {
    // 恢复原始的 NODE_PATH
    process.env.NODE_PATH = originalNodePath;
  }
  
  return mockFiles;
}

// 缓存 Mock 文件
let cachedMockFiles = {};
let cachedMockId = null;
// 存储 mock 处理器对应的本地文件绝对路径（用于前端复制）
let mockFilePaths = {};

// 存储动态切换的场景配置（用于接口的场景切换）
// 格式: { 'getProductInfo': '2' } 表示 getProductInfo 使用 getProductInfo-2.mock.ts
let mockScenarios = {};

// 存储被禁用的接口（Set）
// 格式: Set(['getProductInfo', 'productSearch']) 表示这些接口被禁用
let disabledInterfaces = new Set();

// 文件监听器
let fileWatcher = null;

/**
 * 清除模块及其所有依赖的缓存
 */
function clearModuleCache(modulePath) {
  const resolvedPath = require.resolve(modulePath);
  
  // 清除该模块的缓存
  if (require.cache[resolvedPath]) {
    const module = require.cache[resolvedPath];
    
    // 递归清除所有子模块的缓存
    if (module.children) {
      module.children.forEach(child => {
        if (child.filename && (child.filename.endsWith('.json') || child.filename.includes('base-data'))) {
          delete require.cache[child.filename];
        }
      });
    }
    
    delete require.cache[resolvedPath];
  }
}

/**
 * 清除 base-data 目录下所有 JSON 文件的缓存
 */
function clearBaseDataCache(interfaceName) {
  const workDir = getWorkDir();
  const baseDataDir = path.join(workDir, 'base-data', interfaceName);
  
  if (fs.existsSync(baseDataDir)) {
    const files = fs.readdirSync(baseDataDir);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const jsonPath = path.join(baseDataDir, file);
        try {
          const resolvedPath = require.resolve(jsonPath);
          delete require.cache[resolvedPath];
        } catch (e) {
          // 如果文件还未被 require，忽略错误
        }
      }
    });
  }
}

/**
 * 重新加载单个 Mock 文件
 */
function reloadMockFile(filePath, interfaceName) {
  try {
    // 清除 base-data 中该接口的所有 JSON 文件缓存
    clearBaseDataCache(interfaceName);
    
    // 清除 Mock 文件及其所有依赖的缓存
    clearModuleCache(filePath);
    
    // 清除 ts-node 的编译缓存（如果存在）
    if (require.extensions['.ts']) {
      // ts-node 可能会缓存编译结果，清除相关缓存
      const tsNodeCache = require.cache;
      Object.keys(tsNodeCache).forEach(key => {
        if (key.includes(filePath) || key.includes(interfaceName)) {
          delete tsNodeCache[key];
        }
      });
    }
    
    // 重新加载
    const mockModule = require(filePath);
    const mockHandler = mockModule.default || mockModule;
    
    if (typeof mockHandler === 'function') {
      cachedMockFiles[interfaceName] = mockHandler;
      mockFilePaths[interfaceName] = filePath;
      console.log(`${colors.green}🔄${colors.reset} ${colors.dim}热更新 Mock 文件:${colors.reset} ${colors.cyan}${path.basename(filePath)}${colors.reset} ${colors.gray}->${colors.reset} ${colors.bright}${interfaceName}${colors.reset}`);
      return true;
    } else {
      console.warn(`${colors.yellow}⚠${colors.reset} ${colors.yellow}Mock 文件 ${colors.cyan}${path.basename(filePath)}${colors.yellow} 未导出函数${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} ${colors.red}热更新 Mock 文件失败:${colors.reset} ${colors.cyan}${path.basename(filePath)}${colors.reset} ${colors.red}${error.message}${colors.reset}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * 重新加载所有 Mock 文件（当 base-data 变化时）
 */
function reloadAllMockFiles() {
  if (!cachedMockId) return;
  
  const folderPath = getMockFolderPath(cachedMockId);
  if (!folderPath) return;
  
  console.log(`\n${colors.blue}🔄${colors.reset} ${colors.bright}热更新所有 Mock 文件...${colors.reset}`);
  cachedMockFiles = loadMockFiles(folderPath);
  console.log(`${colors.green}✅${colors.reset} ${colors.bright}热更新完成，共 ${colors.green}${Object.keys(cachedMockFiles).length}${colors.reset} ${colors.bright}个 Mock 接口${colors.reset}\n`);
}

/**
 * 设置文件监听
 */
function setupFileWatcher(mockId) {
  // 清除旧的监听器
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  
  const folderPath = getMockFolderPath(mockId);
  if (!folderPath) return;
  
  const workDir = getWorkDir();
  const baseDataPath = path.join(workDir, 'base-data');
  const mocksPath = folderPath;
  
  // 要监听的路径
  const watchPaths = [];
  if (fs.existsSync(baseDataPath)) {
    watchPaths.push(baseDataPath);
  }
  if (fs.existsSync(mocksPath)) {
    watchPaths.push(mocksPath);
  }
  
  if (watchPaths.length === 0) return;
  
  // 使用 chokidar 监听文件变化
  fileWatcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });
  
  fileWatcher
    .on('change', (filePath) => {
      // 延迟处理，避免文件写入未完成
      setTimeout(() => {
        const ext = path.extname(filePath);
        const fileName = path.basename(filePath);
        
        // 如果是 Mock 文件变化
        if (filePath.endsWith('.mock.ts') || filePath.endsWith('.mock.js')) {
          const interfaceName = fileName.replace(/\.mock\.(ts|js)$/, '');
          reloadMockFile(filePath, interfaceName);
        }
        // 如果是 base-data 中的 JSON 文件变化
        else if (ext === '.json' && filePath.includes('base-data')) {
          // 找到对应的接口名（从路径中提取）
          const baseDataMatch = filePath.match(/base-data[\/\\]([^\/\\]+)/);
          if (baseDataMatch) {
            const interfaceName = baseDataMatch[1];
            
            // 先清除该 JSON 文件的缓存
            try {
              const resolvedPath = require.resolve(filePath);
              delete require.cache[resolvedPath];
            } catch (e) {
              // 如果文件还未被 require，忽略错误
            }
            
            // 清除该接口的所有 base-data 缓存
            clearBaseDataCache(interfaceName);
            
            // 重新加载该接口的 Mock 文件（因为 Mock 文件会 import base-data）
            const mockFilePath = path.join(mocksPath, `${interfaceName}.mock.ts`);
            if (fs.existsSync(mockFilePath)) {
              reloadMockFile(mockFilePath, interfaceName);
            } else {
              // 如果找不到对应的 Mock 文件，重新加载所有（以防有依赖关系）
              reloadAllMockFiles();
            }
          } else {
            // 无法确定接口名，重新加载所有
            reloadAllMockFiles();
          }
        }
      }, 100);
    })
    .on('error', (error) => {
      console.error(`${colors.red}✗${colors.reset} ${colors.red}文件监听错误:${colors.reset} ${error.message}`);
    });
  
  console.log(`${colors.blue}👁️${colors.reset} ${colors.dim}已启用文件热更新监听${colors.reset}`);
}

/**
 * 获取或加载 Mock 文件
 */
function getMockFiles(mockId) {
  if (cachedMockId === mockId && Object.keys(cachedMockFiles).length > 0) {
    return cachedMockFiles;
  }

  const folderPath = getMockFolderPath(mockId);
  if (!folderPath) {
    console.error(`未找到 mockId ${mockId} 对应的接口集`);
    return {};
  }

  console.log(`\n${colors.blue}📂${colors.reset} ${colors.bright}加载接口集:${colors.reset} ${colors.dim}${folderPath}${colors.reset}`);
  cachedMockFiles = loadMockFiles(folderPath);
  cachedMockId = mockId;

  console.log(`${colors.green}✅${colors.reset} ${colors.bright}共加载 ${colors.green}${Object.keys(cachedMockFiles).length}${colors.reset} ${colors.bright}个 Mock 接口${colors.reset}\n`);
  
  // 设置文件监听
  setupFileWatcher(mockId);
  
  return cachedMockFiles;
}

/**
 * 接口识别配置（可以从配置文件加载，这里使用默认配置）
 */
const interfaceIdentifierConfig = {
  strategies: [
    {
      type: 'urlPattern',
      pattern: '/([^/]+)$',
      group: 1,
      description: '提取 URL 最后一段作为接口标识符'
    },
    {
      type: 'header',
      key: 'X-Interface-Name',
      description: '从请求头提取接口标识符'
    }
  ]
};

/**
 * 处理所有 HTTP 请求
 */
async function handleRequest(req, res) {
  try {
    // 从请求中提取接口标识符
    const interfaceName = extractInterfaceIdentifier(req, interfaceIdentifierConfig);

    if (!interfaceName) {
      console.log('⚠️  无法从请求中提取接口标识符，返回原始请求信息');
      return res.status(400).json({
        error: true,
        message: '无法识别接口标识符',
        request: {
          method: req.method,
          url: req.url,
          path: req.path,
          headers: req.headers,
          query: req.query,
          body: req.body
        }
      });
    }

    // 只在 debug 模式打印接口标识符
    const isDebugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    if (isDebugMode) {
      console.log(`🔍 识别到接口标识符: ${interfaceName}`);
    }

    // 检查接口是否被禁用
    if (disabledInterfaces.has(interfaceName)) {
      if (isDebugMode) {
        console.log(`🚫 接口 ${interfaceName} 已被禁用，跳过 mock 处理`);
      }
      return res.json({
        message: `接口 ${interfaceName} 已被禁用`,
        disabled: true,
        interfaceName
      });
    }

    // 获取当前 mockId（从环境变量或命令行参数）
    const mockId = currentMockId || process.env.MOCK_ID || '1';

    // 获取 Mock 文件
    const mockFiles = getMockFiles(mockId);

    // 检查是否需要动态切换 mock 场景（通过 CLI 或 Web 界面设置）
    // 支持所有接口的场景切换，例如: getProductInfo-2, getProductInfo-3 等
    let actualInterfaceName = interfaceName;
    const scenario = mockScenarios[interfaceName];

    if (scenario) {
      const scenarioInterfaceName = `${interfaceName}-${scenario}`;
      if (mockFiles[scenarioInterfaceName]) {
        actualInterfaceName = scenarioInterfaceName;
        if (isDebugMode) {
          console.log(`🔄 使用动态切换的 mock 场景: ${interfaceName} -> ${actualInterfaceName}`);
        }
      } else {
        if (isDebugMode) {
          console.log(`⚠️  未找到场景 ${scenario} 的 mock 处理器 (${scenarioInterfaceName})，使用默认 ${interfaceName}`);
        }
        delete mockScenarios[interfaceName]; // 清除无效的场景配置
      }
    }

    // 查找对应的 mock 处理器
    const mockHandler = mockFiles[actualInterfaceName];

    if (!mockHandler) {
      // 使用静态变量记录已警告的接口，避免重复打印
      if (!handleRequest.warnedInterfaces) {
        handleRequest.warnedInterfaces = new Set();
      }
      
      if (!handleRequest.warnedInterfaces.has(actualInterfaceName)) {
        handleRequest.warnedInterfaces.add(actualInterfaceName);
        console.log(`${getTimestamp()} ${colors.yellow}⚠️  ${actualInterfaceName} 未找到 mock 处理器${colors.reset}`);
        
        // 只在 debug 模式打印可用的处理器列表
        if (isDebugMode) {
          console.log(`${colors.dim}📋 可用的 mock 处理器: ${Object.keys(mockFiles).join(', ')}${colors.reset}`);
        }
      }
      
      return res.status(404).json({
        error: true,
        message: `未找到 ${actualInterfaceName} 的 Mock 文件`,
        interfaceName,
        actualInterfaceName,
        availableInterfaces: Object.keys(mockFiles)
      });
    }

    // 确保 mockHandler 是函数
    if (typeof mockHandler !== 'function') {
      console.error(`❌ mockHandler 不是函数，实际类型: ${typeof mockHandler}`);
      console.error(`   值:`, mockHandler);
      return res.status(500).json({
        error: 'Mock 处理器不是函数',
        interfaceName: actualInterfaceName,
        handlerType: typeof mockHandler
      });
    }

    // 构建请求对象
    const request = {
      body: req.body,
      options: {
        headers: req.headers
      },
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query
    };

    // 调用 Mock 处理函数（只在 debug 模式打印详细信息）
    if (isDebugMode) {
      console.log(`🚀 调用 ${actualInterfaceName} 的 mock 处理器...`);
      if (actualInterfaceName !== interfaceName) {
        console.log(`   (原始接口标识符: ${interfaceName})`);
      }
      console.log(`   处理器类型: ${typeof mockHandler}`);
    }

    let result;
    try {
      result = await mockHandler(request);
    } catch (error) {
      console.error(`❌ Mock 处理器执行出错:`, error);
      return res.status(500).json({
        error: 'Mock 处理器执行出错',
        message: error.message,
        interfaceName: actualInterfaceName
      });
    }


    // 检查是否匹配失败
    // matchResponse 返回错误时的格式：{ error: true, message: '...', ... }
    // 需要检查 error 是否为布尔值 true，而不是仅仅检查 error 字段是否存在
    // 因为响应数据中可能包含 error 字段（如 { error: { code: '', message: '' } }）
    if (result && result.body && result.body.error === true) {
      console.log(`${getTimestamp()} ${colors.red}❌ ${actualInterfaceName} 匹配失败${colors.reset}`);
      return res.status(404).json(result.body);
    }

    // 返回响应
    if (result && result.body) {
      // 设置响应头
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.setHeader(key, result.headers[key]);
        });
      }

      // 确保 Content-Type 是 application/json
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }

      // 优先使用 result.status，如果没有则尝试从响应体中提取
      let status = result.status;
      if (!status && result.body?.ResponseStatus?.Errors?.[0]?.ErrorCode) {
        // ErrorCode 可能是字符串，需要转换为数字
        const errorCode = result.body.ResponseStatus.Errors[0].ErrorCode;
        status = typeof errorCode === 'string' ? parseInt(errorCode, 10) : errorCode;
      }
      status = status || 200;

      // 精简输出：只显示接口名和状态码（带颜色）
      const statusColor = status >= 200 && status < 300 ? colors.green : status >= 400 ? colors.red : colors.yellow;
      console.log(`${getTimestamp()} ${colors.green}✅${colors.reset} ${colors.bright}${actualInterfaceName}${colors.reset} ${statusColor}(${status})${colors.reset}`);

      // 对于 429 等特殊状态码，使用 send 而不是 json，确保返回实际的响应体内容
      // 而不是 Express 默认的状态码文本（如 "Too Many Requests"）
      if (status === 429) {
        return res.status(status).type('json').send(JSON.stringify(result.body));
      }

      return res.status(status).json(result.body);
    } else if (result && result.status) {
      // 兼容旧格式：只有 status 没有 body
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.setHeader(key, result.headers[key]);
        });
      }
      return res.status(result.status).json(result.body || {});
    } else {
      // 如果没有标准格式，尝试直接返回结果
      console.log('⚠️  mock 处理器返回的响应格式不标准，尝试直接返回');
      return res.status(200).json(result);
    }
  } catch (error) {
    console.error('❌ 处理请求失败:', error);
    return res.status(500).json({
      error: true,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// 配置管理 API - 获取配置列表
app.get('/api/config', (req, res) => {
  try {
    const workDir = getWorkDir();
    const configPath = path.join(workDir, 'proxy.config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      res.json(config);
    } else {
      res.json({ libraryId: 2773, folders: { list: [] } });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 配置管理 API - 添加配置
app.post('/api/config', (req, res) => {
  try {
    const workDir = getWorkDir();
    const configPath = path.join(workDir, 'proxy.config.json');
    let config = { libraryId: 2773, folders: { list: [] } };

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    const { id, path: folderPath, name } = req.body;

    // 检查 ID 是否已存在
    if (config.folders.list.find(f => f.id === parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: `ID ${id} 已存在`
      });
    }

    config.folders.list.push({ id: parseInt(id), path: folderPath, name });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 配置管理 API - 删除配置
app.delete('/api/config/:id', (req, res) => {
  try {
    const workDir = getWorkDir();
    const configPath = path.join(workDir, 'proxy.config.json');
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({
        success: false,
        error: '配置文件不存在'
      });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const id = parseInt(req.params.id);

    const index = config.folders.list.findIndex(f => f.id === id);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: `ID ${id} 不存在`
      });
    }

    config.folders.list.splice(index, 1);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 配置管理 API - 生成配置
app.post('/api/config/generate', (req, res) => {
  try {
    const workDir = getWorkDir();
    const options = {
      rootDir: req.body.rootDir || workDir,
      outputPath: path.join(workDir, 'proxy.config.json'),
      libraryId: req.body.libraryId || 2773,
      startId: req.body.startId || 1
    };

    const config = generateConfig(options);
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/config/validate', (req, res) => {
  try {
    const workDir = getWorkDir();
    const configPath = path.join(workDir, 'proxy.config.json');
    const result = validateConfig(configPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/config/merge', (req, res) => {
  try {
    const workDir = getWorkDir();
    const configPath = path.join(workDir, 'proxy.config.json');

    // 加载现有配置
    let existingConfig = { libraryId: 2773, folders: { list: [] } };
    if (fs.existsSync(configPath)) {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    // 生成新配置
    const options = {
      rootDir: req.body.rootDir || workDir,
      libraryId: existingConfig.libraryId
    };
    const newConfig = generateConfig({ ...options, outputPath: null });

    // 合并配置
    const mergedConfig = mergeConfig(existingConfig, newConfig);

    // 保存合并后的配置
    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');

    res.json({ success: true, config: mergedConfig });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 服务器信息 API
app.get('/api/server/info', (req, res) => {
  try {
    res.json({
      port: PORT,
      mockId: currentMockId || process.env.MOCK_ID || '1',
      loadedInterfaces: Object.keys(cachedMockFiles).length,
      availableInterfaces: Object.keys(cachedMockFiles)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Mock 场景管理 API ====================
/**
 * 获取所有可用的 mockId 列表（支持搜索）
 */
app.get('/mock-admin/mockids', (req, res) => {
  try {
    if (!mockConfig) {
      loadMockConfig();
    }
    const configs = mockConfig?.folders?.list || [];
    const currentMockIdNum = currentMockId ? parseInt(currentMockId) : null;
    const search = req.query.search || '';

    let filteredConfigs = configs;

    if (search) {
      const searchLower = search.toLowerCase();
      filteredConfigs = configs.filter(config => {
        const pathMatch = config.path.toLowerCase().includes(searchLower);
        const idMatch = String(config.id).includes(search);
        return pathMatch || idMatch;
      });
    }

    const workDir = getWorkDir();
    const mockIds = filteredConfigs.map(config => {
      const folderPath = path.join(workDir, config.path);
      return {
        id: config.id,
        path: config.path,
        isActive: currentMockIdNum === config.id,
        exists: fs.existsSync(folderPath)
      };
    });

    res.json({
      current: currentMockIdNum,
      available: mockIds,
      total: configs.length,
      filtered: filteredConfigs.length
    });
  } catch (error) {
    res.status(500).json({
      error: '获取 mockId 列表失败',
      message: error.message
    });
  }
});

/**
 * 切换 mockId
 */
app.post('/mock-admin/mockid/:mockId', async (req, res) => {
  const { mockId: newMockId } = req.params;

  try {
    const folderPath = getMockFolderPath(newMockId);
    if (!folderPath) {
      return res.status(400).json({
        error: '切换 mockId 失败',
        message: `未找到 mockId ${newMockId} 对应的接口集`
      });
    }

    // 加载新的 mock 文件
    getMockFiles(newMockId);

    // 更新 mockId
    currentMockId = newMockId;

    console.log(`\n🔄 已切换 mockId 到 ${newMockId} (${folderPath})`);

    res.json({
      success: true,
      message: `已切换到 mockId ${newMockId}`,
      mockId: newMockId,
      path: folderPath
    });
  } catch (error) {
    res.status(400).json({
      error: '切换 mockId 失败',
      message: error.message
    });
  }
});

/**
 * 启用/禁用接口
 */
app.post('/mock-admin/interfaces/:interfaceName/toggle', (req, res) => {
  try {
    const { interfaceName } = req.params;
    const { enabled } = req.body;

    if (enabled === true || enabled === 'true') {
      disabledInterfaces.delete(interfaceName);
      console.log(`✅ 接口 ${interfaceName} 已启用`);
      res.json({
        success: true,
        message: `接口 ${interfaceName} 已启用`,
        enabled: true
      });
    } else {
      disabledInterfaces.add(interfaceName);
      console.log(`🚫 接口 ${interfaceName} 已禁用`);
      res.json({
        success: true,
        message: `接口 ${interfaceName} 已禁用`,
        enabled: false
      });
    }
  } catch (error) {
    res.status(400).json({
      error: '切换接口状态失败',
      message: error.message
    });
  }
});

/**
 * 获取所有接口的场景配置
 */
app.get('/mock-admin/scenarios', (req, res) => {
  const scenarios = {};
  Object.keys(mockScenarios).forEach(key => {
    scenarios[key] = mockScenarios[key];
  });

  // 获取所有接口及其可用场景
  const availableScenarios = {};

  // 收集所有已加载的接口名称（不包含变体）
  const interfaceNames = new Set();
  Object.keys(cachedMockFiles).forEach(key => {
    // 提取基础接口名（去掉 -2, -3 等后缀）
    const baseName = key.replace(/-\d+$/, '');
    interfaceNames.add(baseName);
  });

  // 为每个接口查找可用场景（包括只有一个场景的接口）
  interfaceNames.forEach(interfaceName => {
    const scenariosForInterface = [];
    const isDisabled = disabledInterfaces.has(interfaceName);

    // 检查默认场景（基础名称）
    if (cachedMockFiles[interfaceName]) {
      const currentScenario = mockScenarios[interfaceName];
      const isActive = currentScenario === undefined || currentScenario === null;

      scenariosForInterface.push({
        id: 'default',
        name: interfaceName,
        label: interfaceName,
        filePath: mockFilePaths[interfaceName] || null,
        isActive
      });
    }

    // 检查变体场景（-2, -3, ...）
    for (let i = 2; i <= 10; i++) {
      const scenarioInterfaceName = `${interfaceName}-${i}`;
      if (cachedMockFiles[scenarioInterfaceName]) {
        const currentScenario = mockScenarios[interfaceName];
        const isActive = currentScenario === String(i);

        scenariosForInterface.push({
          id: String(i),
          name: scenarioInterfaceName,
          label: scenarioInterfaceName,
          filePath: mockFilePaths[scenarioInterfaceName] || null,
          isActive
        });
      }
    }

    // 即使只有一个场景也返回（显示所有接口）
    if (scenariosForInterface.length > 0) {
      availableScenarios[interfaceName] = {
        scenarios: scenariosForInterface,
        disabled: isDisabled,
        hasMultipleScenarios: scenariosForInterface.length > 1
      };
    }
  });

  const currentMockPath = currentMockId ? getMockFolderPath(currentMockId) : null;

  res.json({
    current: scenarios,
    available: availableScenarios,
    disabled: Array.from(disabledInterfaces),
    mockId: currentMockId,
    mockPath: currentMockPath
  });
});

/**
 * 切换场景（支持所有接口）
 */
app.post('/mock-admin/scenarios/:interfaceName', (req, res) => {
  const { interfaceName } = req.params;
  const { scenario } = req.body;

  // 如果 scenario 为空或 'default'，则清除配置，使用默认
  if (!scenario || scenario === 'default' || scenario === '1') {
    delete mockScenarios[interfaceName];
    console.log(`\n🔄 已切换 ${interfaceName} 到默认场景`);
    return res.json({
      success: true,
      message: `已切换到默认场景`,
      current: null
    });
  }

  // 检查场景是否存在
  const scenarioInterfaceName = `${interfaceName}-${scenario}`;
  if (!cachedMockFiles[scenarioInterfaceName]) {
    // 查找所有可用的场景
    const available = [];
    if (cachedMockFiles[interfaceName]) {
      available.push({ id: 'default', name: interfaceName });
    }
    for (let i = 2; i <= 10; i++) {
      const name = `${interfaceName}-${i}`;
      if (cachedMockFiles[name]) {
        available.push({ id: String(i), name });
      }
    }

    return res.status(404).json({
      error: `场景 ${scenario} 不存在`,
      available
    });
  }

  // 设置场景
  mockScenarios[interfaceName] = scenario;
  console.log(`\n🔄 已切换 ${interfaceName} 到场景 ${scenario} (${scenarioInterfaceName})`);

  res.json({
    success: true,
    message: `已切换到场景 ${scenario}`,
    current: scenario
  });
});

/**
 * 提供 Web 管理界面
 */
app.get('/mock-admin', (req, res) => {
  const htmlPath = path.join(__dirname, 'templates', 'mock-admin.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.send(html);
  } else {
    res.status(404).send('Web 界面文件未找到');
  }
});

// 通配符路由必须在最后，避免拦截 API 路由
// 支持所有 HTTP 方法
// app.get('*', handleRequest);
// app.post('*', handleRequest);
// app.put('*', handleRequest);
// app.delete('*', handleRequest);
// app.patch('*', handleRequest);
// app.options('*', handleRequest);
// app.head('*', handleRequest);
app.all('*', handleRequest);

// 启动服务器
function startServer(mockId) {
  currentMockId = mockId;

  // 预加载 Mock 文件
  if (mockId) {
    getMockFiles(mockId);
  }

  app.listen(PORT, () => {
    console.log(`\n${colors.green}${colors.bright}🚀 服务器已启动${colors.reset}`);
    console.log(`${colors.cyan}📡${colors.reset} ${colors.dim}监听端口:${colors.reset} ${colors.bright}${PORT}${colors.reset}`);
    console.log(`${colors.cyan}📡${colors.reset} ${colors.dim}接收地址:${colors.reset} ${colors.blue}http://localhost:${PORT}${colors.reset}`);
    console.log(`${colors.magenta}🌐${colors.reset} ${colors.dim}Web 管理界面:${colors.reset} ${colors.blue}http://localhost:${PORT}/mock-admin${colors.reset}`);
    if (mockId) {
      console.log(`${colors.yellow}📦${colors.reset} ${colors.dim}使用接口集 ID:${colors.reset} ${colors.bright}${mockId}${colors.reset}`);
    }
    console.log(`\n${colors.dim}等待 Proxyman 转发请求...${colors.reset}\n`);
  });
}

// 从环境变量或命令行参数获取 mockId
// 优先使用环境变量（由 start 命令设置）
const mockId = process.env.MOCK_ID || process.argv[2];
if (mockId) {
  startServer(mockId);
} else {
  console.warn('⚠️  未指定 mockId，使用默认值 1');
  console.warn('💡 使用方法: jacky-proxy start <mockId>');
  startServer('1');
}

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n收到 SIGINT 信号，正在关闭服务器...');
  process.exit(0);
});

