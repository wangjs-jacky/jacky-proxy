/**
 * 接口识别工具 - 从请求中提取接口标识符（通用方案）
 * 支持多种识别策略：URL 路径、请求头、请求体、查询参数、自定义函数
 */

import { Request } from 'express';

export interface IdentifierStrategy {
  type: 'urlPattern' | 'header' | 'body' | 'query' | 'custom';
  pattern?: string;        // URL 正则表达式（用于 urlPattern）
  group?: number;          // 正则捕获组索引（用于 urlPattern）
  key?: string;            // 键名（用于 header、query）
  path?: string;           // 路径（用于 body，支持嵌套路径如 'a.b.c'）
  function?: (req: Request) => string | null;  // 自定义函数（用于 custom）
  description?: string;    // 策略描述
}

export interface InterfaceIdentifierConfig {
  strategies: IdentifierStrategy[];
}

/**
 * 从嵌套对象中获取值
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return null;
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value == null) return null;
    value = value[key];
  }
  return value;
}

/**
 * 应用单个识别策略
 */
function applyStrategy(req: Request, strategy: IdentifierStrategy): string | null {
  try {
    switch (strategy.type) {
      case 'urlPattern': {
        if (!strategy.pattern) return null;
        const path = req.path || req.url.split('?')[0];
        const match = path.match(new RegExp(strategy.pattern));
        if (match && match[strategy.group || 1]) {
          return match[strategy.group || 1];
        }
        return null;
      }

      case 'header': {
        if (!strategy.key) return null;
        const value = req.headers[strategy.key] || req.headers[strategy.key.toLowerCase()];
        return value ? String(value) : null;
      }

      case 'body': {
        if (!strategy.path) return null;
        const value = getNestedValue(req.body, strategy.path);
        return value ? String(value) : null;
      }

      case 'query': {
        if (!strategy.key) return null;
        const value = req.query[strategy.key];
        return value ? String(value) : null;
      }

      case 'custom': {
        if (typeof strategy.function === 'function') {
          return strategy.function(req);
        }
        return null;
      }

      default:
        return null;
    }
  } catch (error) {
    console.warn(`应用识别策略失败: ${strategy.type}`, error);
    return null;
  }
}

/**
 * 获取默认识别策略（兜底方案）
 */
function getDefaultStrategies(): IdentifierStrategy[] {
  return [
    {
      type: 'urlPattern',
      pattern: '/([^/]+)$',
      group: 1,
      description: '提取 URL 最后一段作为接口标识符'
    }
  ];
}

/**
 * 从请求中提取接口标识符（通用方案）
 * @param req - Express 请求对象
 * @param config - 接口识别配置（可选）
 * @returns 接口标识符，如果无法识别则返回 null
 */
export function extractInterfaceIdentifier(
  req: Request,
  config?: InterfaceIdentifierConfig
): string | null {
  
  const strategies = config?.strategies || getDefaultStrategies();

  // 按顺序尝试每个策略
  for (const strategy of strategies) {
    const identifier = applyStrategy(req, strategy);
    if (identifier) {
      return identifier;
    }
  }

  // 如果所有策略都失败，尝试从 URL 路径的最后一段提取（兜底方案）
  const path = req.path || req.url.split('?')[0];
  const pathParts = path.split('/').filter(p => p);
  if (pathParts.length > 0) {
    return pathParts[pathParts.length - 1];
  }

  return null;
}

