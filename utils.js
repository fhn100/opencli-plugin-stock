process.noDeprecation = true;

import { Database } from "duckdb-async";
import fs from "fs";
import { join } from "path";

function getDataDir() {
  const dataDir = join(import.meta.dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export async function getDbPath() {
  const dataDir = await getDataDir();
  const dbPath = join(dataDir, "stock.db");
  return dbPath;
}

export async function getConfigPath() {
  const dataDir = await getDataDir();
  const configPath = join(dataDir, "config");
  try {
    // 先判断文件是否存在
    fs.accessSync(configPath);
  } catch (err) {
    // 不存在 → 创建空文件
    fs.writeFileSync(configPath, "", "utf8");
  }
  return configPath;
}

export async function getDb() {
  const dbPath = await getDbPath();
  const conn = await Database.create(dbPath);
  await conn.run(`
    INSTALL http_request FROM community;
    LOAD http_request;
  `);
  return conn;
}

export async function getCookie() {
  const configPath = await getConfigPath();
  const cookie = fs.readFileSync(configPath, "utf8");
  if (!cookie) {
    throw new Error("请先在配置文件中配置cookie, 配置文件路径：" + configPath);
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

export async function initAccount() {
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
    const result = await stmt.all(cookie, userId, userId);
    console.log('同步账户成功, 共同步', result[0].Count, '条记录');
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
    const rows = await stmt.all(cookie, userId, userId, fundKey, startDate, endDate, page);
    count = rows[0].Count;
    console.log('同步交易记录成功, 账户：', fundKey, '页：', page, ' 记录数：', count);
    if (count < 1000) {
      return;
    }
    syncTradeByFundKey(fundKey, startDate, endDate, page + 1);
  } catch (e) {
    console.error("同步交易记录失败：", e);
  }
}

export async function syncTrade(startDate, endDate) {
  const conn = await getDb();
  try {
    // 创建交易匹配记录表
    const rows = await conn.all(`SELECT key FROM t_dict WHERE type = 'fund_key'`);
    for (let i = 0; i < rows.length; i++) {
      syncTradeByFundKey(rows[i].key, startDate, endDate, 1);
    }
  } catch (e) {
    console.error("同步交易记录失败：", e);
  }
}

export async function tradeMatch() {
  const conn = await getDb();
  try {
    const sql = `
      insert into t_trade_matched_record
      select
        t.account_id,
        t.account_name,
        STRFTIME(t.sell_time, '%Y') as trans_year,
        STRFTIME(t.sell_time, '%Y-%m') as trans_month,
        t.code,
        t.name,
        t.sell_entry_price,
        t.buy_entry_price,
        t.sell_entry_count,
        t.buy_entry_count,
        t.sell_entry_money,
        t.buy_entry_money,
        t.sell_transfer_fee,
        t.buy_transfer_fee,
        t.sell_moneychg - t.buy_moneychg as profit,
        t.sell_time,
        t.buy_time,
        t.sell_history_id,
        t.buy_history_id
      from (
        select 
          t.account_id,
          t.account_name,
          t.code,
          t.name,
          t.sell_entry_price,
          t.buy_entry_price,
          t.sell_entry_count,
          t.buy_entry_count,
          t.sell_entry_money,
          t.buy_entry_money,
          t.sell_transfer_fee,
          t.buy_transfer_fee,
          t.sell_moneychg,
          t.buy_moneychg,
          t.sell_time,
          t.buy_time,
          t.sell_history_id,
          t.buy_history_id,
          t.trans_times_sub,
          ROW_NUMBER() OVER (
            PARTITION BY t.sell_history_id
            ORDER BY t.trans_times_sub
          ) as sell_seq,
          ROW_NUMBER() OVER (
            PARTITION BY t.buy_history_id
            ORDER BY t.trans_times_sub
          ) as buy_seq
        from (
          select
            t1.account_id,
            t1.account_name,
            t1.code,
            t1.name,
            t1.entry_price as sell_entry_price,
            t2.entry_price as buy_entry_price,
            t1.entry_count as sell_entry_count,
            t2.entry_count as buy_entry_count,
            t1.entry_money as sell_entry_money,
            t2.entry_money as buy_entry_money,
            t1.transfer_fee as sell_transfer_fee,
            t2.transfer_fee as buy_transfer_fee,
            t1.moneychg as sell_moneychg,
            t2.moneychg as buy_moneychg,
            t1.entry_date_time as sell_time,
            t2.entry_date_time as buy_time,
            t1.history_id as sell_history_id,
            t2.history_id as buy_history_id,
            t1.trans_times - t2.trans_times as trans_times_sub
          from (
            select 
              t.account_id,
              t.account_name,
              t.code,
              t.name,
              t.entry_price,
              t.entry_count,
              t.entry_money,
              t.transfer_fee,
              if(t.entry_money = t.transfer_fee, t.entry_money, t.entry_money - t.transfer_fee) as moneychg,
              cast(t.entry_date_time as timestamp) as entry_date_time,
              t.history_id,
              epoch(cast(t.entry_date_time as timestamp)) as trans_times
            from t_trade_record t
            where t.op = 2
          ) t1
          inner join (
            select 
              t.account_id,
              t.account_name,
              t.code,
              t.name,
              t.entry_price,
              t.entry_count,
              t.entry_money,
              t.transfer_fee,
              if(t.entry_money = t.transfer_fee, t.entry_money, t.entry_money + t.transfer_fee) as moneychg,
              cast(t.entry_date_time as timestamp) as entry_date_time,
              t.history_id,
              epoch(cast(t.entry_date_time as timestamp)) as trans_times
            from t_trade_record t
            where t.op = 1
        ) t2 
        on t2.account_id = t1.account_id 
        and t2.code = t1.code 
        and t2.entry_count = t1.entry_count
        and t2.trans_times < t1.trans_times
      ) t
      left join (
          select 
              t.sell_history_id
          from t_trade_matched_record t
      ) t2 on t2.sell_history_id = t.sell_history_id
      left join (
          select 
              t.buy_history_id
          from t_trade_matched_record t
      ) t3 on t3.buy_history_id = t.buy_history_id
      where t2.sell_history_id is null 
      and t3.buy_history_id is null
      ) t
      where t.sell_seq = 1
      and t.buy_seq = 1
    `;
    const rows = await conn.all(sql);
    const count = rows[0].Count;
    console.log('匹配交易记录成功, 共匹配', count, '条记录');
    if (count == 0) {
      return;
    }
    tradeMatch();
  } catch (e) {
    console.error("匹配交易记录失败", e);
  }
}

export async function gridProfit(startMonth, endMonth) {
  let conn = null;
  let stmt = null;
  let rows = [];
  
  try {
    const sql = `
      select 
            t.account_name as 账户,
            replace(replace(t.trans_month, '-100', ''), '-101', '') as 时间,
            t.code as 股票代码,
            t.name as 股票名称,
            t.sell_count as 交易次数,
            t.grid_profit as 单次收益,
            t.total_profit as 总收益
        from (
            select 
                t.account_id,
                t.account_name,
                t.trans_year,
                t.trans_month,
                t.code,
                t.name,
                count(1) as sell_count,
                round(avg(t.profit), 2) as grid_profit,
                sum(t.profit) as total_profit
            from t_trade_matched_record t
            group by
                t.account_id,
                t.account_name,
                t.trans_year,
                t.trans_month,
                t.code,
                t.name
                
            union all
            select 
                t.account_id,
                t.account_name,
                t.trans_year,
                concat(t.trans_month, '-100') as trans_month,
                '' as code,
                '月收益' as name,
                '' as sell_count,
                '' as grid_profit,
                sum(t.profit) as total_profit
            from t_trade_matched_record t
            group by
                t.account_id,
                t.account_name,
                t.trans_year,
                t.trans_month
                
            union all
            select 
                t.account_id,
                t.account_name,
                t.trans_year,
                concat(max(t.trans_month), '-101') as trans_month,
                '' as code,
                '年收益' as name,
                '' as sell_count,
                '' as grid_profit,
                sum(t.profit) as total_profit
            from t_trade_matched_record t
            group by
                t.account_id,
                t.account_name,
                t.trans_year
        ) t
        WHERE 1=1
        AND (replace(replace(t.trans_month, '-100', ''), '-101', '') >= ?  AND replace(replace(t.trans_month, '-100', ''), '-101', '') <= ?)
        OR (replace(replace(t.trans_month, '-100', ''), '-101', '') >= ?  AND replace(replace(t.trans_month, '-100', ''), '-101', '') <= ?)
    `;
    conn = await getDb();
    stmt = await conn.prepare(sql);
    rows = await stmt.all(startMonth, endMonth, startMonth, endMonth);
  } catch (e) {
    console.error("查询网格收益失败", e);
    rows = []; // 发生异常时返回空数组
  } finally {
    if (stmt) {
      stmt.finalize();
    }
    if (conn) {
      conn.close();
    }
  }
  
  return rows;
}
