# OpenCLI Stock Plugin

网格交易分析工具，用于同步、匹配和统计股票网格交易收益。

## 功能特性

- 🔄 **数据同步** - 从雪球同步交易记录到本地数据库
- 🔗 **交易匹配** - 自动匹配买入和卖出记录，计算已实现盈亏
- 📊 **收益统计** - 按账户、股票、月份统计网格交易收益
- 🛡️ **数据安全** - 本地 DuckDB 存储，不上传敏感数据

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Cookie

在 `data/config` 文件中配置雪球 Cookie：

```bash
# 创建数据目录
mkdir -p data

# 写入 Cookie（格式：userid=XXXXX;其他字段...）
echo "userid=1234567890;u_token=xxx" > data/config
```

**获取 Cookie 方法：**
1. 登录雪球网站
2. 打开浏览器开发者工具（F12）
3. 在 Network 标签页复制 Cookie 值
4. 确保包含 `userid` 字段

### 3. 初始化

```bash
opencli stock init
```

首次使用必须执行，用于：
- 创建数据库表结构
- 同步账户信息

## 使用指南

### 同步交易数据

```bash
# 同步当月数据（默认）
opencli stock sync

# 同步指定时间范围
opencli stock sync 20260101 20260430

# 同步今年至今
opencli stock sync 20260101 $(date +%Y%m%d)
```

**注意事项：**
- 大范围同步可能耗时较长，建议按季度分批
- 重复同步不会产生重复数据（使用 INSERT OR REPLACE）
- 账户超过 1000 条时会自动分页拉取

### 匹配交易记录

```bash
# 匹配买入和卖出记录
opencli stock match
```

匹配逻辑：
- 按账户、股票代码、数量完全相等匹配
- 买入时间必须早于卖出时间
- 内部循环执行直到所有可匹配记录匹配完成

### 查询收益

```bash
# 查询当月收益
opencli stock profit

# 查询指定月份
opencli stock profit 2026-04

# 查询多月范围
opencli stock profit 2026-01 2026-04
```

**收益说明：**
- **月收益**：按月汇总的收益
- **年收益**：年初到查询截止月的累计收益
- 输出格式：精简表格，按总收益降序排列
- 账户名已做脱敏处理（显示为"账户名-姓*"）

## 数据库结构

- **路径**：`data/stock.db`（DuckDB）
- **表结构**：
  - `t_trade_record` - 交易记录（买入/卖出）
  - `t_trade_matched_record` - 匹配记录（含 profit 字段）
  - `t_dict` - 字典表（账户信息）

## 字段说明

### op 字段映射
- `op='1'` → 买入
- `op='2'` → 卖出
- **注意**：`op_name` 字段可能不可靠，始终使用 `op` 数字字段

### 日期格式
- 同步命令：`YYYYMMDD`（如 `20260420`）
- 收益查询：`YYYY-MM`（如 `2026-04`）

## 代码结构

```
stock/
├── db.js          # 数据库层：连接、SQL 定义、表常量
├── business.js    # 业务层：初始化、同步、匹配、收益查询
├── utils.js       # 工具层：路径、配置、Cookie 处理
├── init.js        # 命令入口：opencli stock init
├── sync.js        # 命令入口：opencli stock sync
├── match.js       # 命令入口：opencli stock match
├── profit.js      # 命令入口：opencli stock profit
├── stock-skill/   # 技能文档
├── data/
│   ├── stock.db   # 主数据库
│   ├── grid.db    # 空数据库（勿用）
│   └── config     # Cookie 配置
└── README.md      # 本文档
```

## 故障排除

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 同步失败 | Cookie过期 | 更新 `data/config` 中的cookie |
| 无收益数据 | 未执行匹配 | 运行 `opencli stock match` |
| 收益异常 | 匹配逻辑限制 | 检查是否有未匹配的卖出记录 |
| 数据库错误 | 表结构变更 | 运行 `opencli stock init` 重新初始化 |

## 常见使用场景

### 查看某只股票的收益
```bash
opencli stock profit 2026-04
# 输出中会显示每只股票的交易次数和收益
```

### 对比不同账户的收益
```bash
opencli stock profit 2026-01 2026-04
# 输出按账户分组显示，包含月收益和年收益汇总
```

### 查看年度累计收益
```bash
opencli stock profit 2026-04
# 年收益 = 1-4月累计收益
```

## 开发说明

### 依赖
- **运行时**：Node.js ES Module
- **数据库**：DuckDB（需要本地编译）
- **CLI 框架**：@jackwener/opencli

### 核心封装
- `withDb(fn, sql)` - 自动管理数据库连接生命周期
- `SQL` 对象 - 集中管理所有 SQL 查询

### 扩展开发
1. 在 `business.js` 中添加新的业务函数
2. 在 `db.js` 的 `SQL` 对象中定义新的 SQL 查询
3. 创建对应的命令入口文件（如 `newcommand.js`）

## 已知限制

1. **匹配逻辑**：要求数量完全相等才能匹配
2. **数据源**：依赖雪球 API，Cookie 过期需手动更新
3. **性能**：大范围同步可能较慢

## 贡献指南

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/new-feature`
3. 提交更改：`git commit -m 'Add new feature'`
4. 推送分支：`git push origin feature/new-feature`
5. 提交 Pull Request

## 许可证

本项目为开源项目，遵循 MIT 许可证。

## 联系方式

- GitHub Issues: https://github.com/fhn100/opencli-plugin-stock/issues
- 作者: fhn100

---

**最后更新**：2026-04-20