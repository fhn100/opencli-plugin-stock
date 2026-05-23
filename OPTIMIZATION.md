# OpenCLI Stock 插件优化说明

## 优化历史

### v1.3.0 重构 (2026-05-23) — 消除魔法值、修复 Bug、优化架构

#### 1. constants.js — 全部魔法值抽取

**问题：** API 路径、HTTP 头、操作类型、并发数等散落在各文件中硬编码，修改一处需全局搜索。

**优化内容：**
- 抽取 API_BASE + API_PATH（4 个路径）
- 抽取 HTTP_HEADERS（User-Agent、Content-Type、Origin、Referer）
- 抽取 API_DEFAULTS（terminal、version）
- 抽取 OP（BUY="1"、SELL="2"）、DICT_TYPE（FUND_KEY）
- 抽取 COOKIE_REQUIRED_FIELDS、COOKIE_EXPIRY_SECONDS
- 抽取 INIT_URL、INIT_WAIT_MS、COOKIE_DOMAIN
- 抽取 PAGE_SIZE、SYNC_CONCURRENCY、MATCH_MAX_ITERATIONS、FETCH_TIMEOUT_MS

**收益：** 所有配置值单一来源，改一处生效全局。

---

#### 2. utils.js — 修复 Bug + 使用常量

**问题：**
- `getUserId()` 正则 `/;\s*userid=(\d+)/` 无法匹配 userid 在 Cookie 开头的场景
- `resolveDateRange()` 仅传 start 时默认取当前月而非 start 所在月
- `checkCookieValid()` 硬编码 `["userid", "v"]` 和 `86400`

**优化内容：**
- 正则改为 `/(?:^|;)\s*userid=(\d+)/` 支持 Cookie 开头
- `resolveDateRange()` 仅传 start 时自动计算该月最后一天作为 endDate
- `checkCookieValid()` 使用 `COOKIE_REQUIRED_FIELDS` 和 `COOKIE_EXPIRY_SECONDS` 常量

---

#### 3. quotes.js / quotes-api.js — 拆分 CLI 与业务逻辑

**问题：** quotes.js 包含 ~289 行混合了 CLI 注册、API 调用、数据处理、汇总计算，职责不清。

**优化内容：**
- 提取全部业务逻辑到 `quotes-api.js`（apiPost、getAccounts、passQuotes、fetchPosition、buildStockItem、buildAccountSummary、processAccount、getQuotes）
- `quotes.js` 仅 ~26 行 CLI 入口，调用 `getQuotes()` 并处理错误提示
- apiPost 使用 `API_BASE` + `API_PATH` + `HTTP_HEADERS` + `API_DEFAULTS` 常量
- apiPost 添加 `AbortSignal.timeout(FETCH_TIMEOUT_MS)` 超时保护

**收益：** 职责清晰，业务逻辑可独立测试和复用。

---

#### 4. business.js — 常量化 + 安全上限

**问题：**
- `syncTradeByFundKey` 硬编码 `1000` 分页阈值
- `syncTrade` 硬编码并发数 `3`
- `syncTrade` 硬编码 `"fund_key"` 字符串
- `tradeMatch()` 无限循环无安全上限
- `gridProfit()` 静默吞错返回空数组

**优化内容：**
- 使用 `PAGE_SIZE` 替代 1000
- 使用 `SYNC_CONCURRENCY` 替代 3
- 使用 `DICT_TYPE.FUND_KEY` 替代 "fund_key"
- `tradeMatch()` 加 `MATCH_MAX_ITERATIONS` 安全上限，超限时输出警告
- `gridProfit()` 移除 try/catch，错误正常抛出让调用方处理
- 移除 `process.noDeprecation`（迁移到 db.js）

---

#### 5. db.js — 清理导出 + 信号处理

**问题：**
- 导出了 `releaseDb`、`getDb`、`closeDbManager` 但无外部调用者
- `process.noDeprecation` 放在 business.js（业务层不该有全局副作用）
- SIGINT/SIGTERM 处理未加 try/catch，closeDbManager 失败时可能阻塞退出

**优化内容：**
- 移除 `releaseDb`、`getDb`、`closeDbManager` 导出，仅导出 `getDbPath`、`withDb`、`SQL`
- `withDb` 内联 stmt.finalize()，不再依赖外部 releaseDb
- `process.noDeprecation` 统一放在 db.js（基础设施层）
- 信号处理加 try/catch 保护
- `closeDbManager` 改为内部函数不导出

---

#### 6. init.js — 使用常量 + 空 Cookie 校验

**问题：** 硬编码 URL、等待时间、Cookie domain；未校验空 Cookie 列表。

**优化内容：**
- 使用 `INIT_URL`、`INIT_WAIT_MS`、`COOKIE_DOMAIN` 常量
- 添加 `cookies.length === 0` 校验，输出错误提示并提前返回

---

#### 7. SQL 模板常量化

**问题：** sql-sync.js 硬编码完整 URL 和 HTTP 头；sql-match.js 硬编码 op=1/2；sql-profit.js WHERE 子句缺少显式括号。

**优化内容：**
- `sql-sync.js`：URL 从 `API_BASE + API_PATH` 拼接，headers/params 使用 `HTTP_HEADERS`/`API_DEFAULTS`/`DICT_TYPE` 常量
- `sql-match.js`：使用 `OP.BUY`/`OP.SELL` 替代硬编码 1/2
- `sql-profit.js`：WHERE 子句加显式括号 `(t.sell_date >= ? AND t.sell_date <= ?) OR (t.row_type = 'year' AND ...)` 消除歧义

---

#### 8. 修复的 Bug

| Bug | 修复 |
|-----|------|
| getUserId() 正则无法匹配 Cookie 开头的 userid | 改为 `/(?:^|;)\s*userid=(\d+)/` |
| resolveDateRange() 仅传 start 时取当前月而非 start 所在月 | 自动计算 start 所在月最后一天 |
| quotes 汇总行盈亏率始终为 0 | buildAccountSummary 使用持有金额而非持有数量计算 |
| passQuotes zuoshou=0 时除零崩溃 | 加 `zuoshou > 0` 保护，返回 "0.00%" |
| tradeMatch 无限循环无安全退出 | 加 MATCH_MAX_ITERATIONS 上限 |
| gridProfit 静默吞错返回空数组 | 移除 try/catch，正常抛出 |

---

#### 9. 文档更新

- `AGENTS.md` 全面更新：文件职责、架构说明、数据路径修正（grid.db → stock.db）
- `README.md` 全面更新：精简安装指南、更新配置说明、项目结构、新增 v1.3.0 changelog
- `OPTIMIZATION.md` 更新为本次重构内容

---

### v1.2.0 优化 (2026-04-30) — 连接管理、并行同步、SQL 拆分

- 数据库连接管理重构（DatabaseManager 单例）
- 多账户并行同步（Promise.all + 分批）
- 错误处理增强（AppError + retry）
- JSDoc 类型注释
- SQL 定义按功能模块拆分
- 新增 constants.js 打破循环依赖