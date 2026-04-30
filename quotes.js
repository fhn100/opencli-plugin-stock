process.noDeprecation = true;
import { cli, Strategy } from "@jackwener/opencli/registry";
import { getCookie, getUserId, getTodayDate, retry, AppError, maskAccountName } from "./utils.js";
import { API_BASE } from "./constants.js";

// ============================ API 调用 ============================

/**
 * API 请求封装（带重试和错误处理）
 * @param {string} path - API 路径
 * @param {object} params - 请求参数
 * @param {number} [maxRetries=2] - 最大重试次数
 * @returns {Promise<object>} API 响应数据
 * @throws {AppError} API 请求失败时抛出
 */
async function apiPost(path, params, maxRetries = 2) {
  return retry(async () => {
    const cookie = await getCookie();
    const body = new URLSearchParams({
      userid: await getUserId(),
      ...params,
    });

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          cookie,
        },
        body: body.toString(),
      });
    } catch (error) {
      throw new AppError(`网络请求失败: ${error.message}`, 'NETWORK_ERROR');
    }

    if (!res.ok) {
      throw new AppError(`HTTP ${res.status}: ${res.statusText}`, 'HTTP_ERROR', res.status);
    }

    let json;
    try {
      json = await res.json();
    } catch (error) {
      throw new AppError(`JSON 解析失败: ${error.message}`, 'PARSE_ERROR');
    }

    if (json.error_code !== "0") {
      throw new AppError(json.error_msg || "请求失败", 'API_ERROR');
    }

    return json.ex_data;
  }, maxRetries, 1000);
}

// ============================ 账户与行情 ============================

/**
 * 获取账户列表
 * @returns {Promise<Array<{fund_key: string, manualname: string}>>} 账户列表
 */
async function getAccounts() {
  const data = await apiPost("/caishen_fund/pc/account/v1/account_list", {
    user_id: await getUserId(),
    terminal: "1",
    version: "0.0.0",
  });
  return (data.common || []).map((item) => ({
    fund_key: item.fund_key,
    manualname: item.manualname,
  }));
}

/**
 * 获取股票行情
 * @param {string} code - 股票代码，格式 "市场:代码"
 * @returns {Promise<Map<string, {profit: number, profit_rate: string}>>} 行情数据
 */
async function passQuotes(code) {
  const userId = await getUserId();
  const date = getTodayDate();
  const data = await apiPost("/caishen_fund/invest/v1/pass_quotes", {
    userid: userId,
    user_id: userId,
    code: code,
    date: date,
    terminal: "1",
    version: "0.0.0",
  });
  return new Map(
    (data || []).map((item) => [
      item.zqdm,
      {
        profit: item.xianjia - item.zuoshou,
        profit_rate:
          (((item.xianjia - item.zuoshou) * 100) / item.zuoshou).toFixed(2) +
          "%",
      },
    ]),
  );
}

// ============================ 持仓行情（拆分后） ============================

/**
 * 按名称过滤账户列表
 * @param {Array} accounts - 账户列表
 * @param {string} filterStr - 过滤关键词
 * @returns {Array} 过滤后的账户列表
 */
function filterAccounts(accounts, filterStr) {
  const lower = filterStr.toLowerCase();
  return accounts.filter((a) => a.manualname?.toLowerCase().includes(lower));
}

/**
 * 获取单个账户的持仓数据
 * @param {string} userId - 用户 ID
 * @param {string} fundKey - 基金 KEY
 * @returns {Promise<Array>} 持仓列表
 */
async function fetchPosition(userId, fundKey) {
  const data = await apiPost("/caishen_fund/pc/asset/v1/stock_position", {
    fund_key: fundKey,
    userid: userId,
    user_id: userId,
  });
  return data.position || [];
}

/**
 * 构建单条股票持仓记录
 * @param {string} accountName - 脱敏后的账户名
 * @param {object} pos - 持仓项
 * @param {object} quote - 行情数据 { profit, profit_rate }
 * @returns {object} 格式化后的持仓记录
 */
