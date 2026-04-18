process.noDeprecation = true;

import { Database } from "duckdb-async";
import fs from "fs";
import { join } from "path";

// ============================ 常量定义 ============================
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};
const API_URLS = {
  ACCOUNT_LIST: 'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v1/account_list',
  MONEY_HISTORY: 'https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb/caishen_fund/pc/account/v2/get_money_history'
};
const TABLE_NAMES = {
  DICT: 't_dict',
  TRADE_RECORD: 't_trade_record',
  TRADE_MATCHED: 't_trade_matched_record'
};
const PAGE_SIZE = 1000;

// ============================ 工具函数 ============================
/**
 * 获取数据目录（确保目录存在）
 * @returns {string} 数据目录路径
 */
function getDataDir() {
  const dataDir = join(import.meta.dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

/**
 * 安全的数据库连接释放函数
 * @param {object} conn 数据库连接
 * @param {object} stmt 预处理语句
 */
async function releaseDbResources(conn, stmt) {
  try {
    if (stmt) await stmt.finalize();
    if (conn) await conn.close();
  } catch (error) {
    console.error('释放数据库资源失败:', error);
  }
}

// ============================ 路径相关 ============================
/**
 * 获取数据库文件路径
 * @returns {Promise<string>} 数据库路径
 */
export async function getDbPath() {
  const dataDir = getDataDir();
  return join(dataDir, "stock.db");
}

/**
 * 获取配置文件路径（确保文件存在）
 * @returns {Promise<string>} 配置文件路径
 */
export async function getConfigPath() {
  const dataDir = getDataDir();
  const configPath = join(dataDir, "config");
  
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, "", "utf8");
  }
  
  return configPath;
}

// ============================ 配置相关 ============================
/**
 * 获取Cookie配置
 * @returns {Promise<string>} Cookie字符串
 * @throws {Error} 未配置Cookie时抛出异常
 */
export async function getCookie() {
  const configPath = await getConfigPath();
  const cookie = fs.readFileSync(configPath, "utf8").trim();
  
  if (!cookie) {
    throw new Error(`请先在配置文件中配置cookie, 配置文件路径：${configPath}`);
  }
  
  return cookie;
}

/**
 * 从Cookie中提取用户ID
 * @returns {Promise<string>} 用户ID
 * @throws {Error} Cookie格式错误时抛出异常
 */
export async function getUserId() {
  const cookie = await getCookie();
  const match = cookie.match(/userid=(\d+)/);
  
  if (!match?.[1]) {
    throw new Error("配置文件中的cookie格式不正确，无法提取userid");
  }
  
  return match[1].trim();
}

// ============================ 数据库连接 ============================
/**
 * 获取数据库连接（加载必要扩展）
 * @returns {Promise<object>} 数据库连接实例
 */
export async function getDb() {
  const dbPath = await getDbPath();
  const conn = await Database.create(dbPath);
  
  // 安装并加载HTTP扩展
  await conn.run(`
    INSTALL http_request FROM community;
    LOAD http_request;
  `);
  
  return conn;
}

// ============================ SQL语句定义 ============================
const SQL_CREATE_TABLES = {
  DICT: `
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.DICT}(
      key VARCHAR DEFAULT '' PRIMARY KEY,  -- 字典键
      type VARCHAR DEFAULT '',             -- 字典类型
      value VARCHAR DEFAULT ''             -- 字典值
    );
  `,
  TRADE_RECORD: `
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.TRADE_RECORD} (
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
  `,
  TRADE_MATCHED: `
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.TRADE_MATCHED}(
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
  `
};

const SQL_SYNC_ACCOUNT = `
  WITH __input AS (
    SELECT
    http_post(
        '${API_URLS.ACCOUNT_LIST}',
        headers := {
          'User-Agent': '${HTTP_HEADERS['User-Agent']}',
          'Content-Type': '${HTTP_HEADERS['Content-Type']}',
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
  INSERT OR REPLACE INTO ${TABLE_NAMES.DICT}(key, type, value)
  SELECT
      t.common->>'fund_key' AS key,
      'fund_key' as type,
      t.common->>'manualname' AS value
  FROM
  __response t
  ;
`;

