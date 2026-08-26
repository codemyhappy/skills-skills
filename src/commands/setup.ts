import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** 在仓库根生成 skills-skills 使用指南（已存在则跳过） */
function ensureGuide(repoRoot: string): void {
  const guidePath = resolve(repoRoot, 'SKILLS-GUIDE.md');
  if (pathExists(guidePath)) {
    log.success('使用指南已存在: SKILLS-GUIDE.md');
    return;
  }

  // 读取随 npm 包自带的使用指南模板，写入用户的 git 仓库
  const templatePath = resolve(getPackageRoot(), 'SKILLS-GUIDE.md');
  if (!pathExists(templatePath)) {
    log.warn(`未找到内置使用指南模板: ${templatePath}，跳过生成`);
    return;
  }

  writeFileSync(guidePath, readFileSync(templatePath, 'utf-8'));
  log.success(`已生成使用指南: ${guidePath}`);
}

export async function setupCommand(options: { git?: string }) {
  const cwd = process.cwd();
  log.title('🚀 一键初始化 skills-skills');
  log.dim(`当前目录: ${cwd}`);

  // 步骤 1/6: 定位或创建 skills 仓库
  log.info('步骤 1/6: 定位 skills 仓库...');
  let repoRoot: string;

  if (isInsideGitRepo(cwd)) {
    // 当前目录在 git 项目内 → 一律复用该仓库（即便提供 --git 也先检查复用，避免在当前 git 仓库内嵌套 clone）
    repoRoot = getGitRoot(cwd);
    if (!pathExists(getSkillsDir(repoRoot))) {
      log.error(`仓库 ${repoRoot} 中不存在 skills/ 目录，不符合复用标准，已中止。`);
      log.error('复用以存在的 git 仓库需同时满足：1) 当前目录位于 git 仓库内；2) 仓库根下存在 skills/ 目录。');
      log.error('说明：即便提供 --git 地址，当前已在 git 项目内也不会直接 clone（避免嵌套 git 仓库），请先创建 skills/ 目录，或在非 git 目录下执行。');
      process.exit(1);
    }
    log.success(`检测到当前在 git 项目中，复用仓库: ${repoRoot}`);
  } else if (options.git) {
    // 不在任何 git 项目内，且用户显式提供 git 地址 → clone
    repoRoot = cloneRepo(options.git, cwd);
  } else {
    // 不在 git 内 → 交互询问 git 地址并 clone
    const url = await promptGitUrl();
    if (!url) {
      log.error('未提供 git 仓库地址，取消初始化');
      process.exit(1);
    }
    repoRoot = cloneRepo(url, cwd);
  }

  // 步骤 2/6: 确保 skills/ 目录存在
  log.info('步骤 2/6: 检查 skills 目录...');
  const skillsDir = getSkillsDir(repoRoot);
  if (!pathExists(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
    log.success(`已创建 skills/ 目录: ${skillsDir}`);
  } else {
    log.success(`skills/ 目录已存在: ${skillsDir}`);
  }

  // 步骤 3/6: 预置默认 skills-skills 技能
  log.info('步骤 3/6: 预置默认技能...');
  ensureDefaultSkill(skillsDir);

  // 步骤 4/6: 生成使用指南
  log.info('步骤 4/6: 生成使用指南...');
  ensureGuide(repoRoot);

  console.log();

  // 步骤 5/6: 记录仓库根并同步 skill-lock.json 软链接
  log.info('步骤 5/6: 记录仓库并同步 skill-lock.json...');
  writeConfig({ repoRoot });
  log.success(`已记录 skills 仓库: ${repoRoot}`);
  await syncCommand({ restore: false });

  console.log();

  // 步骤 6/6: 安装 skills 到当前设备
  log.info('步骤 6/6: 安装手写 skills...');
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
