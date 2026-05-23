import { cli, Strategy } from "@jackwener/opencli/registry";
import { initDb, initAccount } from "./business.js";
import { getConfigPath, writeConfig } from "./utils.js";
import { getDbPath } from "./db.js";
import { INIT_URL, INIT_WAIT_MS, COOKIE_DOMAIN } from "./constants.js";

cli({
  site: "stock",
  name: "init",
  access: 'write',
  description: "初始化",
  strategy: Strategy.COOKIE,
  browser: true,
  func: async (page) => {
    try {
      console.log("配置文件路径：" + getConfigPath());
      console.log("数据库路径：" + getDbPath());
      await page.goto(INIT_URL);
      await new Promise((r) => setTimeout(r, INIT_WAIT_MS));
      const cookies = await page.getCookies({ domain: COOKIE_DOMAIN });
      if (cookies.length === 0) {
        console.error("未获取到任何 Cookie，请确认页面已正常加载并登录");
        return;
      }
      const config = cookies.map(item => `${item.name}=${item.value}`).join('; ');
      console.log(config);
      await writeConfig(config);
      console.log("配置文件初始化完成");
      await initDb();
      console.log("数据库初始化完成");
      await initAccount();
      console.log("账户初始化完成");
    } catch (e) {
      console.error("初始化失败:", e);
    }
  },
});
