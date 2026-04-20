---
name: stock-skill
description: "股票交易数据管理技能，支持初始化、数据同步、交易匹配和收益统计。使用场景：查看网格交易收益、同步交易数据、匹配买卖记录。触发词：股票收益、网格收益、交易统计、stock profit、同步交易、交易匹配"
category: finance
---

# 股票交易技能

基于 opencli 插件实现的股票交易数据管理工具，插件目录：`~/.opencli/plugins/stock`（仓库：github.com:fhn100/opencli-plugin-stock）

## 🚀 快速开始

```bash
# 1. 初始化（首次使用）
opencli stock init

# 2. 同步当月数据
opencli stock sync

# 3. 匹配交易记录
opencli stock match

# 4. 查看收益
opencli stock profit
```

## 功能命令

### 1. 初始化

```bash
opencli stock init
```

首次使用前执行，初始化数据库和配置。

### 2. 交易数据同步

```bash
opencli stock sync [startDate] [endDate]
```

- 日期格式：`YYYYMMDD`
- 不传参数默认同步当月
- **⚠️ 大范围同步可能耗时较长，建议先确认时间范围**

**同步前检查清单：**
- [ ] 确认时间范围是否正确
- [ ] 确认Cookie是否有效（如失败需更新config文件）
- [ ] 大范围同步建议分批进行（如按季度）

| 场景 | 命令 |
|------|------|
| 当月 | `opencli stock sync` |
| 今年至今 | `opencli stock sync 20260101 $(date +%Y%m%d)` |
| 去年全年 | `opencli stock sync 20250101 20251231` |
| 近3个月 | `opencli stock sync 20260101 20260430` |
| 自定义范围 | `opencli stock sync YYYYMMDD YYYYMMDD` |

### 3. 匹配交易记录

```bash
opencli stock match
```

将买入和卖出记录进行配对，用于计算已实现盈亏。匹配原则见下方。

### 4. 网格收益统计

```bash
opencli stock profit [start] [end]
```

统计网格交易收益。**必须使用此命令统计，不要直接 SQL 查询 t_trade_matched_record。** 月份格式 `YYYY-MM`，不传参数默认当月。

| 用法 | 说明 |
|------|------|
| `opencli stock profit` | 当月收益 |
| `opencli stock profit 2026-01` | 指定月份 |
| `opencli stock profit 2026-01 2026-04` | 多月范围 |

**展示方式：** 精简表格，账户后加时间列，按总收益降序排列，末尾附月收益和年收益汇总行（加粗）。严格按命令返回内容展示，不自行补充数据。

## 代码结构（2026-04 重构后）

```
stock/
├── db.js          # 数据库层：getDb, releaseDb, withDb, SQL 定义, TABLE 常量
├── business.js    # 业务层：initDb, initAccount, syncTrade, tradeMatch, gridProfit
├── utils.js       # 工具层：getDataDir, getConfigPath, getCookie, getUserId
├── init.js        # 命令入口：opencli stock init
├── sync.js        # 命令入口：opencli stock sync
├── match.js       # 命令入口：opencli stock match
├── profit.js      # 命令入口：opencli stock profit
└── data/
    ├── stock.db   # 主数据库（交易数据在此）
    ├── grid.db    # 空数据库，勿用
    └── config     # Cookie 配置
```

**核心封装 `withDb(fn, sql)`：** 自动管理 conn/stmt 生命周期，业务函数只需传入回调。DB 操作不再需要重复 try/catch/finally 模式。

**SQL 定义集中在 `SQL` 对象：** `SQL.CREATE_DICT`, `SQL.SYNC_TRADE`, `SQL.TRADE_MATCH`, `SQL.GRID_PROFIT` 等，通过 `db.js` 统一导出。

## 数据库

- 路径：`~/.opencli/plugins/stock/data/stock.db`（注意：实际交易数据在 `stock.db`，`grid.db` 存在但表可能为空）
- 表结构：
  - `t_trade_record` — 交易记录（买入/卖出）
  - `t_trade_matched_record` — 匹配记录（含 profit 字段）
  - `t_dict` — 字典表
- 已配置 DuckDB MCP Server，可通过 `mcp_duckdb_*` 工具直接查询

## op 字段映射

- `op='1'` → 买入
- `op='2'` → 卖出
- `op_name` 字段可能不可靠，**始终使用 `op` 数字字段区分买卖**

## 匹配逻辑

匹配采用 **数量完全相等** 原则（按 `account_id + code + entry_count` 配对，买入时间需早于卖出时间）。

`opencli stock match` 内部循环执行直到所有可匹配记录匹配完成，一次调用即可。

### 已知限制

- 要求买卖**数量完全相等**才能匹配（`t2.entry_count = t1.entry_count`）
- 实测约 291/370 条未匹配卖出存在同账户同股票的买入，但数量不同无法匹配
- 尝试过 LIFO 部分匹配（JS 实现），匹配数从 1046→1668（+59.5%），但收益计算结果差异大，已回滚
- 79 条未匹配卖出属于原始持仓（卖出前无买入），属于正常情况

