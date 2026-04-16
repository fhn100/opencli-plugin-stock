import { cli, Strategy } from '@jackwener/opencli/registry';
import { getDb, getConfig } from './db.js';


cli({
  site: 'grid',
  name: 'init',
  description: '初始化网格交易配置',
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async (_page) => {

    const conn = await getDb();

    try {
        await conn.run(`
            INSTALL http_request FROM community;  
            LOAD http_request;  
        `);
        await console.log('安装扩展成功')
    } catch (e) {
        await console.error('安装扩展失败：', e);
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
        await console.log('创建字典表成功')
    } catch (e) {
        await console.error('创建字典表失败：', e);
    }

    try {
        var config = await getConfig();
        config = config.trim();
        if (!config) {
          console.warn('请先在配置文件中配置cookie');
          return;
        }
        // 正则提取 userid
        const match = config.match(/userid=(\d+)/);
        const user_id = match ? match[1] : null;

        const stmt = await conn.prepare(`
            INSERT INTO t_dict (key, type, value)
            VALUES (?, ?, ?)
            ON CONFLICT (key) DO UPDATE SET
                type = excluded.type,
                value = excluded.value        
        `);
        await stmt.run('cookie', 'variable', config);
        await stmt.run('user_id', 'variable', user_id);
    } catch (e) {
        await console.error('安装扩展失败：', e);
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
        await console.log('创建股票交易记录表成功')
    } catch (e) {
        await console.error('创建股票交易记录表失败：', e);
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
        await console.log('创建交易匹配记录表成功')
    } catch (e) {
        await console.error('创建交易匹配记录表失败：', e);
    }
  },
});