function buildStockItem(accountName, pos, quote) {
  const profitValue = quote.profit || 0;
  return {
    账户名称: accountName,
    代码: pos.code || "-",
    名称: pos.name || "未知股票",
    当日盈亏: (profitValue * (pos.count || 0)).toFixed(2),
    当日盈亏率: quote.profit_rate || "0.00%",
    持有数量: pos.count || 0,
    持有金额: Number(pos.value || 0).toFixed(2),
    最新价: pos.price || "0.00",
    持有盈亏: Number(pos.hold_profit || 0).toFixed(2),
    持有盈亏率: ((pos.hold_rate || 0) * 100).toFixed(2) + "%",
  };
}

/**
 * 构建账户汇总行
 * @param {Array} stocks - 该账户所有股票记录
 * @returns {object} 汇总记录
 */
function buildAccountSummary(stocks) {
  const num = (key) => stocks.reduce((sum, s) => sum + (parseFloat(s[key]) || 0), 0);
  const totalDailyProfit = num("当日盈亏");
  const totalHoldingValue = num("持有金额");
  const totalHoldingProfit = num("持有盈亏");

  return {
    账户名称: "汇总",
    代码: "",
    名称: "",
    当日盈亏: totalDailyProfit.toFixed(2),
    当日盈亏率: formatRate(totalDailyProfit, totalHoldingValue),
    持有数量: "",
    持有金额: totalHoldingValue.toFixed(2),
    最新价: "",
    持有盈亏: totalHoldingProfit.toFixed(2),
    持有盈亏率: formatRate(totalHoldingProfit, totalHoldingValue),
  };
}

/** 格式化百分比 */
function formatRate(numerator, denominator) {
  if (denominator === 0) return "0.00%";
  return ((numerator / denominator) * 100).toFixed(2) + "%";
}

/**
 * 处理单个账户的持仓 + 行情 + 汇总
 * @param {string} userId - 用户 ID
 * @param {object} account - { fund_key, manualname }
 * @returns {Promise<Array>} 该账户的全部记录（含汇总行）
 */
async function processAccount(userId, account) {
  const accountName = maskAccountName(account.manualname);
  const positions = await fetchPosition(userId, account.fund_key);

  if (positions.length === 0) return [];

  // 批量获取行情
  const code = positions.map((p) => `${p.market}:${p.code}`).join(",");
  const quotes = code ? await passQuotes(code) : new Map();

  // 构建每条记录
  const stocks = positions.map((pos) =>
    buildStockItem(accountName, pos, quotes.get(pos.code) || { profit: 0, profit_rate: "0.00%" })
  );

  // 按当日盈亏率降序排序
  stocks.sort((a, b) =>
    (parseFloat(b["当日盈亏率"]) || 0) - (parseFloat(a["当日盈亏率"]) || 0)
  );

  // 追加汇总行
  stocks.push(buildAccountSummary(stocks));
  return stocks;
}

/**
 * 获取持仓行情数据（重构后：圈复杂度 ≤ 3）
 * @param {string} [accountNameFilter] - 账户名称过滤器
 * @returns {Promise<Array>} 行情数据数组
 */
async function getQuotes(accountNameFilter) {
  let accounts = await getAccounts();

  if (accountNameFilter) {
    accounts = filterAccounts(accounts, accountNameFilter);
    if (accounts.length === 0) {
      console.warn(`⚠️ 未找到包含「${accountNameFilter}」的账户`);
      return [];
    }
  }

  const userId = await getUserId();
  const results = [];

  for (const account of accounts) {
    try {
      const stocks = await processAccount(userId, account);
      results.push(...stocks);
    } catch (error) {
      const name = maskAccountName(account.manualname);
      console.error(`获取账户 ${name} 行情失败:`, error.message);
    }
  }

  return results;
}

// ============================ CLI 命令 ============================
cli({
  site: "stock",
  name: "quotes",
  description: "获取持仓实时行情（合并持仓详情 + 实时行情）",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "account", type: "string", positional: true, help: "账户名称" },
  ],
  func: async (_page, kwargs) => {
    try {
      return await getQuotes(kwargs.account);
    } catch (e) {
      console.error("获取行情失败: ", e.message);
      if (e.code === 'NETWORK_ERROR') {
        console.error("提示: 请检查网络连接");
      } else if (e.code === 'API_ERROR') {
        console.error("提示: Cookie 可能已过期，请重新配置");
      }
    }
  },
});
