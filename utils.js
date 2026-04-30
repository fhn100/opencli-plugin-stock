import fs from "fs";
import { join } from "path";

// ============================ 路径 & 配置 ============================

/**
 * 获取数据目录（自动创建）
 * @returns {string} 数据目录路径
 */
export function getDataDir() {
  const dir = join(import.meta.dirname, "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 获取配置文件路径（自动创建空文件）
 * @returns {string} 配置文件路径
 */
export function getConfigPath() {
  const path = join(getDataDir(), "config");
  if (!fs.existsSync(path)) fs.writeFileSync(path, "", "utf8");
  return path;
}

/**
 * 写入配置文件
 * @param {string} config - 配置内容
 */
export function writeConfig(config) {
  const path = getConfigPath();
  fs.writeFileSync(path, config, 'utf8');
}

/**
 * 读取 Cookie（未配置时抛异常）
 * @returns {Promise<string>} Cookie 字符串
 * @throws {Error} 配置文件为空时抛出
 */
export async function getCookie() {
  const path = getConfigPath();
  const cookie = fs.readFileSync(path, "utf8").trim();
  if (!cookie) throw new Error(`请先在配置文件中配置cookie, 路径: ${path}`);
  return cookie;
}

/**
 * 从 Cookie 提取用户 ID
 * @returns {Promise<string>} 用户 ID
 * @throws {Error} Cookie 格式不正确时抛出
 */
export async function getUserId() {
  const cookie = await getCookie();
  const match = cookie.match(/userid=(\d+)/);
  if (!match?.[1]) throw new Error("配置文件中的cookie格式不正确，无法提取userid");
  return match[1].trim();
}

// ============================ 日期工具 ============================

/**
 * 获取当前月份字符串 YYYY-MM
 * @returns {string} 当前月份，格式 YYYY-MM
 */
export function getCurrentMonth() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * 获取当月日期范围（默认同步范围）
 * @returns {{ startDate: string, endDate: string }} 开始和结束日期，格式 YYYYMMDD
 */
export function getDefaultDateRange() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  const dd = String(lastDay).padStart(2, "0");
  return { startDate: `${yyyy}${mm}01`, endDate: `${yyyy}${mm}${dd}` };
}

/**
 * 获取今日日期字符串
 * @returns {string} 今日日期，格式 YYYYMMDD
 */
export function getTodayDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

// ============================ 脱敏工具 ============================

/**
 * 账户名称脱敏（保留姓，名替换为 *）
 * @param {string} accountName - 原始账户名称，如 "国泰-冯海年"
 * @returns {string} 脱敏后的账户名称，如 "国泰-冯*"
 */
export function maskAccountName(accountName) {
  if (!accountName || !accountName.includes("-")) {
    return accountName || "未知账户";
  }
  const idx = accountName.indexOf("-");
  const prefix = accountName.substring(0, idx + 1);
  const namePart = accountName.substring(idx + 1);
  if (namePart.length > 1) {
    return prefix + namePart.charAt(0) + "*".repeat(namePart.length - 1);
  }
  return accountName;
}

// ============================ 参数解析 ============================

/**
 * 从 CLI kwargs 解析日期范围
 * 支持 start/end 参数，缺省时使用当月范围
 * @param {object} kwargs - CLI 参数
 * @param {string} [kwargs.start] - 开始日期 YYYYMMDD
 * @param {string} [kwargs.end] - 结束日期 YYYYMMDD
 * @returns {{ startDate: string, endDate: string }} 日期范围
 */
export function resolveDateRange(kwargs) {
  if (kwargs?.start && kwargs?.end) {
    return { startDate: kwargs.start, endDate: kwargs.end };
  }
  return getDefaultDateRange();
}


// ============================ 错误处理 ============================

/**
 * 自定义应用错误类
 */
export class AppError extends Error {
  /**
   * @param {string} message - 错误信息
   * @param {string} code - 错误代码
   * @param {number} [httpStatus] - HTTP 状态码（可选）
   */
  constructor(message, code, httpStatus) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * 重试执行函数
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxAttempts - 最大尝试次数
 * @param {number} delayMs - 重试间隔（毫秒）
 * @returns {Promise<*>} 函数执行结果
 */
export async function retry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ============================ 配置管理 ============================

/**
 * 配置管理器（支持 JSON 格式）
 */
class ConfigManager {
  constructor() {
    this._configPath = join(getDataDir(), "config.json");
    this._cache = null;
  }

  /**
   * 获取配置文件路径
   * @returns {string} 配置文件路径
   */
  getPath() {
    return this._configPath;
  }

  /**
   * 加载配置（带缓存）
   * @returns {object} 配置对象
   */
  load() {
    if (this._cache) return this._cache;

    if (!fs.existsSync(this._configPath)) {
      this._cache = {};
      return this._cache;
    }

    try {
      const content = fs.readFileSync(this._configPath, "utf8").trim();
      if (!content) {
        this._cache = {};
        return this._cache;
      }
      this._cache = JSON.parse(content);
      return this._cache;
    } catch (error) {
      console.error("加载配置文件失败:", error.message);
      this._cache = {};
      return this._cache;
    }
  }

  /**
   * 保存配置
   * @param {object} config - 配置对象
   */
  save(config) {
    try {
      fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), "utf8");
      this._cache = config; // 更新缓存
    } catch (error) {
      console.error("保存配置文件失败:", error.message);
      throw error;
    }
  }

  /**
   * 获取配置项
   * @param {string} key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue) {
    const config = this.load();
    return config[key] !== undefined ? config[key] : defaultValue;
  }

  /**
   * 设置配置项
   * @param {string} key - 配置键
   * @param {*} value - 配置值
   */
  set(key, value) {
    const config = this.load();
    config[key] = value;
    this.save(config);
  }

  /**
   * 删除配置项
   * @param {string} key - 配置键
   */
  delete(key) {
    const config = this.load();
    delete config[key];
    this.save(config);
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this._cache = null;
  }
}

// 配置管理器单例
export const configManager = new ConfigManager();

// ============================ 日志工具 ============================

/**
 * 日志级别枚举
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

/**
 * 简单日志工具
 */
class Logger {
  /**
   * @param {string} context - 日志上下文（模块名）
   */
  constructor(context) {
    this.context = context;
    this.level = LogLevel.INFO;
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @returns {string} 格式化后的日志
   */
  format(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   */
  debug(message) {
    if (this.level === LogLevel.DEBUG) {
      console.debug(this.format(LogLevel.DEBUG, message));
    }
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   */
  info(message) {
    console.log(this.format(LogLevel.INFO, message));
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   */
  warn(message) {
    console.warn(this.format(LogLevel.WARN, message));
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Error} [error] - 错误对象（可选）
   */
  error(message, error) {
    const fullMessage = error ? `${message}: ${error.message}` : message;
    console.error(this.format(LogLevel.ERROR, fullMessage));
  }
}

/**
 * 创建日志实例
 * @param {string} context - 日志上下文
 * @returns {Logger} 日志实例
 */
export function createLogger(context) {
  return new Logger(context);
}
