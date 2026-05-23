# OpenCLI Stock Plugin

> 股票网格交易分析工具 - 基于 OpenCLI 的股票交易数据管理插件

[![OpenCLI](https://img.shields.io/badge/OpenCLI-1.0+-blue.svg)](https://github.com/jackwener/OpenCLI)
[![Node](https://img.shields.io/badge/Node.js-21+-green.svg)](https://nodejs.org/)

## 目录

- [功能特性](#功能特性)
- [安装指南](#安装指南)
  - [安装 OpenCLI](#安装-opencli)
  - [安装浏览器扩展](#安装浏览器扩展)
  - [安装 Stock 插件](#安装-stock-插件)
- [配置说明](#配置说明)
- [命令使用](#命令使用)
- [数据结构](#数据结构)
- [常见问题](#常见问题)
- [项目结构](#项目结构)
- [更新日志](#更新日志)

---

## 功能特性

- **自动同步** - 从同花顺投资账本自动同步交易记录
- **智能匹配** - 自动匹配买入/卖出记录，计算网格收益
- **收益统计** - 按股票、月份、年度统计收益
- **实时行情** - 获取持仓股票的实时行情数据
- **安全认证** - 使用浏览器 Cookie 认证，无需暴露密码
- **并行处理** - 多账户并行同步，提升效率

---

## 安装指南

### 安装 OpenCLI

```bash
npm install -g @jackwener/opencli
opencli --version
opencli doctor
```

系统要求：Node.js >= 21、Chrome/Chromium 浏览器

### 安装浏览器扩展

访问 [OpenCLI Chrome 扩展](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，添加到 Chrome 后运行 `opencli doctor` 验证。

### 安装 Stock 插件

```bash
# 从 GitHub 安装
opencli plugin install github:jackwener/opencli-stock

# 或手动安装
git clone https://github.com/jackwener/opencli-stock.git ~/.opencli/plugins/stock
cd ~/.opencli/plugins/stock && npm install
```

---

## 配置说明

### 初始化

```bash
opencli stock init
```

初始化过程：打开同花顺投资账本网页 → 获取浏览器 Cookie → 保存配置 → 初始化数据库 → 同步账户信息

### 配置文件

```
~/.opencli/plugins/stock/data/
├── config          # Cookie 配置文件
└── stock.db        # DuckDB 数据库
```

### Cookie 必需字段

- `userid` - 用户 ID
- `v` - 认证票据（过期时间戳，超过24小时需重新获取）

---

## 命令使用

| 命令 | 说明 | 需要浏览器 |
|------|------|-----------|
| `init` | 初始化插件和配置 | 是 |
| `sync` | 同步交易记录 | 否 |
| `match` | 匹配交易记录 | 否 |
| `profit` | 查询网格收益 | 否 |
| `quotes` | 获取实时行情 | 否 |

### init - 初始化

```bash
opencli stock init
```

### sync - 同步数据

```bash
# 同步当月数据（默认）
opencli stock sync

# 同步指定日期范围
opencli stock sync 20260101 20260430

# 仅指定开始日期（结束日期自动取该月最后一天）
opencli stock sync 20260501
```

### match - 匹配交易

```bash
# 同步并匹配当月数据
opencli stock match

# 同步并匹配指定日期范围
opencli stock match 20260101 20260430
```

### profit - 查询收益

```bash
# 查询当月收益（默认）
opencli stock profit

# 查询指定月份
opencli stock profit 2026-04

# 查询时间范围
opencli stock profit 2026-01 2026-04
```

输出包含：每只股票的交易次数、单次收益、总收益，以及月收益和年收益汇总。

### quotes - 实时行情

```bash
# 获取所有账户持仓行情
opencli stock quotes

# 获取指定账户行情（按名称模糊匹配）
opencli stock quotes 冯
```

输出包含：账户名称（脱敏）、股票代码/名称、持有金额、当日盈亏及盈亏率、账户汇总。

### 通用选项

| 选项 | 说明 |
|------|------|
| `-f, --format <fmt>` | 输出格式：table、json、yaml、plain、md、csv |
| `-v, --verbose` | 显示详细调试信息 |
| `-h, --help` | 显示帮助信息 |

---

## 数据结构

### t_dict - 字典表

| 字段 | 类型 | 说明 |
|------|------|------|
| key | VARCHAR | 主键（fund_key） |
| type | VARCHAR | 类型 |
| value | VARCHAR | 值（账户名称） |

### t_trade_record - 交易记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| account_id | VARCHAR | 账户 ID |
| account_name | VARCHAR | 账户名称 |
| code | VARCHAR | 股票代码 |
| name | VARCHAR | 股票名称 |
| op | VARCHAR | 操作类型（1=买入，2=卖出） |
| entry_price | DECIMAL(10,4) | 成交价格 |
| entry_count | VARCHAR | 成交数量 |
| entry_money | DECIMAL(10,4) | 成交金额 |
| entry_date | VARCHAR | 成交日期 |
| entry_time | VARCHAR | 成交时间 |
| history_id | VARCHAR | 历史记录 ID（主键） |

### t_trade_matched_record - 交易匹配表

| 字段 | 类型 | 说明 |
|------|------|------|
| account_id | VARCHAR | 账户 ID |
| code | VARCHAR | 股票代码 |
| name | VARCHAR | 股票名称 |
| buy_entry_price | DECIMAL(10,4) | 买入价格 |
| sell_entry_price | DECIMAL(10,4) | 卖出价格 |
| profit | DECIMAL(12,4) | 收益金额 |
| buy_time | TIMESTAMP | 买入时间 |
| sell_time | TIMESTAMP | 卖出时间 |

---

## 常见问题

**初始化时浏览器没有打开？** 确保已安装 OpenCLI 浏览器扩展，运行 `opencli doctor` 检查。

**同步数据失败？** Cookie 可能过期（超过24小时），重新运行 `opencli stock init`。

**收益数据不准确？** 先执行 `opencli stock match` 匹配交易，再查询收益。

**如何清除数据重新开始？**
```bash
rm ~/.opencli/plugins/stock/data/stock.db
opencli stock init
```

---

## 项目结构

```
~/.opencli/plugins/stock/
├── package.json        # 项目配置
├── constants.js        # 全部常量（表名、API路径、HTTP头、操作类型、超时上限等）
├── utils.js            # Cookie/配置管理、日期工具、脱敏、错误类、重试
├── db.js               # DuckDB 单例连接管理、withDb 封装、SQL 对象、进程退出清理
├── business.js         # 核心业务逻辑：initDb、initAccount、syncTrade、tradeMatch、gridProfit
├── quotes-api.js       # 行情业务逻辑：API调用、持仓/行情获取、汇总计算
├── sql-schema.js       # CREATE TABLE SQL 定义
├── sql-sync.js         # 账户/交易同步 SQL（DuckDB http_request）
├── sql-match.js        # 交易匹配 SQL（买入/卖出配对）
├── sql-profit.js       # 网格收益查询 SQL
├── init.js             # CLI: 初始化命令
├── sync.js             # CLI: 同步命令
├── match.js            # CLI: 匹配命令
├── profit.js           # CLI: 收益命令
├── quotes.js           # CLI: 行情命令（调用 quotes-api.js）
├── AGENTS.md           # Agent 架构说明
└── data/
    ├── config          # Cookie 配置
    └── stock.db        # DuckDB 数据库
```

架构原则：
- CLI 入口文件（init/sync/match/profit/quotes.js）是薄封装，仅注册命令和调用业务逻辑
- 业务逻辑集中在 `business.js` 和 `quotes-api.js`
- SQL 模板使用 `constants.js` 中的常量（TABLE、OP、DICT_TYPE、API_BASE 等）
- 所有魔法值统一在 `constants.js` 定义，其他文件引用常量

---

## 更新日志

### v1.3.0 (2026-05-23)

**重构：**
- 全部魔法值提取到 `constants.js`（API路径、HTTP头、操作类型、并发数、超时上限等）
- `quotes.js` 拆分为 CLI 入口 + `quotes-api.js` 业务逻辑
- `db.js` 清理无用导出，信号处理加 try/catch 保护
- `business.js` 使用常量替代硬编码值，tradeMatch 加安全迭代上限，gridProfit 不再静默吞错

**修复：**
- getUserId() 正则支持 userid 在 Cookie 开头的场景
- resolveDateRange() 仅传 start 时自动计算月末结束日期
- quotes 汇总行盈亏率计算修正（原始终为0）
- passQuotes 除零保护（zuoshou=0 时返回 0.00%）
- init.js 空 Cookie 校验

**优化：**
- apiPost 添加 10s 超时（AbortSignal.timeout）
- SQL 模板使用常量（OP.BUY/OP.SELL、DICT_TYPE.FUND_KEY、HTTP_HEADERS、API_BASE+API_PATH）
- sql-profit.js WHERE 子句加显式括号消除歧义
- AGENTS.md 全面更新

### v1.2.0 (2026-04-30)

- 重构数据库连接管理（单例模式，连接复用）
- 实现多账户并行同步
- 优化错误处理和重试机制
- 新增 SQL 模块拆分（schema、sync、match、profit）

### v1.1.0 (2026-04-15)

- 新增实时行情查询功能（`quotes` 命令）
- 账户名称脱敏显示

### v1.0.0 (2026-04-01)

- 交易记录同步、匹配、网格收益统计