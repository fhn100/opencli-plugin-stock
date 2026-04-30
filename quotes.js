process.noDeprecation = true;

import { cli, Strategy } from "@jackwener/opencli/registry";
import { getCookie, getUserId } from "./utils.js";

// ============================ API 调用 ============================

const API_BASE = "https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb";

/**
 * 通用 POST 请求封装
 */
async function apiPost(path, params) {
  const cookie = await getCookie();
  const body = new URLSearchParams({
    userid: await getUserId(),
                                   ...params,
  });

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      cookie,
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error_code !== "0") throw new Error(json.error_msg || "请求失败");
  return json.ex_data;
}

// ============================ 账户列表 ============================

/**
 * 获取所有账户
 * @returns {Promise<Array<{fund_key: string, manualname: string}>>}
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

async function getDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function passQuotes(code) {
  const userId = await getUserId();
  const date = await getDate();
  const data = await apiPost("/caishen_fund/invest/v1/pass_quotes", {
    userid: userId,
    user_id: userId,
    code: code,
    date: date,
    terminal: "1",
    version: "0.0.0",
  });
  return new Map(
    (data || []).map(item => [
      item.zqdm, // key = 证券代码 code
      {
        profit: item.xianjia - item.zuoshou,
        profit_rate: (((item.xianjia - item.zuoshou) * 100) / item.zuoshou).toFixed(2) + "%"
      }
    ])
  );
}

// ============================ 持仓行情 ============================

/**
 * 获取持仓行情（合并持仓详情 + 实时行情）
 * @param {string} [accountNameFilter] 账户名称过滤（模糊匹配），不传则获取所有账户
 * @returns {Promise<Array>}
 */
async function getQuotes(accountNameFilter) {
  // 1. 获取账户列表并根据过滤条件筛选
  let accounts = await getAccounts();

  // 若传入账户名称，执行模糊匹配过滤（不区分大小写）
  if (accountNameFilter) {
    const filterStr = accountNameFilter.toLowerCase();
    accounts = accounts.filter(account =>
    account.manualname?.toLowerCase().includes(filterStr)
    );

    // 过滤后无匹配账户的提示
    if (accounts.length === 0) {
      console.warn(`⚠️ 未找到包含「${accountNameFilter}」的账户`);
      return [];
    }
  }

  const userId = await getUserId();
  const results = [];

  for (const account of accounts) {
    const fundKey = account.fund_key;
    const accountName = account.manualname;

    // 1. 调用持仓详情接口
    const positionData = await apiPost(
      "/caishen_fund/pc/asset/v1/stock_position",
      {
        fund_key: fundKey,
        userid: userId,
        user_id: userId
      }
    );
    const code = positionData.position.map(item => `${item.market}:${item.code}`).join(',');
    const quotes = await passQuotes(code);

    // 1. 创建分组容器：按 账户名称 分组
    const groupedData = {};

    positionData.position.forEach(item => {
      // 核心：空值保护！解决 s.charAt 报错（必须加）
      const quote = quotes.get(item.code) || { profit: 0, profit_rate: "0.00%" };
      const profitValue = quote.profit || 0;
      const profitRate = quote.profit_rate || "0.00%";

      // 组装单条股票数据（全字段兜底，无undefined）
      const stockItem = {
        "账户名称": accountName || "未知账户",
        "代码": item.code || "-",
        "名称": item.name || "未知股票",
        "当日盈亏": (profitValue * (item.count || 0)).toFixed(2),
        "当日盈亏率": profitRate,
        "持有数量": item.count || 0,
        "持有金额": Number(item.value || 0).toFixed(2),
        "最新价": item.price || "0.00",
        "持有盈亏": Number(item.hold_profit || 0).toFixed(2),
        "持有盈亏率": ((item.hold_rate || 0) * 100).toFixed(2) + "%",
      };

      // 2. 按账户名称分组
      if (!groupedData[accountName]) {
        groupedData[accountName] = [];
      }
      groupedData[accountName].push(stockItem);
    });

    // 3. 每组内 按【当日盈亏率】降序排序
    Object.values(groupedData).forEach(stocks => {
      stocks.sort((a, b) => {
        // 把字符串 5.20% 转成数字 5.20 用于排序
        const rateA = parseFloat(a["当日盈亏率"]) || 0;
        const rateB = parseFloat(b["当日盈亏率"]) || 0;
        // 降序：大的在前
        return rateB - rateA;
      });
    });

    // 4. 把分组后的数据扁平化，推入结果数组
    Object.values(groupedData).forEach(stocks => {
      results.push(...stocks);
    });

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
      // 核心修复：使用可选链操作符，args 为 null 时返回 undefined
      const account = kwargs.account;
      return await getQuotes(account);
    } catch (e) {
      console.error("获取行情失败:", e);
    }
  },
});
