import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { syncSkillLock } from './sync.js';
import { installCommand, scanSkills } from './install.js';
import {
  getPackageRoot,
  getSkillsDir,
  getSkillSyncRepoDir,
  isInsideGitRepo,
  writeConfig,
  log,
  pathExists,
} from '../utils.js';

/** git clone 到 skillDir 目录本身（该目录即仓库根），失败时抛错，交由调用方清理 */
function cloneRepo(url: string, dest: string): string {
  log.info(`clone 仓库: ${url}`);
  execSync(`git clone ${url} ${dest}`, { stdio: 'inherit' });
  if (!pathExists(dest)) {
    throw new Error(`clone 失败或目录不存在: ${dest}`);
  }
  log.success(`已 clone 到: ${dest}`);
  return dest;
}

/** 非交互环境下用 readline 询问 git 仓库地址 */
async function promptGitUrl(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const url = await rl.question('请输入你的 skills git 仓库地址: ');
  rl.close();
  return url.trim();
}

/** 检测系统依赖（git / npx）是否可用，缺失时给出安装指引并退出 */
function precheckDependencies(): void {
  // git
  try {
    execSync('git --version', { stdio: 'pipe' });
  } catch {
    log.error('未检测到 git，请先安装：');
    log.error('  macOS:   brew install git 或执行 xcode-select --install');
    log.error('  Windows: 到 https://git-scm.com/download/win 下载安装');
    log.error('  Linux:   sudo apt-get install -y git  （或 yum/dnf 等价命令）');
    log.error('安装完成后请重新运行 ss init。');
    process.exit(1);
  }

  // npx（ss install 通过 npx skills 临时调用，无需预装 skills 包）
  try {
    execSync('npx --version', { stdio: 'pipe' });
  } catch {
    log.error('未检测到 npx，请先安装 Node.js >= 18：');
    log.error('  到 https://nodejs.org/ 下载安装，或通过 nvm / fnm 等版本管理器安装。');
    log.error('安装完成后请重新运行 ss init。');
    process.exit(1);
  }

  log.success('系统依赖检查通过（git / npx 均可用）');
}

/** 校验远程仓库确实可访问（只读网络检查，无本地改动） */
function precheckRemote(url: string): void {
  log.info(`校验远程仓库可访问性: ${url}`);
  try {
    execSync(`git ls-remote "${url}"`, {
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch {
    log.error(`无法访问远程仓库: ${url}`);
    log.error('请检查地址是否正确、网络是否可达、是否有权限后重试。本次未做任何本地改动。');
    process.exit(1);
  }
  log.success('远程仓库可访问');
}

/** 读取仓库 origin 远端地址（可能没有） */
function getRemoteUrl(repoRoot: string): string | undefined {
  try {
    const out = execSync('git remote get-url origin', { cwd: repoRoot, stdio: 'pipe' })
      .toString()
      .trim();
    return out || undefined;
  } catch {
    return undefined;
  }
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

  const templatePath = resolve(getPackageRoot(), 'SKILLS-GUIDE.md');
  if (!pathExists(templatePath)) {
    log.warn(`未找到内置使用指南模板: ${templatePath}，跳过生成`);
    return;
  }

  writeFileSync(guidePath, readFileSync(templatePath, 'utf-8'));
  log.success(`已生成使用指南: ${guidePath}`);
}

/**
 * ss init：初始化 skills 仓库（git 风格）。
 * 仓库统一存放在 ~/.config/skills-skills/skill-sync-repo，与执行目录无关：
 * 提供 url（位置参数或交互询问）→ clone 到该统一目录；目录已存在且为 git 仓库则幂等复用。
 * 校验（只读）全部通过后才执行写入。
 */
export async function initCommand(options: { url?: string }) {
  log.title('🚀 初始化 skills 仓库');

  // ═══ 校验段：只读、零副作用 ═══
  // 1) 系统依赖（git / npx）检测
  precheckDependencies();

  let cloneUrl: string | null = null;

  cloneUrl = (options.url?.trim() || (await promptGitUrl()).trim()) || null;
  if (!cloneUrl) {
    log.error('未提供 git 仓库地址，取消初始化');
    process.exit(1);
  }

  // 统一 clone 到的仓库根（也是整个目录本身）
  let repoRoot = getSkillSyncRepoDir();

  if (pathExists(repoRoot)) {
    // 目标已存在：仅当它是 git 仓库才允许幂等复用
    if (!isInsideGitRepo(repoRoot)) {
      log.error(`目标目录已存在但不是 git 仓库: ${repoRoot}`);
      log.error('请先移除或改名该目录后重试。');
      process.exit(1);
    }
    log.warn(`目标目录已存在且为 git 仓库，直接复用: ${repoRoot}`);
    cloneUrl = null;
  } else {
    // 校验远程仓库可访问（只读网络检查）
    precheckRemote(cloneUrl);
  }

  log.success(`前置校验通过，目标仓库: ${repoRoot}`);

  // ═══ 执行段：此时才开始任何副作用 ═══
  let clonedRoot: string | null = null;
  try {
    // 1. clone（若需新建仓库，直接 clone 到统一目录即仓库根）
    if (cloneUrl) {
      repoRoot = cloneRepo(cloneUrl, repoRoot);
      clonedRoot = repoRoot;
    }

    // 2. 确保 skills/ 目录存在
    log.info('检查 skills 目录...');
    const skillsDir = getSkillsDir(repoRoot);
    if (!pathExists(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
      log.success(`已创建 skills/ 目录: ${skillsDir}`);
    } else {
      log.success(`skills/ 目录已存在: ${skillsDir}`);
    }

    // 3. 预置默认 skills-skills 技能
    log.info('预置默认技能...');
    ensureDefaultSkill(skillsDir);

    // 4. 生成使用指南
    log.info('生成使用指南...');
    ensureGuide(repoRoot);

    // 5. 记录仓库配置（config 只存 remoteUrl，仓库根为固定统一目录，无需记录）
    log.info('记录仓库配置...');
    const remoteUrl = cloneUrl ?? getRemoteUrl(repoRoot);
    writeConfig({
      remoteUrl,
    });
    log.success(`已记录远端仓库: ${remoteUrl ?? '(无)'}`);

    // 6. 同步 skill-lock.json（pull/push/merge/初始化）
    log.info('同步 skill-lock.json...');
    await syncSkillLock(repoRoot);

    console.log();

    // 7. 安装 skills 到当前设备
    log.info('安装手写 skills...');
    const skills = scanSkills(repoRoot);
    if (skills.length === 0) {
      log.warn('skills/ 目录下暂无技能，跳过安装');
    } else {
      await installCommand({ dryRun: false });
    }
  } catch (err: any) {
    // 执行段出错：若刚 clone 出目录则清理，避免残留半成品
    log.error(`初始化失败: ${err?.message ?? err}`);
    if (clonedRoot) {
      log.warn(`清理未完成的 clone 目录: ${clonedRoot}`);
      rmSync(clonedRoot, { recursive: true, force: true });
    }
    process.exit(1);
  }

  log.title('✅ 初始化完成！');
  log.dim(`你的 skills 仓库: ${repoRoot}`);
  log.info('运行 ss list / ss install 管理你的 skills，运行 ss status 查看同步状态');
}