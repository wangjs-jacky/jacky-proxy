/**
 * 请求匹配核心函数 - 根据请求 payload 动态匹配 Mock 响应
 * 支持配置化的匹配规则（忽略属性、深度忽略、排序等）
 */

import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';

export interface MatchConfig {
  interfaceName?: string;           // 接口标识符（用于查找匹配规则配置）
  essentialProps?: string[];         // 必需属性列表（不会被过滤）
  deepIgnore?: boolean;              // 是否深度忽略（递归删除嵌套属性）
  bodyToObject?: boolean;            // 是否将 body 字符串转为对象
  sortProps?: Array<{                // 排序配置（用于数组排序）
    prop: string;
    compareKey: string;
  }>;
  needContainProps?: string[];      // 必须包含的属性
}

interface MatchRulesConfig {
  global: {
    ignoreProps: string[];
    description?: string;
  };
  interfaces: Array<{
    interfaceName: string;
    ignoreProps?: string[];
    essentialProps?: string[];
    deepIgnore?: boolean;
    sortProps?: Array<{ prop: string; compareKey: string }>;
    deepMerge?: Record<string, any>;
    channelSpecific?: {
      [channel: string]: {
        ignoreProps?: string[];
      };
    };
    description?: string;
  }>;
}

// 缓存匹配规则配置
let matchRulesConfig: MatchRulesConfig | null = null;

/**
 * 加载匹配规则配置
 * 配置文件从工作目录读取（WORK_DIR 环境变量或当前工作目录）
 */
function loadMatchRules(): MatchRulesConfig {
  if (!matchRulesConfig) {
    try {
      // 从工作目录读取配置文件
      // 优先使用 WORK_DIR 环境变量，否则使用当前工作目录
      const workDir = process.env.WORK_DIR || process.cwd();
      const configPath = path.join(workDir, 'config/match-rules.json');
      
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        matchRulesConfig = JSON.parse(configContent);
      } else {
        // 配置文件不存在时使用默认规则（不警告，因为可能用户还没有创建）
        matchRulesConfig = {
          global: { ignoreProps: [] },
          interfaces: []
        };
      }
    } catch (error) {
      console.warn('无法加载匹配规则配置文件，使用默认规则', error);
      matchRulesConfig = {
        global: { ignoreProps: [] },
        interfaces: []
      };
    }
  }
  return matchRulesConfig!; // 此时 matchRulesConfig 一定不为 null
}

/**
 * 获取接口的匹配配置
 */
function getMatchConfig(interfaceName: string): MatchRulesConfig['interfaces'][0] | null {
  const config = loadMatchRules();
  return config.interfaces.find(c => c.interfaceName === interfaceName) || null;
}

/**
 * 深度忽略属性（递归删除嵌套对象中的指定属性）
 */
function deepIgnoreProps(obj: any, propsToIgnore: string[]): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepIgnoreProps(item, propsToIgnore));
  }

  const result: any = {};
  for (const key in obj) {
    if (propsToIgnore.includes(key)) {
      continue;
    }
    result[key] = deepIgnoreProps(obj[key], propsToIgnore);
  }
  return result;
}

/**
 * 对数组进行排序
 */
function sortArrayProps(obj: any, sortConfig: Array<{ prop: string; compareKey: string }>): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const result = { ...obj };
  for (const config of sortConfig) {
    if (result[config.prop] && Array.isArray(result[config.prop])) {
      result[config.prop] = [...result[config.prop]].sort((a, b) => {
        const aVal = a[config.compareKey];
        const bVal = b[config.compareKey];
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
        return 0;
      });
    }
  }
  return result;
}

/**
 * 差异信息接口
 */
export interface DiffInfo {
  path: string;              // 字段路径，如 "body.searchParams[0].id"
  type: 'missing-in-mock' | 'missing-in-request' | 'value-different';  // 差异类型
  requestValue?: any;        // 请求中的值
  mockValue?: any;           // Mock 中的值
}

/**
 * 获取两个对象的详细差异
 * @param requestObj - 请求对象
 * @param mockObj - Mock 对象
 * @param pathPrefix - 路径前缀（用于递归）
 * @returns 差异信息数组
 */
