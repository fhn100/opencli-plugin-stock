import { cli, Strategy } from '@jackwener/opencli/registry';
import { getConfigPath, getDbPath, initDb, initAccount } from './utils.js';


cli({
  site: 'stock',
  name: 'init',
  description: '初始化',
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async (_page) => {
    try {
      const configPath = await getConfigPath();
      console.log("配置文件路径：" + configPath);
      const dbPath = await getDbPath();
      console.log("数据库路径：" + dbPath);
      await initDb();
      console.log("数据库初始化完成");
      await initAccount();
      console.log("账户初始化完成");
    } catch (e) {
      console.error("初始化失败：", e);
    }
  },
});
