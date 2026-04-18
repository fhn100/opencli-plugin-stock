import fs from "fs";
import { join } from "path";

// ============================ 路径 & 配置 ============================

/** 获取数据目录（自动创建） */
export function getDataDir() {
  const dir = join(import.meta.dirname, "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 获取配置文件路径（自动创建空文件） */
export function getConfigPath() {
  const path = join(getDataDir(), "config");
  if (!fs.existsSync(path)) fs.writeFileSync(path, "", "utf8");
  return path;
}

/** 读取 Cookie（未配置时抛异常） */
export async function getCookie() {
  const path = getConfigPath();
  const cookie = fs.readFileSync(path, "utf8").trim();
  if (!cookie) throw new Error(`请先在配置文件中配置cookie, 路径: ${path}`);
  return cookie;
}

/** 从 Cookie 提取用户 ID */
export async function getUserId() {
  const cookie = await getCookie();
  const match = cookie.match(/userid=(\d+)/);
  if (!match?.[1]) throw new Error("配置文件中的cookie格式不正确，无法提取userid");
  return match[1].trim();
}
