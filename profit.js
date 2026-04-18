import { cli, Strategy } from "@jackwener/opencli/registry";
import { gridProfit } from "./business.js";

function getCurrentMonth() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

cli({
  site: "stock",
  name: "profit",
  description: "查询网格收益",
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
      console.log(`查询范围：${start} ~ ${end}`);
      return await gridProfit(start, end);
    } catch (e) {
      console.error("查询网格收益失败:", e);
    }
  },
});
