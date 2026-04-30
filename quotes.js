process.noDeprecation = true;
import { cli, Strategy } from "@jackwener/opencli/registry";
import { getCookie, getUserId } from "./utils.js";

// ============================ API 调用 ============================
const API_BASE = "https://tzzb.10jqka.com.cn/caishen_httpserver/tzzb";

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

// ============================ 持仓行情 ============================
async function getQuotes(accountNameFilter) {
  let accounts = await getAccounts();
  if (accountNameFilter) {
    const filterStr = accountNameFilter.toLowerCase();
    accounts = accounts.filter((a) =>
      a.manualname?.toLowerCase().includes(filterStr),
    );
    if (accounts.length === 0) {
      console.warn(`⚠️ 未找到包含「${accountNameFilter}」的账户`);
      return [];
    }
  }

  const userId = await getUserId();
  const results = [];

  for (const account of accounts) {
    const fundKey = account.fund_key;
    let accountName = account.manualname || "未知账户";

    // 🔑 新增：姓名脱敏逻辑（保留姓，名替换为*）
    if (accountName.includes("-")) {
      const idx = accountName.indexOf("-");
      const prefix = accountName.substring(0, idx + 1); // 包含 "-"
      const namePart = accountName.substring(idx + 1);
      if (namePart.length > 1) {
        // 保留第一个字，后面全部替换为 *
        accountName =
          prefix + namePart.charAt(0) + "*".repeat(namePart.length - 1);
      }
    }

    const positionData = await apiPost(
      "/caishen_fund/pc/asset/v1/stock_position",
      {
        fund_key: fundKey,
        userid: userId,
        user_id: userId,
      },
    );

    const code = positionData.position
      .map((item) => `${item.market}:${item.code}`)
      .join(",");
    const quotes = await passQuotes(code);

    const groupedData = {};

    positionData.position.forEach((item) => {
      const quote = quotes.get(item.code) || {
        profit: 0,
        profit_rate: "0.00%",
      };
      const profitValue = quote.profit || 0;
      const profitRate = quote.profit_rate || "0.00%";

      const stockItem = {
        账户名称: accountName,
        代码: item.code || "-",
        名称: item.name || "未知股票",
        当日盈亏: (profitValue * (item.count || 0)).toFixed(2),
        当日盈亏率: profitRate,
        持有数量: item.count || 0,
        持有金额: Number(item.value || 0).toFixed(2),
        最新价: item.price || "0.00",
        持有盈亏: Number(item.hold_profit || 0).toFixed(2),
        持有盈亏率: ((item.hold_rate || 0) * 100).toFixed(2) + "%",
      };

      if (!groupedData[accountName]) groupedData[accountName] = [];
      groupedData[accountName].push(stockItem);
    });

    Object.values(groupedData).forEach((stocks) => {
      // 按当日盈亏率降序排序
      stocks.sort((a, b) => {
        const rateA = parseFloat(a["当日盈亏率"]) || 0;
        const rateB = parseFloat(b["当日盈亏率"]) || 0;
        return rateB - rateA;
      });

      // 计算汇总值
      const totalDailyProfit = stocks.reduce(
        (sum, s) => sum + (parseFloat(s["当日盈亏"]) || 0),
        0,
      );
      const totalHoldingValue = stocks.reduce(
        (sum, s) => sum + (parseFloat(s["持有金额"]) || 0),
        0,
      );
      const totalHoldingProfit = stocks.reduce(
        (sum, s) => sum + (parseFloat(s["持有盈亏"]) || 0),
        0,
      );

      const dailyProfitRate =
        totalHoldingValue !== 0
          ? ((totalDailyProfit / totalHoldingValue) * 100).toFixed(2) + "%"
          : "0.00%";
      const holdingProfitRate =
        totalHoldingValue !== 0
          ? ((totalHoldingProfit / totalHoldingValue) * 100).toFixed(2) + "%"
          : "0.00%";

      // 汇总行：未要求的列留空
      const summaryRow = {
        账户名称: `汇总`,
        代码: "",
        名称: "",
        当日盈亏: totalDailyProfit.toFixed(2),
        当日盈亏率: dailyProfitRate,
        持有数量: "",
        持有金额: totalHoldingValue.toFixed(2),
        最新价: "",
        持有盈亏: totalHoldingProfit.toFixed(2),
        持有盈亏率: holdingProfitRate,
      };

      stocks.push(summaryRow);
    });

    Object.values(groupedData).forEach((stocks) => results.push(...stocks));
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
      console.error("获取行情失败: ", e);
    }
  },
});
