import { Database } from "duckdb-async";
import { join } from "path";
import { getDataDir } from "./utils.js";
import { TABLE, PAGE_SIZE } from "./constants.js";
import { CREATE_DICT, CREATE_TRADE_RECORD, CREATE_TRADE_MATCHED } from "./sql-schema.js";
import { SYNC_ACCOUNT, SYNC_TRADE } from "./sql-sync.js";
import { TRADE_MATCH } from "./sql-match.js";
import { GRID_PROFIT } from "./sql-profit.js";

// ============================ 数据库连接管理 ============================

/**
 * 数据库连接管理器（单例模式）
 */
class DatabaseManager {
  constructor() {
    this._conn = null;
    this._httpLoaded = false;
  }

  /**
   * 获取数据库文件路径
   * @returns {string} 数据库文件路径
   */
  getDbPath() {
    return join(getDataDir(), "stock.db");
  }

  /**
   * 获取数据库连接（复用连接）
   * @returns {Promise<object>} 数据库连接对象
   */
  async getConnection() {
    if (!this._conn) {
      this._conn = await Database.create(this.getDbPath());
    }
    
    // HTTP 扩展只需加载一次
    if (!this._httpLoaded) {
      await this._conn.run("INSTALL http_request FROM community; LOAD http_request;");
      this._httpLoaded = true;
    }
    
    return this._conn;
  }

  /**
   * 关闭数据库连接
   */
  async closeConnection() {
    if (this._conn) {
      try {
        await this._conn.close();
      } catch (e) {
        console.error("关闭数据库连接失败:", e);
      }
      this._conn = null;
      this._httpLoaded = false;
    }
  }
}

// 单例实例
const dbManager = new DatabaseManager();

// ============================ 导出函数 ============================

/**
 * 获取数据库文件路径
 * @returns {string} 数据库文件路径
 */
export function getDbPath() {
  return dbManager.getDbPath();
}

/**
 * 获取数据库连接（自动加载 HTTP 扩展）
 * @returns {Promise<object>} 数据库连接对象
 */
export async function getDb() {
  return dbManager.getConnection();
}

/**
 * 安全释放数据库资源（现在连接由管理器管理，此函数保留兼容性）
 * @param {object} conn - 数据库连接
 * @param {object} stmt - 预处理语句
 */
export async function releaseDb(conn, stmt) {
  try {
    if (stmt) await stmt.finalize();
    // 连接由 DatabaseManager 管理，不再关闭
  } catch (e) {
    console.error("释放数据库资源失败:", e);
  }
}

/**
 * 执行数据库操作的通用封装
 * 自动管理预处理语句的生命周期
 * @param {Function} fn - 接收 (conn, stmt) 的回调
 * @param {string} [sql] - 预处理 SQL（如提供则自动 prepare）
 * @returns {Promise<*>} fn 的返回值
 */
export async function withDb(fn, sql) {
  const conn = await getDb();
  const stmt = sql ? await conn.prepare(sql) : null;
  try {
    return await fn(conn, stmt);
  } finally {
    await releaseDb(conn, stmt);
  }
}

/**
 * 关闭数据库管理器（程序退出时调用）
 */
export async function closeDbManager() {
  await dbManager.closeConnection();
}

// ============================ 常量 ============================

/**
 * SQL 定义对象（导出给其他模块使用）
 */
export const SQL = {
  CREATE_DICT,
  CREATE_TRADE_RECORD,
  CREATE_TRADE_MATCHED,
  SYNC_ACCOUNT,
  SYNC_TRADE,
  TRADE_MATCH,
  GRID_PROFIT,
};