### LIFO 匹配的经验教训

曾用 JavaScript 重写为 LIFO（后买入先卖出）匹配逻辑，支持部分匹配和金额按比例分摊。虽然匹配数量大幅增加，但导致药明生物和快手等股票的收益出现大幅变化（从盈利变大额亏损），原因：

- LIFO 优先匹配最近的买入，若最近买入价格较高则亏损更早体现
- 原始 SQL 逻辑虽有遗漏，但匹配结果更接近网格交易"低买高卖"的直观期望
- **结论：如需改用 LIFO，需用户逐个验证关键股票的匹配结果后再决定是否采用**

## 年收益行为说明

- **月收益**：按月汇总的收益
- **年收益**：年初到**查询截止月**的累计收益（非全年），按年份匹配返回
  - 例：查 3 月时，年收益 = 1-3 月累计；查 4 月时 = 1-4 月累计
  - 非最大月份查询也能返回年收益（按 `trans_year` 匹配）

## 收益统计 SQL 设计（SQL_GRID_PROFIT）

用 CTE + `row_type` 列区分三种行，避免 `-100`/`-101` 后缀 hack：

```sql
WITH stock_rows AS (... 'stock' AS row_type),
     month_rows AS (... 'month' AS row_type),
     year_rows AS (... WHERE sell_date <= ? ... 'year' AS row_type)
SELECT ... FROM (UNION ALL) t
WHERE t.sell_date >= ? AND t.sell_date <= ?
   OR t.row_type = 'year' AND substr(t.sell_date, 1, 4) = substr(?, 1, 4)
```

- 股票行/月收益行：按 `sell_date`（YYYY-MM）范围过滤
- 年收益行：按年份匹配，子查询内 `sell_date <= endMonth` 实现年初到截止月累计
- `CAST(sum(profit) AS DOUBLE)` 避免 DuckDB BigInt 序列化错误

## TRADE_MATCH SQL 注意事项

- 内层子查询**必须用显式列名**，不能用 `SELECT *`，否则 `CAST(entry_date_time AS TIMESTAMP)` 可能不生效
- `STRFTIME(t.sell_time, '%Y')` 要求 `sell_time` 必须是 TIMESTAMP 类型
- 买入/卖出子查询需保留 `account_id, account_name, code, name, entry_price, entry_count, entry_money, transfer_fee, history_id` 等列

## ~~DuckDB 直查~~（已弃用，请勿使用）

**不要用 SQL 直查 t_trade_matched_record 统计收益**，统一使用 `opencli stock profit` 命令。

## 手动收益统计（当 t_trade_matched_record 为空时）

用加权平均成本法手动计算：

```sql
-- 按账户统计买入卖出
SELECT account_name,
  SUM(CASE WHEN op='1' THEN entry_money ELSE 0 END) as 买入总额,
  SUM(CASE WHEN op='1' THEN entry_count::INTEGER ELSE 0 END) as 买入股数,
  SUM(CASE WHEN op='2' THEN entry_money ELSE 0 END) as 卖出总额,
  SUM(CASE WHEN op='2' THEN entry_count::INTEGER ELSE 0 END) as 卖出股数
FROM t_trade_record WHERE code = '02269' GROUP BY account_name;
```

- 买入均价 = 买入总额 / 买入股数
- 卖出均价 = 卖出总额 / 卖出股数
- 盈利 = 卖出总额 - (买入均价 × 卖出股数)

## 注意事项

- 使用 `INSERT OR REPLACE`，重复同步不会产生重复数据
- 账户超过 1000 条时会自动分页拉取
- 配置文件（cookie）：`~/.opencli/plugins/stock/data/config`
- GC001（204001）是国债逆回购，不是股票，查询时可排除
- DuckDB 的 `STRFTIME(?, '%Y')` 对参数类型敏感，需显式 `?::TIMESTAMP` 转换

## 故障排除

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 同步失败 | Cookie过期 | 更新 `~/.opencli/plugins/stock/data/config` 中的cookie |
| 无收益数据 | 未执行匹配 | 运行 `opencli stock match` |
| 收益异常 | 匹配逻辑限制 | 检查是否有未匹配的卖出记录 |
| 数据库错误 | 表结构变更 | 运行 `opencli stock init` 重新初始化 |

## 常见使用场景

### 场景1：查看某只股票的收益

```bash
# 先统计收益，然后在输出中查找特定股票
opencli stock profit 2026-04
# 输出中会显示每只股票的交易次数和收益
```

### 场景2：对比不同账户的收益

```bash
# 统计多月范围，输出会按账户分组显示
opencli stock profit 2026-01 2026-04
# 查看各账户的月收益和年收益汇总行
```

### 场景3：查看年度累计收益

```bash
# 查询某个月份，年收益行显示年初到该月的累计
opencli stock profit 2026-04
# 年收益 = 1-4月累计收益
```
