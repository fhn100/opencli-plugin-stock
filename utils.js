process.noDeprecation = true;

import duckdb from "duckdb";
import fs from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_PATH = join(DATA_DIR, "config");
try {
  // 先判断文件是否存在
  fs.accessSync(CONFIG_PATH);
} catch (err) {
  // 不存在 → 创建空文件
  fs.writeFileSync(CONFIG_PATH, "", "utf8");
}
console.log("配置文件路径：" + CONFIG_PATH);
const DB_PATH = join(DATA_DIR, "grid.db");
console.log("数据库文件路径：" + DB_PATH);

let _instance = null;
initDb();

export async function getDb() {
  if (!_instance) {
    _instance = new duckdb.Database(DB_PATH);
  }
  return _instance.connect();
}

export async function getCookie() {
  const cookie = fs.readFileSync(CONFIG_PATH, "utf8");
  if (!cookie) {
    throw new Error("请先在配置文件中配置cookie");
  }
  return cookie.trim();
}

export async function getUserId() {
  var cookie = await getCookie();
  // 正则提取 userid
  const match = cookie.match(/userid=(\d+)/);
  const userId = match ? match[1] : null;
  if (!userId) {
    throw new Error("配置文件中的cookie格式不正确");
  }
  return userId.trim();
}

export async function initDb() {
  const conn = await getDb();
  try {
    await conn.run(`
      INSTALL http_request FROM community;
      LOAD http_request;
    `);
  } catch (e) {
    console.error("安装扩展失败：", e);
  }

  try {
    // 创建字典表
    await conn.run(`
      CREATE TABLE IF NOT EXISTS t_dict(
        key VARCHAR DEFAULT '' PRIMARY KEY,  -- 字典键
        type VARCHAR DEFAULT '',             -- 字典类型
        value VARCHAR DEFAULT ''             -- 字典值
      );
    `);
  } catch (e) {
    console.error("创建字典表失败：", e);
  }

  try {
    // 创建股票交易记录表
    await conn.run(`
      CREATE TABLE IF NOT EXISTS t_trade_record (
        account_id VARCHAR,           		-- 账户ID
        account_name VARCHAR,           	-- 账户名称
        account_type VARCHAR,         		-- 账户类型
        code VARCHAR,                 		-- 股票代码
        commission DECIMAL(10,4),     		-- 交易佣金
        entry_cost DECIMAL(10,4),     		-- 入账成本
        entry_count VARCHAR,          		-- 入账数量
        entry_date VARCHAR,              	-- 入账日期
        entry_money DECIMAL(10,4),    		-- 入账金额
        entry_price DECIMAL(10,4),    		-- 入账价格
        entry_time VARCHAR,            		-- 入账时间
        entry_date_time VARCHAR,            -- 交易时间
        fee_total DECIMAL(10,4),      		-- 总费用
        history_id VARCHAR PRIMARY KEY,     -- 历史ID
        manual_id VARCHAR,            		-- 手工ID
        market_code VARCHAR,          		-- 市场代码
        name VARCHAR,                 		-- 股票名称
        oid INTEGER,                  		-- 订单ID
        op VARCHAR,                   		-- 操作代码
        op_name VARCHAR,              		-- 操作名称
        transfer_fee DECIMAL(10,4)   		-- 交易费用
      );
    `);
  } catch (e) {
    console.error("创建股票交易记录表失败：", e);
  }

  try {
    // 创建交易匹配记录表
    await conn.run(`
      CREATE TABLE IF NOT EXISTS t_trade_matched_record(
        account_id VARCHAR,
        account_name VARCHAR,
        trans_year VARCHAR,
        trans_month VARCHAR,
        code VARCHAR,
        "name" VARCHAR,
        sell_entry_price DECIMAL(10, 4),
        buy_entry_price DECIMAL(10, 4),
        sell_entry_count VARCHAR,
        buy_entry_count VARCHAR,
        sell_entry_money DECIMAL(10, 4),
        buy_entry_money DECIMAL(10, 4),
        sell_transfer_fee DECIMAL(10, 4),
        buy_transfer_fee DECIMAL(10, 4),
        profit DECIMAL(12, 4),
        sell_time TIMESTAMP,
        buy_time TIMESTAMP,
        sell_history_id VARCHAR,
        buy_history_id VARCHAR,
        PRIMARY KEY(sell_history_id, buy_history_id)
      );
    `);
  } catch (e) {
    console.error("创建交易匹配记录表失败：", e);
  }
}

