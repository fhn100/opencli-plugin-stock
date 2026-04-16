import { cli, Strategy } from "@jackwener/opencli/registry";
import { syncAccount, syncTrade } from "./utils.js";

cli({
  site: "grid",
  name: "sync",
  description: "同步数据",
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async (_page) => {
    try {
      await syncAccount();
      await syncTrade("20250101", "20260430");
    } catch (e) {
      console.error("同步数据失败：", e);
    }
  },
});
