import { cli, Strategy } from "@jackwener/opencli/registry";
import { getQuotes } from "./quotes-api.js";
import { AppError } from "./utils.js";

cli({
  site: "stock",
  name: "quotes",
  access: 'write',
  description: "获取持仓实时行情（合并持仓详情 + 实时行情）",
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: "account", type: "string", positional: true, help: "账户名称" },
  ],
  func: async (kwargs) => {
    try {
      return await getQuotes(kwargs.account);
    } catch (e) {
      console.error("获取行情失败: ", e.message);
      if (e.code === "NETWORK_ERROR") {
        console.error("提示: 请检查网络连接");
      } else if (e.code === "API_ERROR" || e.code === "COOKIE_EXPIRED") {
        console.error("提示: Cookie 可能已过期，请重新配置");
      }
    }
  },
});