const SQL_SYNC_TRADE = `
  WITH __input AS (
    SELECT
    http_post(
      '${API_URLS.MONEY_HISTORY}',
        headers := {
        'User-Agent': '${HTTP_HEADERS['User-Agent']}',
        'Content-Type': '${HTTP_HEADERS['Content-Type']}',
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
      'count': '${PAGE_SIZE}',
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
  INSERT OR REPLACE INTO ${TABLE_NAMES.TRADE_RECORD} (account_id, account_name, account_type, code, commission, entry_cost, entry_count, entry_date, entry_money, entry_price, entry_time, entry_date_time, fee_total, history_id, manual_id, market_code, name, oid, op, op_name, transfer_fee)
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
    FROM ${TABLE_NAMES.DICT}
    WHERE type = 'fund_key'
  ) t2 on t2.account_id = (t1.list->>'account_id');
`;

const SQL_TRADE_MATCH = `
  insert into ${TABLE_NAMES.TRADE_MATCHED}
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
        from ${TABLE_NAMES.TRADE_RECORD} t
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
        from ${TABLE_NAMES.TRADE_RECORD} t
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
      from ${TABLE_NAMES.TRADE_MATCHED} t
  ) t2 on t2.sell_history_id = t.sell_history_id
  left join (
      select 
          t.buy_history_id
      from ${TABLE_NAMES.TRADE_MATCHED} t
  ) t3 on t3.buy_history_id = t.buy_history_id
  where t2.sell_history_id is null 
  and t3.buy_history_id is null
  ) t
  where t.sell_seq = 1
  and t.buy_seq = 1
`;

const SQL_GRID_PROFIT = `
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
        from ${TABLE_NAMES.TRADE_MATCHED} t
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
        from ${TABLE_NAMES.TRADE_MATCHED} t
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
        from ${TABLE_NAMES.TRADE_MATCHED} t
        where t.trans_month <= ?
        group by
            t.account_id,
            t.account_name,
            t.trans_year
    ) t
    WHERE (t.name NOT IN ('月收益', '年收益') AND replace(replace(t.trans_month, '-100', ''), '-101', '') >= ? AND replace(replace(t.trans_month, '-100', ''), '-101', '') <= ?)
       OR (t.name = '月收益' AND replace(replace(t.trans_month, '-100', ''), '-101', '') >= ? AND replace(replace(t.trans_month, '-100', ''), '-101', '') <= ?)
       OR (t.name = '年收益' AND t.trans_year = substr(?, 1, 4))
`;

// ============================ 数据库初始化 ============================
/**
 * 初始化数据库表结构
 * @returns {Promise<void>}
 */
export async function initDb() {
  const conn = await getDb();
  
  try {
    // 创建字典表
    await conn.run(SQL_CREATE_TABLES.DICT);
    console.log('字典表初始化成功');
  } catch (e) {
    console.error("创建字典表失败：", e);
    throw e; // 抛出异常让上层处理
  }

  try {
    // 创建股票交易记录表
    await conn.run(SQL_CREATE_TABLES.TRADE_RECORD);
    console.log('股票交易记录表初始化成功');
  } catch (e) {
    console.error("创建股票交易记录表失败：", e);
    throw e;
  }

  try {
    // 创建交易匹配记录表
    await conn.run(SQL_CREATE_TABLES.TRADE_MATCHED);
    console.log('交易匹配记录表初始化成功');
  } catch (e) {
    console.error("创建交易匹配记录表失败：", e);
    throw e;
  } finally {
    await conn.close();
  }
}

// ============================ 账户同步 ============================
/**
 * 同步账户信息到字典表
 * @returns {Promise<void>}
 */