function getDetailedDiff(
  requestObj: any,
  mockObj: any,
  pathPrefix: string = ''
): DiffInfo[] {
  const diffs: DiffInfo[] = [];

  // 处理 null/undefined 的情况
  if (requestObj === null || requestObj === undefined) {
    if (mockObj !== null && mockObj !== undefined) {
      diffs.push({
        path: pathPrefix || 'root',
        type: 'missing-in-request',
        mockValue: mockObj
      });
    }
    return diffs;
  }

  if (mockObj === null || mockObj === undefined) {
    if (requestObj !== null && requestObj !== undefined) {
      diffs.push({
        path: pathPrefix || 'root',
        type: 'missing-in-mock',
        requestValue: requestObj
      });
    }
    return diffs;
  }

  // 处理基本类型
  if (typeof requestObj !== 'object' || typeof mockObj !== 'object') {
    if (requestObj !== mockObj) {
      diffs.push({
        path: pathPrefix || 'root',
        type: 'value-different',
        requestValue: requestObj,
        mockValue: mockObj
      });
    }
    return diffs;
  }

  // 处理数组
  if (Array.isArray(requestObj) || Array.isArray(mockObj)) {
    if (!Array.isArray(requestObj)) {
      diffs.push({
        path: pathPrefix || 'root',
        type: 'value-different',
        requestValue: requestObj,
        mockValue: mockObj
      });
      return diffs;
    }
    if (!Array.isArray(mockObj)) {
      diffs.push({
        path: pathPrefix || 'root',
        type: 'value-different',
        requestValue: requestObj,
        mockValue: mockObj
      });
      return diffs;
    }

    // 比较数组长度
    const maxLength = Math.max(requestObj.length, mockObj.length);
    for (let i = 0; i < maxLength; i++) {
      const itemPath = pathPrefix ? `${pathPrefix}[${i}]` : `[${i}]`;
      if (i >= requestObj.length) {
        diffs.push({
          path: itemPath,
          type: 'missing-in-request',
          mockValue: mockObj[i]
        });
      } else if (i >= mockObj.length) {
        diffs.push({
          path: itemPath,
          type: 'missing-in-mock',
          requestValue: requestObj[i]
        });
      } else {
        // 递归比较数组元素
        diffs.push(...getDetailedDiff(requestObj[i], mockObj[i], itemPath));
      }
    }
    return diffs;
  }

  // 处理对象
  const allKeys = new Set([
    ...Object.keys(requestObj),
    ...Object.keys(mockObj)
  ]);

  for (const key of allKeys) {
    const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    const requestValue = requestObj[key];
    const mockValue = mockObj[key];

    if (!(key in requestObj)) {
      // 只在 mock 中存在
      diffs.push({
        path: currentPath,
        type: 'missing-in-request',
        mockValue: mockValue
      });
    } else if (!(key in mockObj)) {
      // 只在请求中存在
      diffs.push({
        path: currentPath,
        type: 'missing-in-mock',
        requestValue: requestValue
      });
    } else {
      // 都存在，递归比较
      diffs.push(...getDetailedDiff(requestValue, mockValue, currentPath));
    }
  }

  return diffs;
}

/**
 * 格式化差异信息为可读字符串
 */
export function formatDiffInfo(diffs: DiffInfo[]): string {
  if (diffs.length === 0) {
    return '无差异';
  }

  const sections: string[] = [];
  
  // 按类型分组
  const missingInMock = diffs.filter(d => d.type === 'missing-in-mock');
  const missingInRequest = diffs.filter(d => d.type === 'missing-in-request');
  const valueDifferent = diffs.filter(d => d.type === 'value-different');

  if (missingInMock.length > 0) {
    sections.push('\n❌ 只在请求中存在的字段（Mock 中缺失）:');
    missingInMock.forEach(diff => {
      sections.push(`  • ${diff.path}: ${JSON.stringify(diff.requestValue)}`);
    });
  }

  if (missingInRequest.length > 0) {
    sections.push('\n⚠️  只在 Mock 中存在的字段（请求中缺失）:');
    missingInRequest.forEach(diff => {
      sections.push(`  • ${diff.path}: ${JSON.stringify(diff.mockValue)}`);
    });
  }

  if (valueDifferent.length > 0) {
    sections.push('\n🔴 值不同的字段:');
    valueDifferent.forEach(diff => {
      sections.push(`  • ${diff.path}:`);
      sections.push(`    请求值: ${JSON.stringify(diff.requestValue)}`);
      sections.push(`    Mock值: ${JSON.stringify(diff.mockValue)}`);
    });
  }

  return sections.join('\n');
}

/**
 * 处理请求对象（应用忽略、排序等规则）
 */