export async function syncAccount() {
  const conn = await getDb();
  try {
    // 同步账户
    var stmt = await conn.prepare(`
      WITH __input AS (
        SELECT
        http_post(
            'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v1/account_list',
            headers := {
              'User-Agent': 'Mozilla/5.0',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'cookie': ?
            },
            params := {
              'userid': ?,
              'user_id': ?,
              'terminal': '1',
              'version': '0.0.0'
            }
        ) AS res
      ),
      __response AS (
      SELECT
          unnest(from_json(((decode(res.body)->>'ex_data')::JSON)->'common', '["json"]')) AS common
      FROM
          __input
      )
      INSERT OR REPLACE INTO t_dict(key, type, value)
      SELECT
          t.common->>'fund_key' AS key,
          'fund_key' as type,
          t.common->>'manualname' AS value
      FROM
      __response t
      ;
    `);
    const cookie = await getCookie();
    const userId = await getUserId();
    await stmt.all(cookie, userId, userId, function(err, rows) {
        if (err) {
            console.error("同步账户失败：", err);
            return;
        }
        console.log('同步账户成功, 共同步', rows[0].Count, '条记录');
    });
  } catch (e) {
    console.error("同步账户失败：", e);
  }
}

export async function syncTradeByFundKey(fundKey, startDate, endDate, page) {
  const conn = await getDb();
  try {
    // 创建交易匹配记录表
    const stmt = await conn.prepare(`
      WITH __input AS (
        SELECT
        http_post(
          'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v2/get_money_history',
            headers := {
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'cookie': ?
          },
        params := {
          'userid': ?,
          'user_id': ?,
          'fund_key': ?,
          'stock_code': '',
          'stock_account': '',
          'start_date': ?,
          'end_date': ?,
          'page': ?,
          'count': '1000',
          'sort_type': '',
          'sort_order': '1'
        }
        ) AS res
      ),
      __response AS (
      SELECT
        unnest(from_json(((decode(res.body)->>'ex_data')::JSON)->'list', '["json"]')) AS list
      FROM
        __input
      )
      INSERT OR REPLACE INTO t_trade_record (account_id, account_name, account_type, code, commission, entry_cost, entry_count, entry_date, entry_money, entry_price, entry_time, entry_date_time, fee_total, history_id, manual_id, market_code, name, oid, op, op_name, transfer_fee)
      SELECT
        t1.list->>'account_id' AS account_id,
        t2.account_name,
        t1.list->>'account_type' AS account_type,
        t1.list->>'code' AS code,
        TRY_CAST(t1.list->>'commission' AS DECIMAL(10,4)) AS commission,
        TRY_CAST(t1.list->>'entry_cost' AS DECIMAL(10,4)) AS entry_cost,
        t1.list->>'entry_count' AS entry_count,
        t1.list->>'entry_date' AS entry_date,
        TRY_CAST(t1.list->>'entry_money' AS DECIMAL(10,4)) AS entry_money,
        TRY_CAST(t1.list->>'entry_price' AS DECIMAL(10,4)) AS entry_price,
        t1.list->>'entry_time' AS entry_time,
        concat(t1.list->>'entry_date', ' ',t1.list->>'entry_time') AS entry_date_time,
        TRY_CAST(t1.list->>'fee_total' AS DECIMAL(10,4)) AS fee_total,
        concat(t1.list->>'account_id', EXTRACT(EPOCH FROM(((t1.list->>'entry_date')::DATE + (t1.list->>'entry_time')::TIME)::TIMESTAMP))::BIGINT, t1.list->>'code', t1.list->>'op', t1.list->>'entry_count') AS history_id,
        t1.list->>'manual_id' AS manual_id,
        t1.list->>'market_code' AS market_code,
        t1.list->>'name' AS name,
        t1.list->>'oid' AS oid,
        t1.list->>'op' AS op,
        t1.list->>'op_name' AS op_name,
        TRY_CAST(t1.list->>'transfer_fee' AS DECIMAL(10,4)) AS transfer_fee
      FROM __response t1
      INNER JOIN (
        SELECT
          key as account_id,
          value as account_name
        FROM t_dict
        WHERE type = 'fund_key'
      ) t2 on t2.account_id = (t1.list->>'account_id');
    `);
    const cookie = await getCookie();
    const userId = await getUserId();
    let count = 0;
    await stmt.all(cookie, userId, userId, fundKey, startDate, endDate, page, function(err, rows) {
      if (err) {
          console.error("同步交易记录失败：", err);
          return;
      }
      count = rows[0].Count;
      console.log('同步交易记录成功, 账户：', fundKey, '页：', page, ' 记录数：', count);
      if (count < 1000) {
        return;
      }
      page++;
      syncTrade(fundKey, startDate, endDate, page);
    });
  } catch (e) {
    console.error("同步交易记录失败：", e);
  }
}

export async function syncTrade(startDate, endDate) {
  const conn = await getDb();
  try {
    // 创建交易匹配记录表
    await conn.all(`SELECT key FROM t_dict WHERE type = 'fund_key'`, function(err, rows) {
      if (err) {
          console.error("同步交易记录失败：", err);
          return;
      }
      for (let i = 0; i < rows.length; i++) {
        syncTradeByFundKey(rows[i].key, startDate, endDate, 1);
      }
    });
  } catch (e) {
    console.error("同步交易记录失败：", e);
  }
}
