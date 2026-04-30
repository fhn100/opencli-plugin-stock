process.noDeprecation = true;

import fs from "fs";
import { join } from "path";
import { getCookie, getUserId } from "./utils.js";
import { TABLE } from "./constants.js";
import { SQL, withDb } from "./db.js";

// ============================ 数据库初始化 ============================

/**
 * 初始化数据库表结构
 * 创建字典表、交易记录表、交易匹配表
 */
export async function initDb() {
  await withDb(async (conn) => {
    for (const [name, sql] of Object.entries({
      "字典表": SQL.CREATE_DICT,
      "交易记录表": SQL.CREATE_TRADE_RECORD,
      "交易匹配表": SQL.CREATE_TRADE_MATCHED,
    })) {
      await conn.run(sql);
      console.log(`${name}初始化成功`);
    }
  });
}

// ============================ 账户同步 ============================

/**
 * 同步账户信息到字典表
 * 从 API 获取账户列表并存储到本地数据库
 */
export async function initAccount() {
  const cookie = await getCookie();
  const userId = await getUserId();

  const count = await withDb(async (_conn, stmt) => {
    const rows = await stmt.all(cookie, userId, userId);
    return rows[0]?.Count || 0;
  }, SQL.SYNC_ACCOUNT);

  console.log("同步账户成功, 共同步", count, "条记录");
}

// ============================ 交易记录同步 ============================

/**
 * 按基金KEY同步交易记录（分页）
 * @param {string} fundKey - 基金KEY
 * @param {string} startDate - 开始日期 YYYYMMDD
 * @param {string} endDate - 结束日期 YYYYMMDD
 * @param {number} [page=1] - 页码
 * @returns {Promise<number>} 同步的记录数
 */
export async function syncTradeByFundKey(fundKey, startDate, endDate, page = 1) {
  const cookie = await getCookie();
  const userId = await getUserId();

  const count = await withDb(async (_conn, stmt) => {
    const rows = await stmt.all(cookie, userId, userId, fundKey, startDate, endDate, page);
    const n = rows[0]?.Count || 0;
    console.log(`同步交易记录成功, 账户: ${fundKey}, 页: ${page}, 记录数: ${n}`);
    return n;
  }, SQL.SYNC_TRADE);

  if (count >= 1000) {
    await syncTradeByFundKey(fundKey, startDate, endDate, page + 1);
  }
  
  return count;
}

/**
 * 同步所有账户的交易记录（并行处理）
 * @param {string} startDate - 开始日期 YYYYMMDD
 * @param {string} endDate - 结束日期 YYYYMMDD
 * @param {number} [concurrency=3] - 并发数
 */
export async function syncTrade(startDate, endDate, concurrency = 3) {
  await withDb(async (conn) => {
    const rows = await conn.all(`SELECT key FROM ${TABLE.DICT} WHERE type = 'fund_key'`);
    const fundKeys = rows.map(row => row.key);
    
    console.log(`开始同步 ${fundKeys.length} 个账户，并发数: ${concurrency}`);
    
    // 分批并行处理
    for (let i = 0; i < fundKeys.length; i += concurrency) {
      const batch = fundKeys.slice(i, i + concurrency);
      const promises = batch.map(fundKey => 
        syncTradeByFundKey(fundKey, startDate, endDate).catch(error => {
          console.error(`账户 ${fundKey} 同步失败:`, error.message);
          return { fundKey, success: false, error: error.message };
        })
      );
      
      const results = await Promise.all(promises);
      
      // 统计本批次结果
      const successCount = results.filter(r => r === undefined).length; // syncTradeByFundKey 成功返回 undefined
      const failCount = results.filter(r => r && r.success === false).length;
      
      if (failCount > 0) {
        console.warn(`本批次 ${batch.length} 个账户: ${successCount} 成功, ${failCount} 失败`);
      }
    }
    
    console.log("所有账户交易记录同步完成");
  });
}

// ============================ 交易匹配 ============================

/**
 * 匹配交易记录（买入/卖出），循环直到无可匹配记录
 * 使用时间序列分析将买入和卖出记录配对
 */
export async function tradeMatch() {
  await withDb(async (conn) => {
    let total = 0;
    let count = -1;
    while (count !== 0) {
      const rows = await conn.all(SQL.TRADE_MATCH);
      count = Number(rows[0]?.Count) || 0;
      total += count;
      if (count > 0) console.log(`匹配交易记录成功, 本轮匹配 ${count} 条`);
    }
    console.log(`匹配交易记录完成，本次共新增 ${total} 条匹配`);
  });
}

// ============================ 收益查询 ============================

/**
 * 查询网格收益
 * @param {string} startMonth - 开始月份 YYYY-MM
 * @param {string} endMonth - 结束月份 YYYY-MM
 * @returns {Promise<Array>} 收益数据数组，包含股票、月收益、年收益统计
 */
export async function gridProfit(startMonth, endMonth) {
  try {
    return await withDb(async (_conn, stmt) => {
      return await stmt.all(endMonth, startMonth, endMonth, startMonth);
    }, SQL.GRID_PROFIT);
  } catch (e) {
    console.error("查询网格收益失败:", e);
    return [];
  }
}
