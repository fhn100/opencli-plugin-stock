import { cli, Strategy } from "@jackwener/opencli/registry";
import { syncTrade, tradeMatch, gridProfit } from "./business.js";

function getCurrentMonth() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/** 获取当月日期范围 YYYYMM01 ~ YYYYMM(lastDay) */
function getCurrentMonthRange() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  return {
    startDate: `${yyyy}${mm}01`,
    endDate: `${yyyy}${mm}${String(lastDay).padStart(2, "0")}`,
  };
}

cli({
  site: "stock",
  name: "profit",
  description: "同步、匹配并查询网格收益",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "start", type: "string", positional: true, help: "开始月份，格式 YYYY-MM（默认当月）" },
    { name: "end", type: "string", positional: true, help: "结束月份，格式 YYYY-MM（默认与开始月份相同）" },
  ],
  func: async (_page, kwargs) => {
    try {
      const start = kwargs.start || getCurrentMonth();
      const end = kwargs.end || start;

      // 同步当月交易记录（固定同步当月，不随查询范围变化）
      const { startDate, endDate } = getCurrentMonthRange();
      console.log(`同步范围：${startDate} ~ ${endDate}`);
      await syncTrade(startDate, endDate);

      // 匹配交易记录
      await tradeMatch();

      // 查询收益
      console.log(`查询范围：${start} ~ ${end}`);
      return await gridProfit(start, end);
    } catch (e) {
      console.error("查询网格收益失败:", e);
    }
  },
});
