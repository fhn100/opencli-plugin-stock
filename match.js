import { cli, Strategy } from '@jackwener/opencli/registry';
import { tradeMatch } from './utils.js';


cli({
  site: 'stock',
  name: 'match',
  description: '匹配交易记录',
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async (_page) => {
    try {
      await tradeMatch();
      console.log("匹配交易记录完成");
    } catch (e) {
      console.error("匹配交易记录失败：", e);
    }
  },
});