function processRequest(
  request: any,
  ignoreProps: string[],
  essentialProps: string[],
  deepIgnore: boolean,
  sortProps: Array<{ prop: string; compareKey: string }>
): any {
  let processed = { ...request };

  // 处理 body
  if (processed.body) {
    let body = processed.body;

    // 如果是字符串，尝试转换为对象
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // 如果解析失败，保持原样
      }
    }

    // 深度忽略属性
    if (deepIgnore) {
      body = deepIgnoreProps(body, ignoreProps);
    } else {
      // 浅层忽略属性
      for (const prop of ignoreProps) {
        if (!essentialProps.includes(prop)) {
          delete body[prop];
        }
      }
    }

    // 排序数组属性
    if (sortProps.length > 0) {
      body = sortArrayProps(body, sortProps);
    }

    processed.body = body;
  }

  return processed;
}

/**
 * 匹配请求并返回对应的响应
 * @param request - 真实请求对象 { body, options: { headers } }
 * @param requestList - Mock 请求列表（从 base-data 导入）
 * @param responseList - Mock 响应列表（从 base-data 导入）
 * @param options - 匹配配置选项
 * @returns 匹配的响应数据，如果匹配失败则返回错误信息
 */
export function matchResponse(
  request: any,
  requestList: any[],
  responseList: any[],
  options: MatchConfig = {}
): any {
  const {
    interfaceName = '',
    essentialProps = [],
    deepIgnore = false,
    bodyToObject = false,
    sortProps = [],
    needContainProps = []
  } = options;

  // 加载匹配规则配置
  const config = loadMatchRules();
  const interfaceConfig = getMatchConfig(interfaceName);

  // 合并全局和接口级别的忽略属性
  const globalIgnoreProps = config.global.ignoreProps || [];
  const interfaceIgnoreProps = interfaceConfig?.ignoreProps || [];
  const allIgnoreProps = [...globalIgnoreProps, ...interfaceIgnoreProps];

  // 过滤掉必需属性
  const ignoreProps = allIgnoreProps.filter(prop => !essentialProps.includes(prop));

  // 应用接口级别的配置
  const finalDeepIgnore = interfaceConfig?.deepIgnore !== undefined
    ? interfaceConfig.deepIgnore
    : deepIgnore;

  const finalSortProps = interfaceConfig?.sortProps || sortProps;

  // 处理真实请求
  let processedRequest = processRequest(
    request,
    ignoreProps,
    essentialProps,
    finalDeepIgnore,
    finalSortProps
  );

  // 处理 bodyToObject
  if (bodyToObject && processedRequest.body && typeof processedRequest.body === 'string') {
    try {
      processedRequest.body = JSON.parse(processedRequest.body);
    } catch (e) {
      // 解析失败，保持原样
    }
  }

  // 提取实际请求的 body 部分用于比较
  // 如果请求有 body 字段，则使用 body；否则使用整个请求对象
  let requestBodyForCompare = processedRequest.body !== undefined 
    ? processedRequest.body 
    : processedRequest;

  // 检查必需属性
  if (needContainProps.length > 0) {
    const body = requestBodyForCompare || {};
    for (const prop of needContainProps) {
      if (!(prop in body)) {
        return {
          error: true,
          message: `缺少必需属性: ${prop}`,
          request: processedRequest
        };
      }
    }
  }

  // 遍历 Mock 请求列表，找到匹配的请求
  for (let i = 0; i < requestList.length; i++) {
    const mockRequest = requestList[i];
    
    // 如果 mock 请求有 body 字段，则使用 body；否则将整个请求作为 body 处理
    const mockRequestForProcess = mockRequest.body !== undefined 
      ? mockRequest 
      : { body: mockRequest };
    
    let processedMockRequest = processRequest(
      mockRequestForProcess,
      ignoreProps,
      essentialProps,
      finalDeepIgnore,
      finalSortProps
    );

    // 提取 mock 请求的 body 部分用于比较
    let mockBodyForCompare = processedMockRequest.body !== undefined 
      ? processedMockRequest.body 
      : processedMockRequest;

    // 使用 lodash 的 isEqualWith 进行深度比较（只比较 body 部分）
    const isMatch = _.isEqualWith(
      requestBodyForCompare,
      mockBodyForCompare,
      (objValue, srcValue) => {
        // 自定义比较逻辑可以在这里添加
        return undefined; // 使用默认比较
      }
    );

    if (isMatch) {
      // 找到匹配的请求，返回对应的响应
      return responseList[i] || null;
    }
  }

  // 没有找到匹配的请求，返回错误信息
  // 注意：详细差异信息不再打印到控制台，避免终端输出过多信息

  return {
    error: true,
    message: '未找到匹配的 Mock 请求',
    request: JSON.stringify(requestBodyForCompare),
    mockRequests: JSON.stringify(requestList.map((req, index) => ({
      index,
      request: req
    })))
  };
}

