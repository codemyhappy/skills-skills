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
  /** 远端仓库地址（init 时记录，仅用于展示/提示，无需用户手动维护） */
  remoteUrl?: string;
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
 * 解析当前 skills 仓库根目录：固定的统一目录
 * ~/.config/skills-skills/skill-sync-repo（存在即视为仓库根，与 config 内容无关）。
 * 未初始化时返回 null（需要先运行 ss init）。
 */
export function getRepoRoot(): string | null {
  const dir = getSkillSyncRepoDir();
  return existsSync(dir) ? dir : null;
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

/** 统一 clone 目录（也是仓库根）：~/.config/skills-skills/skill-sync-repo */
export function getSkillSyncRepoDir(): string {
  return join(CONFIG_DIR, 'skill-sync-repo');
}

/** 三方合并基线 last-sync.json 的绝对路径 */
export function getLastSyncPath(): string {
  return join(CONFIG_DIR, 'last-sync.json');
}

/** 读取三方合并基线（上次 pull/push/merge 后的 skill-lock 镜像） */
export function readLastSync(): any | null {
  try {
    return JSON.parse(readFileSync(getLastSyncPath(), 'utf-8')) as any;
  } catch {
    return null;
  }
}

/** 写入三方合并基线 */
export function writeLastSync(lock: any): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(getLastSyncPath(), JSON.stringify(lock, null, 2) + '\n');
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

/** 检查路径是否存在 */
export function pathExists(p: string): boolean {
  return existsSync(p);
}
