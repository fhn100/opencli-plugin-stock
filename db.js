import { Database } from "duckdb-async";
import { join } from "path";
import { getDataDir } from "./utils.js";

// ============================ 数据库连接 ============================

/** 获取数据库文件路径 */
export function getDbPath() {
  return join(getDataDir(), "stock.db");
}

/** 获取数据库连接（自动加载 HTTP 扩展） */
export async function getDb() {
  const conn = await Database.create(getDbPath());
  await conn.run("INSTALL http_request FROM community; LOAD http_request;");
  return conn;
}

/**
 * 安全释放数据库资源
 * @param {object} conn
 * @param {object} stmt
 */
export async function releaseDb(conn, stmt) {
  try {
    if (stmt) await stmt.finalize();
    if (conn) await conn.close();
  } catch (e) {
    console.error("释放数据库资源失败:", e);
  }
}

/**
 * 执行数据库操作的通用封装
 * 自动管理连接和预处理语句的生命周期
 * @param {function} fn - 接收 (conn, stmt) 的回调
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

// ============================ 常量 ============================

export const TABLE = {
  DICT: "t_dict",
  TRADE_RECORD: "t_trade_record",
  TRADE_MATCHED: "t_trade_matched_record",
};

export const PAGE_SIZE = 1000;

// ============================ SQL 定义 ============================

export const SQL = {
  CREATE_DICT: `
    CREATE TABLE IF NOT EXISTS ${TABLE.DICT}(
      key VARCHAR DEFAULT '' PRIMARY KEY,
      type VARCHAR DEFAULT '',
      value VARCHAR DEFAULT ''
    );`,

  CREATE_TRADE_RECORD: `
    CREATE TABLE IF NOT EXISTS ${TABLE.TRADE_RECORD} (
      account_id VARCHAR,
      account_name VARCHAR,
      account_type VARCHAR,
      code VARCHAR,
      commission DECIMAL(10,4),
      entry_cost DECIMAL(10,4),
      entry_count VARCHAR,
      entry_date VARCHAR,
      entry_money DECIMAL(10,4),
      entry_price DECIMAL(10,4),
      entry_time VARCHAR,
      entry_date_time VARCHAR,
      fee_total DECIMAL(10,4),
      history_id VARCHAR PRIMARY KEY,
      manual_id VARCHAR,
      market_code VARCHAR,
      name VARCHAR,
      oid INTEGER,
      op VARCHAR,
      op_name VARCHAR,
      transfer_fee DECIMAL(10,4)
    );`,

  CREATE_TRADE_MATCHED: `
    CREATE TABLE IF NOT EXISTS ${TABLE.TRADE_MATCHED}(
      account_id VARCHAR,
      account_name VARCHAR,
      trans_year VARCHAR,
      trans_month VARCHAR,
      code VARCHAR,
      "name" VARCHAR,
      sell_entry_price DECIMAL(10,4),
      buy_entry_price DECIMAL(10,4),
      sell_entry_count VARCHAR,
      buy_entry_count VARCHAR,
      sell_entry_money DECIMAL(10,4),
      buy_entry_money DECIMAL(10,4),
      sell_transfer_fee DECIMAL(10,4),
      buy_transfer_fee DECIMAL(10,4),
      profit DECIMAL(12,4),
      sell_time TIMESTAMP,
      buy_time TIMESTAMP,
      sell_history_id VARCHAR,
      buy_history_id VARCHAR,
      PRIMARY KEY(sell_history_id, buy_history_id)
    );`,

  SYNC_ACCOUNT: `
    WITH __input AS (
      SELECT http_post(
        'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v1/account_list',
        headers := { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'cookie': ? },
        params := { 'userid': ?, 'user_id': ?, 'terminal': '1', 'version': '0.0.0' }
      ) AS res
    ),
    __response AS (
      SELECT unnest(from_json(((decode(res.body)->>'ex_data')::JSON)->'common', '["json"]')) AS common FROM __input
    )
    INSERT OR REPLACE INTO ${TABLE.DICT}(key, type, value)
    SELECT t.common->>'fund_key' AS key, 'fund_key' AS type, t.common->>'manualname' AS value
    FROM __response t;`,

  SYNC_TRADE: `
    WITH __input AS (
      SELECT http_post(
        'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v2/get_money_history',
        headers := { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'cookie': ? },
        params := {
          'userid': ?, 'user_id': ?, 'fund_key': ?,
          'stock_code': '', 'stock_account': '',
          'start_date': ?, 'end_date': ?, 'page': ?,
          'count': '${PAGE_SIZE}', 'sort_type': '', 'sort_order': '1'
        }
      ) AS res
    ),
    __response AS (
      SELECT unnest(from_json(((decode(res.body)->>'ex_data')::JSON)->'list', '["json"]')) AS list FROM __input
    )
    INSERT OR REPLACE INTO ${TABLE.TRADE_RECORD}
      (account_id, account_name, account_type, code, commission, entry_cost, entry_count,
       entry_date, entry_money, entry_price, entry_time, entry_date_time, fee_total,
       history_id, manual_id, market_code, name, oid, op, op_name, transfer_fee)
    SELECT
      t1.list->>'account_id', t2.account_name, t1.list->>'account_type', t1.list->>'code',
      TRY_CAST(t1.list->>'commission' AS DECIMAL(10,4)),
      TRY_CAST(t1.list->>'entry_cost' AS DECIMAL(10,4)),
      t1.list->>'entry_count', t1.list->>'entry_date',
      TRY_CAST(t1.list->>'entry_money' AS DECIMAL(10,4)),
      TRY_CAST(t1.list->>'entry_price' AS DECIMAL(10,4)),
      t1.list->>'entry_time',
      concat(t1.list->>'entry_date', ' ', t1.list->>'entry_time'),
      TRY_CAST(t1.list->>'fee_total' AS DECIMAL(10,4)),
      concat(t1.list->>'account_id',
        EXTRACT(EPOCH FROM(((t1.list->>'entry_date')::DATE + (t1.list->>'entry_time')::TIME)::TIMESTAMP))::BIGINT,
        t1.list->>'code', t1.list->>'op', t1.list->>'entry_count'),
      t1.list->>'manual_id', t1.list->>'market_code', t1.list->>'name',
      t1.list->>'oid', t1.list->>'op', t1.list->>'op_name',
      TRY_CAST(t1.list->>'transfer_fee' AS DECIMAL(10,4))
    FROM __response t1
    INNER JOIN (
      SELECT key AS account_id, value AS account_name
      FROM ${TABLE.DICT} WHERE type = 'fund_key'
    ) t2 ON t2.account_id = (t1.list->>'account_id');`,

  TRADE_MATCH: `
    INSERT INTO ${TABLE.TRADE_MATCHED}
    SELECT
      t.account_id, t.account_name,
      STRFTIME(t.sell_time, '%Y'), STRFTIME(t.sell_time, '%Y-%m'),
      t.code, t.name,
      t.sell_entry_price, t.buy_entry_price,
      t.sell_entry_count, t.buy_entry_count,
      t.sell_entry_money, t.buy_entry_money,
      t.sell_transfer_fee, t.buy_transfer_fee,
      t.sell_moneychg - t.buy_moneychg,
      t.sell_time, t.buy_time,
      t.sell_history_id, t.buy_history_id
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY t.sell_history_id ORDER BY t.trans_times_sub) AS sell_seq,
                ROW_NUMBER() OVER (PARTITION BY t.buy_history_id ORDER BY t.trans_times_sub) AS buy_seq
      FROM (
        SELECT
          t1.account_id, t1.account_name, t1.code, t1.name,
          t1.entry_price AS sell_entry_price, t2.entry_price AS buy_entry_price,
          t1.entry_count AS sell_entry_count, t2.entry_count AS buy_entry_count,
          t1.entry_money AS sell_entry_money, t2.entry_money AS buy_entry_money,
          t1.transfer_fee AS sell_transfer_fee, t2.transfer_fee AS buy_transfer_fee,
          t1.moneychg AS sell_moneychg, t2.moneychg AS buy_moneychg,
          t1.entry_date_time AS sell_time, t2.entry_date_time AS buy_time,
          t1.history_id AS sell_history_id, t2.history_id AS buy_history_id,
          t1.trans_times - t2.trans_times AS trans_times_sub
        FROM (
          SELECT
            t.account_id, t.account_name, t.code, t.name,
            t.entry_price, t.entry_count, t.entry_money, t.transfer_fee,
            IF(t.entry_money = t.transfer_fee, t.entry_money, t.entry_money - t.transfer_fee) AS moneychg,
            CAST(t.entry_date_time AS TIMESTAMP) AS entry_date_time,
            t.history_id,
            EPOCH(CAST(t.entry_date_time AS TIMESTAMP)) AS trans_times
          FROM ${TABLE.TRADE_RECORD} t WHERE t.op = 2
        ) t1
        INNER JOIN (
          SELECT
            t.account_id, t.account_name, t.code, t.name,
            t.entry_price, t.entry_count, t.entry_money, t.transfer_fee,
            IF(t.entry_money = t.transfer_fee, t.entry_money, t.entry_money + t.transfer_fee) AS moneychg,
            CAST(t.entry_date_time AS TIMESTAMP) AS entry_date_time,
            t.history_id,
            EPOCH(CAST(t.entry_date_time AS TIMESTAMP)) AS trans_times
          FROM ${TABLE.TRADE_RECORD} t WHERE t.op = 1
        ) t2
        ON t2.account_id = t1.account_id AND t2.code = t1.code
           AND t2.entry_count = t1.entry_count AND t2.trans_times < t1.trans_times
      ) t
      LEFT JOIN (SELECT sell_history_id FROM ${TABLE.TRADE_MATCHED}) t2 ON t2.sell_history_id = t.sell_history_id
      LEFT JOIN (SELECT buy_history_id FROM ${TABLE.TRADE_MATCHED}) t3 ON t3.buy_history_id = t.buy_history_id
      WHERE t2.sell_history_id IS NULL AND t3.buy_history_id IS NULL
    ) t
    WHERE t.sell_seq = 1 AND t.buy_seq = 1;`,

  GRID_PROFIT: `
    WITH stock_rows AS (
      SELECT account_id, account_name,
        strftime(sell_time, '%Y-%m') AS sell_date, code, name,
        CAST(count(1) AS INTEGER) AS sell_count,
        round(avg(profit), 2) AS grid_profit,
        CAST(sum(profit) AS DOUBLE) AS total_profit,
        'stock' AS row_type
      FROM ${TABLE.TRADE_MATCHED}
      GROUP BY account_id, account_name, sell_date, code, name
    ),
    month_rows AS (
      SELECT account_id, account_name,
        strftime(sell_time, '%Y-%m') AS sell_date,
        '' AS code, '月收益' AS name,
        '' AS sell_count, '' AS grid_profit,
        CAST(sum(profit) AS DOUBLE) AS total_profit,
        'month' AS row_type
      FROM ${TABLE.TRADE_MATCHED}
      GROUP BY account_id, account_name, sell_date
    ),
    year_rows AS (
      SELECT account_id, account_name,
        strftime(max(sell_time), '%Y-%m') AS sell_date,
        '' AS code, '年收益' AS name,
        '' AS sell_count, '' AS grid_profit,
        CAST(sum(profit) AS DOUBLE) AS total_profit,
        'year' AS row_type
      FROM ${TABLE.TRADE_MATCHED}
      WHERE strftime(sell_time, '%Y-%m') <= ?
      GROUP BY account_id, account_name, strftime(sell_time, '%Y')
    )
    SELECT
      substr(t.account_name, 1, strpos(t.account_name, '-')) || substr(t.account_name, strpos(t.account_name, '-') + 1, 1) || '*' AS 账户, t.sell_date AS 时间,
      t.code AS 股票代码, t.name AS 股票名称,
      t.sell_count AS 交易次数, t.grid_profit AS 单次收益,
      t.total_profit AS 总收益
    FROM (
      SELECT * FROM stock_rows
      UNION ALL SELECT * FROM month_rows
      UNION ALL SELECT * FROM year_rows
    ) t
    WHERE t.sell_date >= ? AND t.sell_date <= ?
       OR t.row_type = 'year' AND substr(t.sell_date, 1, 4) = substr(?, 1, 4)
    ORDER BY t.account_name, t.sell_date,
      CASE t.row_type WHEN 'stock' THEN 1 WHEN 'month' THEN 2 WHEN 'year' THEN 3 END,
      t.total_profit DESC;`,
};
