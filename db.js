import duckdb from 'duckdb';
import fs from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dirname, 'data');
await fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'grid.db');
const CONFIG_PATH = join(DATA_DIR, 'config');

let _instance = null;

export async function getDb() {
  await console.log('数据库文件路径：' + DB_PATH)
  if (!_instance) {
    _instance = await new duckdb.Database(DB_PATH);
  }
  return _instance.connect();
}

export async function getConfig() {
  await console.log('配置文件路径：' + CONFIG_PATH)
  const config = await fs.readFileSync(CONFIG_PATH, 'utf8');
  return config;
}
