import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { realpathSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

// ── 包安装目录（固定，不会变化）─────────────────────────
/** 包安装根目录（bin/ 的上一级），用于定位内置 skills 模板 */
export function getPackageRoot(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  const binDir = dirname(realpathSync(scriptPath));
  return resolve(binDir, '..');
}

// ── 用户 skills 仓库状态 ───────────────────────────────
const CONFIG_DIR = join(homedir(), '.config', 'skills-skills');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export interface Config {
  /** 用户自定义的 skills 仓库根目录 */
  repoRoot?: string;
}

/** 读取本地配置 */
export function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config;
  } catch {
    return {};
  }
}

/** 写入本地配置 */
export function writeConfig(cfg: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

// ── git 工具 ──────────────────────────────────────────
/** 判断指定目录是否位于一个 git 项目内 */
export function isInsideGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** 返回目录所在 git 仓库的根路径 */
export function getGitRoot(dir: string): string {
  return execSync('git rev-parse --show-toplevel', { cwd: dir, stdio: 'pipe' })
    .toString()
    .trim();
}

/**
 * 解析当前 skills 仓库根目录：
 * 1) 优先使用本地 config 中记录的 repoRoot；
 * 2) 其次取当前工作目录所在 git 项目的根；
 * 3) 否则返回 null（需要先运行 ss setup）。
 */
export function getRepoRoot(cwd: string): string | null {
  const cfg = readConfig();
  if (cfg.repoRoot && existsSync(cfg.repoRoot)) return cfg.repoRoot;
  if (isInsideGitRepo(cwd)) return getGitRoot(cwd);
  return null;
}

// ── 派生路径 ──────────────────────────────────────────
/** ~/.agents/.skill-lock.json 的绝对路径 */
export function getAgentSkillLockPath(): string {
  return join(homedir(), '.agents', '.skill-lock.json');
}

/** 仓库中 skill-lock.json 的绝对路径 */
export function getRepoSKillLockPath(repoRoot: string): string {
  return resolve(repoRoot, 'skill-lock.json');
}

/** 仓库中 skills/ 目录的绝对路径 */
export function getSkillsDir(repoRoot: string): string {
  return resolve(repoRoot, 'skills');
}

// ── 日志工具 ──────────────────────────────────────────

export const log = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✔'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.log(chalk.red('✖'), msg),
  title: (msg: string) => console.log(chalk.bold.cyan('\n' + msg)),
  dim: (msg: string) => console.log(chalk.dim('  ' + msg)),
};

// ── 文件系统工具 ──────────────────────────────────────

/** 检查路径是否为软链接 */
export function isSymlink(p: string): boolean {
  try {
    const stat = realpathSync(p);
    return stat !== p;
  } catch {
    return false;
  }
}

/** 检查路径是否存在 */
export function pathExists(p: string): boolean {
  return existsSync(p);
}
