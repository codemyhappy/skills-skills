import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { syncCommand } from './sync.js';
import { installCommand, scanSkills } from './install.js';
import {
  getPackageRoot,
  getSkillsDir,
  getGitRoot,
  isInsideGitRepo,
  writeConfig,
  log,
  pathExists,
} from '../utils.js';

/** 从仓库 URL 中提取本地目录名（克隆出的子目录名） */
function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  return cleaned.split('/').pop() || 'skills';
}

/** git clone 到当前目录下，返回克隆出的 git 仓库根路径 */
function cloneRepo(url: string, cwd: string): string {
  log.info(`clone 仓库: ${url}`);
  execSync(`git clone ${url}`, { cwd, stdio: 'inherit' });
  const dest = resolve(cwd, repoNameFromUrl(url));
  if (!pathExists(dest)) {
    log.error(`clone 失败或目录不存在: ${dest}`);
    process.exit(1);
  }
  log.success(`已 clone 到: ${dest}`);
  return getGitRoot(dest);
}

/** 非交互环境下用 readline 询问 git 仓库地址 */
async function promptGitUrl(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const url = await rl.question('请输入你的 skills git 仓库地址: ');
  rl.close();
  return url.trim();
}

/** 确保仓库 skills/ 目录下预置默认的 skills-skills 技能 */
function ensureDefaultSkill(skillsDir: string): void {
  const src = resolve(getPackageRoot(), 'skills', 'skills-skills');
  const dst = resolve(skillsDir, 'skills-skills');

  if (pathExists(dst)) {
    log.success('skills-skills 已存在，跳过预置');
    return;
  }
  if (!pathExists(src)) {
    log.warn('未找到内置 skills-skills 模板，跳过预置');
    return;
  }
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  log.success('已预置默认技能: skills-skills');
}

export async function setupCommand(options: { git?: string }) {
  const cwd = process.cwd();
  log.title('🚀 一键初始化 skills-skills');
  log.dim(`当前目录: ${cwd}`);

  // 步骤 1/5: 定位或创建 skills 仓库
  log.info('步骤 1/5: 定位 skills 仓库...');
  let repoRoot: string;

  if (options.git) {
    // 用户显式提供 git 地址 → clone
    repoRoot = cloneRepo(options.git, cwd);
  } else if (isInsideGitRepo(cwd)) {
    // 当前目录在 git 项目内 → 复用该仓库
    repoRoot = getGitRoot(cwd);
    log.success(`检测到当前在 git 项目中，复用仓库: ${repoRoot}`);
  } else {
    // 不在 git 内 → 交互询问 git 地址并 clone
    const url = await promptGitUrl();
    if (!url) {
      log.error('未提供 git 仓库地址，取消初始化');
      process.exit(1);
    }
    repoRoot = cloneRepo(url, cwd);
  }

  // 步骤 2/5: 确保 skills/ 目录存在
  log.info('步骤 2/5: 检查 skills 目录...');
  const skillsDir = getSkillsDir(repoRoot);
  if (!pathExists(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
    log.success(`已创建 skills/ 目录: ${skillsDir}`);
  } else {
    log.success(`skills/ 目录已存在: ${skillsDir}`);
  }

  // 步骤 3/5: 预置默认 skills-skills 技能
  log.info('步骤 3/5: 预置默认技能...');
  ensureDefaultSkill(skillsDir);

  console.log();

  // 步骤 4/5: 记录仓库根并同步 skill-lock.json 软链接
  log.info('步骤 4/5: 记录仓库并同步 skill-lock.json...');
  writeConfig({ repoRoot });
  log.success(`已记录 skills 仓库: ${repoRoot}`);
  await syncCommand({ restore: false });

  console.log();

  // 步骤 5/5: 安装 skills 到当前设备
  log.info('步骤 5/5: 安装手写 skills...');
  const skills = scanSkills(repoRoot);
  if (skills.length === 0) {
    log.warn('skills/ 目录下暂无技能，跳过安装');
  } else {
    await installCommand({ dryRun: false });
  }

  log.title('✅ 初始化完成！');
  log.dim(`你的 skills 仓库: ${repoRoot}`);
  log.info('运行 ss list / ss install 管理你的 skills');
}
