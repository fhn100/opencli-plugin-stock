import { cli, Strategy } from "@jackwener/opencli/registry";
import { syncTrade } from "./business.js";
import { resolveDateRange } from "./utils.js";

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
      const { startDate, endDate } = resolveDateRange(kwargs);
      console.log(`同步范围：${startDate} ~ ${endDate}`);
      await syncTrade(startDate, endDate);
    } catch (e) {
      console.error("同步数据失败:", e);
    }
  },
});
