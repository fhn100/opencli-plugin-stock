import { cli, Strategy } from "@jackwener/opencli/registry";
import { syncTrade } from "./utils.js";

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const startDate = `${year}${month}01`;
  const endDate = `${year}${month}${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

cli({
  site: "stock",
  name: "sync",
  description: "同步数据，不传日期则默认当月",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: "start",
      type: "string",
      positional: true,
      help: "开始日期，格式 YYYYMMDD",
    },
    {
      name: "end",
      type: "string",
      positional: true,
      help: "结束日期，格式 YYYYMMDD",
    },
  ],
  func: async (_page, kwargs) => {
    try {
      let startDate = kwargs.start;
      let endDate = kwargs.end;
      if (!startDate || !endDate) {
        ({ startDate, endDate } = getDefaultDateRange());
      }
      console.log(`同步范围：${startDate} ~ ${endDate}`);
      await syncTrade(startDate, endDate);
    } catch (e) {
      console.error("同步数据失败：", e);
    }
  },
});
