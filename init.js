import { cli, Strategy } from "@jackwener/opencli/registry";
import { initDb, initAccount } from "./business.js";
import { getConfigPath } from "./utils.js";
import { getDbPath } from "./db.js";

cli({
  site: "stock",
  name: "init",
  description: "初始化",
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async () => {
    try {
      console.log("配置文件路径：" + getConfigPath());
      console.log("数据库路径：" + getDbPath());
      await initDb();
      await initAccount();
      console.log("账户初始化完成");
    } catch (e) {
      console.error("初始化失败:", e);
    }
  },
});
