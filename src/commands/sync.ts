import { copyFileSync, unlinkSync, symlinkSync, renameSync } from 'node:fs';
import {
  getAgentSkillLockPath,
  getRepoSKillLockPath,
  getRepoRoot,
  log,
  isSymlink,
  pathExists,
} from '../utils.js';

export async function syncCommand(options: { restore?: boolean }) {
  const repoRoot = getRepoRoot(process.cwd());
  if (!repoRoot) {
    log.error('未找到 skills 仓库，请先运行 ss setup');
    process.exit(1);
  }

  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  log.title('🔗 skill-lock.json 同步');

  if (options.restore) {
    return restore(agentPath, repoPath);
  }

  return link(agentPath, repoPath);
}

/** 建立软链接: ~/.agents/.skill-lock.json → <repo>/skill-lock.json */
async function link(agentPath: string, repoPath: string) {
  // 1. 检查仓库中是否有 skill-lock.json
  if (!pathExists(repoPath)) {
    log.error(`仓库中不存在 skill-lock.json: ${repoPath}`);
    log.info('请先将 ~/.agents/.skill-lock.json 拷贝到仓库根目录');
    process.exit(1);
  }

  // 2. 检查 agent 侧
  if (!pathExists(agentPath)) {
    // agent 侧文件不存在，直接创建软链接
    log.info(`创建软链接: ${agentPath} -> ${repoPath}`);
    symlinkSync(repoPath, agentPath);
    log.success('软链接创建成功');
    log.info('后续系统对 skill-lock.json 的修改将直接写入仓库');
    return;
  }

  // 3. agent 侧已存在
  if (isSymlink(agentPath)) {
    log.success('已存在软链接，无需重复操作');
    return;
  }

  // 4. agent 侧是普通文件 → 备份 → 删除 → 创建软链接
  const bakPath = agentPath + '.bak';
  log.warn(`备份现有文件: ${agentPath} -> ${bakPath}`);
  renameSync(agentPath, bakPath);

  log.info(`创建软链接: ${agentPath} -> ${repoPath}`);
  symlinkSync(repoPath, agentPath);

  log.success('软链接创建成功');
  log.dim(`备份文件保留在: ${bakPath}`);
  log.info('后续系统对 skill-lock.json 的修改将直接写入仓库');
}

/** 取消软链接，恢复为普通文件 */
async function restore(agentPath: string, repoPath: string) {
  if (!pathExists(agentPath)) {
    log.error(`软链接不存在: ${agentPath}`);
    process.exit(1);
  }

  if (!isSymlink(agentPath)) {
    log.warn('当前不是软链接，无需恢复');
    return;
  }

  if (!pathExists(repoPath)) {
    log.error(`仓库中 skill-lock.json 不存在，无法恢复`);
    process.exit(1);
  }

  // 删除软链接
  unlinkSync(agentPath);
  // 拷贝仓库文件到 agent 位置
  copyFileSync(repoPath, agentPath);
  log.success(`已恢复为普通文件: ${agentPath}`);
  log.info('仓库中的 skill-lock.json 保持不变');
}
