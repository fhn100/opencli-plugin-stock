import { cli, Strategy } from "@jackwener/opencli/registry";
import { syncTrade } from "./business.js";

function getDefaultDateRange() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  const dd = String(lastDay).padStart(2, "0");
  return { startDate: `${yyyy}${mm}01`, endDate: `${yyyy}${mm}${dd}` };
}

cli({
  site: "stock",
  name: "sync",
  description: "同步数据，不传日期则默认当月",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "start", type: "string", positional: true, help: "开始日期，格式 YYYYMMDD" },
    { name: "end", type: "string", positional: true, help: "结束日期，格式 YYYYMMDD" },
  ],
  func: async (_page, kwargs) => {
    try {
      const { startDate, endDate } = kwargs.start && kwargs.end
        ? { startDate: kwargs.start, endDate: kwargs.end }
        : getDefaultDateRange();
      console.log(`同步范围：${startDate} ~ ${endDate}`);
      await syncTrade(startDate, endDate);
    } catch (e) {
      console.error("同步数据失败:", e);
    }
  },
});
