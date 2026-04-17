import { cli, Strategy } from '@jackwener/opencli/registry';
import { gridProfit } from './utils.js';


cli({
  site: 'stock',
  name: 'profit',
  description: '查询网格收益',
  strategy: Strategy.PUBLIC,
  browser: false,
  func: async (_page) => {
    try {
      const result = await gridProfit('2026-04', '2026-04');
      return result;
    } catch (e) {
      console.error("查询网格收益失败：", e);
    }
  },
});