export async function initAccount() {
  const conn = await getDb();
  let stmt = null;
  
  try {
    stmt = await conn.prepare(SQL_SYNC_ACCOUNT);
    const cookie = await getCookie();
    const userId = await getUserId();
    const result = await stmt.all(cookie, userId, userId);
    
    const count = result[0]?.Count || 0;
    console.log('同步账户成功, 共同步', count, '条记录');
  } catch (e) {
    console.error("同步账户失败：", e);
    throw e;
  } finally {
    await releaseDbResources(conn, stmt);
  }
}

// ============================ 交易记录同步 ============================
/**
 * 按基金KEY同步交易记录（分页）
 * @param {string} fundKey 基金KEY
 * @param {string} startDate 开始日期
 * @param {string} endDate 结束日期
 * @param {number} page 页码（从1开始）
 * @returns {Promise<void>}
 */
export async function syncTradeByFundKey(fundKey, startDate, endDate, page = 1) {
  const conn = await getDb();
  let stmt = null;
  
  try {
    stmt = await conn.prepare(SQL_SYNC_TRADE);
    const cookie = await getCookie();
    const userId = await getUserId();
    
    const rows = await stmt.all(cookie, userId, userId, fundKey, startDate, endDate, page);
    const count = rows[0]?.Count || 0;
    
    console.log('同步交易记录成功, 账户：', fundKey, '页：', page, ' 记录数：', count);
    
    // 递归获取下一页（使用异步递归避免调用栈溢出）
    if (count >= PAGE_SIZE) {
      await syncTradeByFundKey(fundKey, startDate, endDate, page + 1);
    }
  } catch (e) {
    console.error(`同步交易记录失败（fundKey: ${fundKey}, page: ${page}）：`, e);
    throw e;
  } finally {
    await releaseDbResources(conn, stmt);
  }
}

/**
 * 同步所有账户的交易记录
 * @param {string} startDate 开始日期
 * @param {string} endDate 结束日期
 * @returns {Promise<void>}
 */
export async function syncTrade(startDate, endDate) {
  const conn = await getDb();
  
  try {
    const rows = await conn.all(`SELECT key FROM ${TABLE_NAMES.DICT} WHERE type = 'fund_key'`);
    
    // 串行处理避免并发过高
    for (const row of rows) {
      await syncTradeByFundKey(row.key, startDate, endDate, 1);
    }
    
    console.log('所有账户交易记录同步完成');
  } catch (e) {
    console.error("同步交易记录失败：", e);
    throw e;
  } finally {
    await conn.close();
  }
}

// ============================ 交易匹配 ============================
/**
 * 匹配交易记录（买入/卖出）
 * @returns {Promise<void>}
 */
export async function tradeMatch() {
  const conn = await getDb();
  let totalMatched = 0;

  try {
    let count = -1;
    while (count !== 0) {
      const rows = await conn.all(SQL_TRADE_MATCH);
      count = Number(rows[0]?.Count) || 0;
      totalMatched += count;
      if (count > 0) {
        console.log(`匹配交易记录成功, 本轮匹配 ${count} 条`);
      }
    }
    console.log(`匹配交易记录完成，本次共新增 ${totalMatched} 条匹配`);
  } catch (e) {
    console.error("匹配交易记录失败：", e);
    throw e;
  } finally {
    await conn.close();
  }
}

// ============================ 收益计算 ============================
/**
 * 查询网格收益
 * @param {string} startMonth 开始月份（格式：YYYY-MM）
 * @param {string} endMonth 结束月份（格式：YYYY-MM）
 * @returns {Promise<Array>} 收益数据
 */
export async function gridProfit(startMonth, endMonth) {
  let conn = null;
  let stmt = null;
  
  try {
    conn = await getDb();
    stmt = await conn.prepare(SQL_GRID_PROFIT);
    const rows = await stmt.all(endMonth, startMonth, endMonth, startMonth, endMonth, startMonth);
    
    return rows || [];
  } catch (e) {
    console.error("查询网格收益失败：", e);
    return [];
  } finally {
    await releaseDbResources(conn, stmt);
  }
}
