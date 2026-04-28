import { cli, Strategy } from "@jackwener/opencli/registry";
import { initDb, initAccount } from "./business.js";
import { getConfigPath, writeConfig } from "./utils.js";
import { getDbPath } from "./db.js";

cli({
  site: "stock",
  name: "init",
  description: "初始化",
  strategy: Strategy.COOKIE,
  browser: true,
  func: async (page) => {
    try {
      console.log("配置文件路径：" + getConfigPath());
      console.log("数据库路径：" + getDbPath());
      await page.goto(
        "https://s.hexin.cn/",
      );
      await new Promise((r) => setTimeout(r, 1500));
      const cookies = await page.getCookies({ domain: ".10jqka.com.cn" });
      const config = cookies.map(item => `${item.name}=${item.value}`).join('; ');
      console.log(config);
      await writeConfig(config);
      await initDb();
      await initAccount();
      console.log("账户初始化完成");
    } catch (e) {
      console.error("初始化失败:", e);
    }
  },
});
