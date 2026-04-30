# OpenCLI Stock Plugin

> 股票网格交易分析工具 - 基于 OpenCLI 的股票交易数据管理插件

[![OpenCLI](https://img.shields.io/badge/OpenCLI-1.0+-blue.svg)](https://github.com/jackwener/OpenCLI)
[![Node](https://img.shields.io/badge/Node.js-21+-green.svg)](https://nodejs.org/)

## 📋 目录

- [功能特性](#功能特性)
- [安装指南](#安装指南)
  - [1. 安装 OpenCLI](#1-安装-opencli)
  - [2. 安装浏览器扩展](#2-安装浏览器扩展)
  - [3. 安装 Stock 插件](#3-安装-stock-插件)
  - [4. 安装 Hermes 技能](#4-安装-hermes-技能)
- [配置说明](#配置说明)
- [命令使用](#命令使用)
- [数据结构](#数据结构)
- [常见问题](#常见问题)
- [更新日志](#更新日志)

---

## 功能特性

- 🔄 **自动同步** - 从同花顺投资账本自动同步交易记录
- 📊 **智能匹配** - 自动匹配买入/卖出记录，计算网格收益
- 💰 **收益统计** - 按股票、月份、年度统计收益
- 📈 **实时行情** - 获取持仓股票的实时行情数据
- 🔐 **安全认证** - 使用浏览器 Cookie 认证，无需暴露密码
- ⚡ **并行处理** - 多账户并行同步，提升效率

---

## 安装指南

### 1. 安装 OpenCLI

#### 方式一：npm 全局安装（推荐）

```bash
# 安装 OpenCLI
npm install -g @jackwener/opencli

# 验证安装
opencli --version

# 运行诊断检查
opencli doctor
```

#### 方式二：从源码安装

```bash
# 克隆仓库
git clone git@github.com:jackwener/OpenCLI.git
cd OpenCLI

# 安装依赖
npm install

# 运行（无需全局安装）
npx tsx src/main.ts --help
```

#### 系统要求

- Node.js >= 21
- npm 或 yarn
- Chrome/Chromium 浏览器（用于 Cookie 认证）

---

### 2. 安装浏览器扩展

Stock 插件需要 OpenCLI 浏览器扩展来获取认证 Cookie。

#### 安装步骤

1. **打开 Chrome 网上应用店**
   
   访问：[OpenCLI Chrome 扩展](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)

2. **添加扩展**
   
   点击「添加到 Chrome」按钮

3. **验证安装**
   
   ```bash
   opencli doctor
   ```
   
   确保输出显示扩展已连接

#### 扩展功能

- 🔑 自动获取网站 Cookie
- 🌐 管理浏览器会话
- 🔒 安全存储认证信息

---

### 3. 安装 Stock 插件

#### 方式一：从 GitHub 安装（推荐）

```bash
# 安装插件
opencli plugin install github:jackwener/opencli-stock

# 验证安装
opencli plugin list
```

#### 方式二：手动安装

```bash
# 克隆插件仓库
git clone https://github.com/jackwener/opencli-stock.git ~/.opencli/plugins/stock

# 安装依赖
cd ~/.opencli/plugins/stock
npm install

# 验证安装
opencli stock -h
```

#### 方式三：本地开发安装

```bash
# 如果你已经克隆了插件代码
cd /path/to/opencli-stock

# 创建符号链接
ln -s $(pwd) ~/.opencli/plugins/stock

# 安装依赖
npm install
```

---

### 4. 安装 Hermes 技能

Hermes 技能提供了更智能的交互方式，支持自然语言查询。

#### 安装步骤

1. **确保 Hermes Agent 已安装**
   
   ```bash
   # 检查 Hermes Agent
   hermes --version
   ```

2. **安装 Stock 技能**
   
   技能文件位于：`~/.hermes/skills/stock-skill/SKILL.md`
   
   如果不存在，可以从插件目录复制：
   
   ```bash
   mkdir -p ~/.hermes/skills/stock-skill
   cp ~/.opencli/plugins/stock/references/SKILL.md ~/.hermes/skills/stock-skill/
   ```

3. **验证技能**
   
   在 Hermes 中运行：
   ```
   skills_list
   ```
   
   应该能看到 `stock-skill`

---

## 配置说明

### 初始化配置

首次使用需要初始化配置：

```bash
# 初始化插件（会打开浏览器获取 Cookie）
opencli stock init
```

初始化过程：
1. 打开同花顺投资账本网页
2. 自动获取浏览器 Cookie
3. 保存到配置文件
4. 初始化数据库
5. 同步账户信息

### 配置文件位置

```
~/.opencli/plugins/stock/data/
├── config          # Cookie 配置文件
├── stock.db        # SQLite 数据库
└── config.json     # JSON 格式配置（可选）
```

### 手动配置 Cookie

如果自动获取失败，可以手动配置：

```bash
# 1. 登录同花顺投资账本
# 2. 打开浏览器开发者工具 (F12)
# 3. 切换到 Network 标签
# 4. 刷新页面，找到任意请求
# 5. 复制 Request Headers 中的 Cookie 值

# 6. 写入配置文件
echo "your_cookie_here" > ~/.opencli/plugins/stock/data/config
```

### Cookie 格式

```
userid=123456789; u_name=xxx; ticket=xxx; ...
```

必需字段：
- `userid` - 用户 ID
- `ticket` - 认证票据

---

## 命令使用

### 基本命令格式

```bash
opencli stock <command> [options]
```

### 命令列表

| 命令 | 说明 | 需要浏览器 |
|------|------|-----------|
| `init` | 初始化插件和配置 | ✅ 是 |
| `sync` | 同步交易记录 | ❌ 否 |
| `match` | 匹配交易记录 | ❌ 否 |
| `profit` | 查询网格收益 | ❌ 否 |
| `quotes` | 获取实时行情 | ❌ 否 |

---

### init - 初始化

```bash
opencli stock init
```

**功能：**
- 打开浏览器获取 Cookie
- 初始化数据库表结构
- 同步账户信息

**输出：**
```
配置文件路径：/home/user/.opencli/plugins/stock/data/config
数据库路径：/home/user/.opencli/plugins/stock/data/stock.db
字典表初始化成功
交易记录表初始化成功
交易匹配表初始化成功
同步账户成功, 共同步 4 条记录
账户初始化完成
```

---

### sync - 同步数据

```bash
# 同步当月数据（默认）
opencli stock sync

# 同步指定日期范围
opencli stock sync 20260101 20260430
```

**参数：**
- `start` - 开始日期，格式 YYYYMMDD（可选）
- `end` - 结束日期，格式 YYYYMMDD（可选）

**输出：**
```
同步范围：20260401 ~ 20260430
同步交易记录成功, 账户: 125531008, 页: 1, 记录数: 63
同步交易记录成功, 账户: 131731830, 页: 1, 记录数: 16
所有账户交易记录同步完成
```

---

### match - 匹配交易

```bash
# 同步并匹配当月数据
opencli stock match

# 同步并匹配指定日期范围
opencli stock match 20260101 20260430
```

**参数：**
- `start` - 开始日期，格式 YYYYMMDD（可选）
- `end` - 结束日期，格式 YYYYMMDD（可选）

**输出：**
```
同步范围：20260401 ~ 20260430
匹配交易记录完成，本次共新增 10 条匹配
```

---

### profit - 查询收益

```bash
# 查询当月收益（默认）
opencli stock profit

# 查询指定月份
opencli stock profit 2026-04

# 查询时间范围
opencli stock profit 2026-01 2026-04
```

**参数：**
- `start` - 开始月份，格式 YYYY-MM（可选，默认当月）
- `end` - 结束月份，格式 YYYY-MM（可选，默认与开始月份相同）

**输出示例：**
```
查询范围：2026-04 ~ 2026-04
- 账户: 国泰-冯*
  时间: 2026-04
  股票代码: '02269'
  股票名称: 药明生物
  交易次数: '4'
  单次收益: '1514.17'
  总收益: 6056.68
...
```

**输出格式：**
- 按账户分组
- 每只股票的交易次数、单次收益、总收益
- 月收益和年收益汇总

---

### quotes - 实时行情

```bash
# 获取所有账户持仓行情
opencli stock quotes

# 获取指定账户行情
opencli stock quotes 冯
```

**参数：**
- `account` - 账户名称过滤器（可选）

**输出示例：**
```
- 账户名称: 国泰-冯**
  代码: '02269'
  名称: 药明生物
  当日盈亏: '-15300.00'
  当日盈亏率: '-2.65%'
  持有数量: '17000'
  持有金额: '490009.63'
  最新价: '33.0400'
  持有盈亏: '22738.97'
  持有盈亏率: 4.87%
...
```

**输出内容：**
- 账户名称（脱敏显示）
- 股票代码和名称
- 当日盈亏及盈亏率
- 持有数量和金额
- 最新价格
- 持有盈亏及盈亏率
- 账户汇总信息

---

### 通用选项

| 选项 | 说明 |
|------|------|
| `-f, --format <fmt>` | 输出格式：table（默认）、json、yaml、plain、md、csv |
| `-v, --verbose` | 显示详细调试信息 |
| `-h, --help` | 显示帮助信息 |

**示例：**
```bash
# JSON 格式输出
opencli stock profit -f json

# YAML 格式输出
opencli stock quotes -f yaml

# 调试模式
opencli stock sync -v
```

---

## 数据结构

### 数据库表

#### t_dict - 字典表

存储账户信息和配置。

| 字段 | 类型 | 说明 |
|------|------|------|
| key | VARCHAR | 主键（如 fund_key） |
| type | VARCHAR | 类型（如 fund_key） |
| value | VARCHAR | 值（如账户名称） |

#### t_trade_record - 交易记录表

存储所有交易记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| account_id | VARCHAR | 账户 ID |
| account_name | VARCHAR | 账户名称 |
| code | VARCHAR | 股票代码 |
| name | VARCHAR | 股票名称 |
| op | VARCHAR | 操作类型（1=买入，2=卖出） |
| entry_price | DECIMAL | 成交价格 |
| entry_count | VARCHAR | 成交数量 |
| entry_money | DECIMAL | 成交金额 |
| entry_date | VARCHAR | 成交日期 |
| entry_time | VARCHAR | 成交时间 |
| history_id | VARCHAR | 历史记录 ID（主键） |

#### t_trade_matched_record - 交易匹配表

存储匹配后的买入/卖出记录对。

| 字段 | 类型 | 说明 |
|------|------|------|
| account_id | VARCHAR | 账户 ID |
| code | VARCHAR | 股票代码 |
| name | VARCHAR | 股票名称 |
| buy_entry_price | DECIMAL | 买入价格 |
| buy_entry_count | VARCHAR | 买入数量 |
| sell_entry_price | DECIMAL | 卖出价格 |
| sell_entry_count | VARCHAR | 卖出数量 |
| profit | DECIMAL | 收益金额 |
| buy_time | TIMESTAMP | 买入时间 |
| sell_time | TIMESTAMP | 卖出时间 |

---

## 常见问题

### Q1: 初始化时浏览器没有打开？

**解决方案：**
1. 确保已安装 OpenCLI 浏览器扩展
2. 运行 `opencli doctor` 检查扩展状态
3. 确保 Chrome 浏览器已启动

### Q2: 同步数据失败？

**可能原因：**
- Cookie 过期
- 网络连接问题
- 账户无交易记录

**解决方案：**
```bash
# 重新初始化获取新 Cookie
opencli stock init

# 检查网络连接
curl -I https://tzzb.10jqka.com.cn
```

### Q3: 收益数据不准确？

**可能原因：**
- 未执行匹配操作
- 部分交易未匹配

**解决方案：**
```bash
# 执行匹配
opencli stock match

# 重新查询收益
opencli stock profit
```

### Q4: 如何查看未匹配的交易？

```bash
# 使用 DuckDB MCP 查询
mcp_mcp_server_duckdb_query(query="
SELECT * FROM t_trade_record 
WHERE history_id NOT IN (
  SELECT buy_history_id FROM t_trade_matched_record
  UNION
  SELECT sell_history_id FROM t_trade_matched_record
)
")
```

### Q5: 如何清除数据重新开始？

```bash
# 删除数据库文件
rm ~/.opencli/plugins/stock/data/stock.db

# 重新初始化
opencli stock init
```

---

## 开发指南

### 项目结构

```
~/.opencli/plugins/stock/
├── package.json        # 项目配置
├── utils.js           # 工具函数
├── db.js              # 数据库连接管理
├── constants.js       # 常量定义
├── business.js        # 业务逻辑
├── sql-schema.js      # 表结构 SQL
├── sql-sync.js        # 同步 SQL
├── sql-match.js       # 匹配 SQL
├── sql-profit.js      # 收益查询 SQL
├── sync.js            # CLI: 同步命令
├── match.js           # CLI: 匹配命令
├── profit.js          # CLI: 收益命令
├── quotes.js          # CLI: 行情命令
├── init.js            # CLI: 初始化命令
├── OPTIMIZATION.md    # 优化说明文档
└── data/
    ├── config         # Cookie 配置
    └── stock.db       # SQLite 数据库
```

### 添加新命令

1. 创建命令文件：`~/.opencli/plugins/stock/new-command.js`
2. 导入 registry：`import { cli, Strategy } from "@jackwener/opencli/registry"`
3. 定义命令：使用 `cli()` 函数注册
4. 重启 OpenCLI 或运行 `opencli list` 刷新

### 运行测试

```bash
# 帮助命令测试
opencli stock new-command -h

# 功能测试
opencli stock new-command [args]
```

---

## 更新日志

### v1.2.0 (2026-04-30)

**优化：**
- ✅ 重构数据库连接管理（单例模式，连接复用）
- ✅ 实现多账户并行同步
- ✅ 优化错误处理和重试机制
- ✅ 添加 JSDoc 类型注释
- ✅ SQL 定义按功能模块拆分
- ✅ 新增配置管理器和日志工具

**新增：**
- 📄 新增 `constants.js` 常量定义文件
- 📄 新增 SQL 模块文件（schema、sync、match、profit）
- 📄 新增 `OPTIMIZATION.md` 优化说明文档

### v1.1.0 (2026-04-15)

**新增：**
- ✨ 实时行情查询功能 (`quotes` 命令)
- ✨ 账户名称脱敏显示

### v1.0.0 (2026-04-01)

**初始版本：**
- 🎉 交易记录同步功能
- 🎉 交易匹配功能
- 🎉 网格收益统计功能

---

## 许可证

MIT License

---

## 相关链接

- [OpenCLI 官方文档](https://github.com/jackwener/OpenCLI)
- [同花顺投资账本](https://tzzb.10jqka.com.cn)
- [Hermes Agent](https://github.com/NousResearch/hermes-agent)

---

## 支持与反馈

如有问题或建议，请通过以下方式联系：

- 📧 Email: your-email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/jackwener/opencli-stock/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/jackwener/opencli-stock/discussions)
