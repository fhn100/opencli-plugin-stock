import { cli, Strategy } from "@jackwener/opencli/registry";
import { tradeMatch } from "./business.js";

cli({
  site: "stock",
  name: "match",
  description: "匹配交易记录",
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async () => {
    try {
      await tradeMatch();
      console.log("匹配交易记录完成");
    } catch (e) {
      console.error("匹配交易记录失败:", e);
    }
  },
});
