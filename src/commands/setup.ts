import { cpSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { syncCommand } from './sync.js';
import { installCommand, scanSkills } from './install.js';
import {
  getAgentSkillLockPath,
  getRepoSKillLockPath,
  getPackageRoot,
  getSkillsDir,
  getGitRoot,
  isInsideGitRepo,
  isSymlink,
  writeConfig,
  log,
  pathExists,
} from '../utils.js';

/** 从仓库 URL 中提取本地目录名（克隆出的子目录名） */
function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  return cleaned.split('/').pop() || 'skills';
}

/** git clone 到当前目录下，返回克隆出的 git 仓库根路径（失败时抛错，交由调用方决定清理） */
function cloneRepo(url: string, cwd: string): string {
  log.info(`clone 仓库: ${url}`);
  execSync(`git clone ${url}`, { cwd, stdio: 'inherit' });
  const dest = resolve(cwd, repoNameFromUrl(url));
  if (!pathExists(dest)) {
    throw new Error(`clone 失败或目录不存在: ${dest}`);
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

/**
 * 校验 clone 目标目录未被占用（本地只读检查，放在任何远端请求之前）。
 */
function precheckCloneDest(dest: string): void {
  if (pathExists(dest)) {
    log.error(`目标目录已存在: ${dest}`);
    log.error('为避免 clone 冲突，请先删除或移走该目录后再运行 ss setup。');
    process.exit(1);
  }
}

/**
 * 校验远程仓库确实可访问（只读网络检查，无本地改动），
 * 避免 clone 到中途才失败残留半成品。
 */
function precheckRemote(url: string): void {
  log.info(`校验远程仓库可访问性: ${url}`);
  try {
    execSync(`git ls-remote "${url}"`, {
      // pipe 输出避免刷屏；关闭终端交互避免私有仓库在预检时挂起
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

/**
 * 前置校验 skill-lock.json 软链接是否可建立（只读）。
 * 若 ~/.agents/.skill-lock.json 已是指向他处的软链接、而目标仓库暂缺该文件，
 * 则 sync 阶段必然失败——这里在 clone 之前就拦截，避免留下 clone 出的残留目录。
 */
function precheckAgentSkillLock(repoRoot: string): void {
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  // agent 侧不是软链接（普通文件或不存在）时，link() 都能自动处理，不会失败
  if (!pathExists(agentPath) || !isSymlink(agentPath)) return;
  // 目标仓库已有 skill-lock.json 时，link() 会直接跳过，不会失败
  if (pathExists(repoPath)) return;

  const target = readlinkSync(agentPath);
  log.error('❌ skill-lock.json 前置校验未通过');
  log.error(`  ~/.agents/.skill-lock.json 已是指向 "${target}" 的软链接`);
  log.error(`  而目标仓库 ${repoRoot} 中尚不存在 skill-lock.json，建立软链接必然失败`);
  log.error('  请先执行 ss sync --restore 恢复为普通文件，或备份后删除该软链接，再重新运行 ss setup。');
  process.exit(1);
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

  // ═══ 校验段：只读、零副作用，全部通过后才开始任何写入 ═══
  log.info('步骤 1/6: 校验输入与前置条件（只读）...');

  let repoRoot: string | null = null; // 已确定要使用的仓库根（复用场景）
  let cloneUrl: string | null = null; // 待 clone 的地址（需新建仓库场景）
  let pendingRoot: string | null = null; // 校验用的待定仓库根（clone 目标）

  if (isInsideGitRepo(cwd)) {
    // 当前目录在 git 项目内 → 一律复用该仓库（即便提供 --git 也先检查复用，避免嵌套 clone）
    repoRoot = getGitRoot(cwd);
    if (!pathExists(getSkillsDir(repoRoot))) {
      log.error(`仓库 ${repoRoot} 中不存在 skills/ 目录，不符合复用标准，已中止。`);
      log.error('复用以存在的 git 仓库需同时满足：1) 当前目录位于 git 仓库内；2) 仓库根下存在 skills/ 目录。');
      log.error('说明：即便提供 --git 地址，当前已在 git 项目内也不会直接 clone（避免嵌套 git 仓库），请先创建 skills/ 目录，或在非 git 目录下执行。');
      process.exit(1);
    }
    log.success(`检测到当前在 git 项目中，复用仓库: ${repoRoot}`);
  } else {
    // 不在任意 git 项目内 → 需要 clone：取 --git 或交互询问地址（仅读入，先不 clone）
    cloneUrl = (options.git?.trim() || (await promptGitUrl()).trim()) || null;
    if (!cloneUrl) {
      log.error('未提供 git 仓库地址，取消初始化');
      process.exit(1);
    }
    pendingRoot = resolve(cwd, repoNameFromUrl(cloneUrl));
    // 校验顺序：先本地可判定项（目标目录占用、agent 软链接冲突），再远端网络校验
    precheckCloneDest(pendingRoot);
  }

  // 校验 skill-lock.json 软链接可建立性（本地只读），避免 clone 后才失败（残留目录的根源）
  precheckAgentSkillLock(repoRoot ?? pendingRoot!);

  // 需要 clone 时最后再访问远端，确认仓库可访问后才进入执行段
  if (cloneUrl) {
    precheckRemote(cloneUrl);
  }

  // 一次性记录最终要写入的仓库根与克隆标记
  let clonedRoot: string | null = null;
  const commitTarget = repoRoot ?? pendingRoot!;
  log.success(`前置校验通过，目标仓库: ${commitTarget}`);

  // ═══ 执行段：此时才开始允许任何副作用（clone / 建目录 / 写文件 / 建软链接）═══
  try {
    // 步骤 2/6: clone（若需新建仓库时才发生）
    if (cloneUrl) {
      repoRoot = cloneRepo(cloneUrl, cwd);
      clonedRoot = repoRoot;
    } else {
      repoRoot = commitTarget;
    }

    // 步骤 3/6: 确保 skills/ 目录存在
    log.info('步骤 3/6: 检查 skills 目录...');
    const skillsDir = getSkillsDir(repoRoot);
    if (!pathExists(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
      log.success(`已创建 skills/ 目录: ${skillsDir}`);
    } else {
      log.success(`skills/ 目录已存在: ${skillsDir}`);
    }

    // 步骤 4/6: 预置默认 skills-skills 技能
    log.info('步骤 4/6: 预置默认技能...');
    ensureDefaultSkill(skillsDir);

    // 步骤 5/6: 生成使用指南
    log.info('步骤 5/6: 生成使用指南...');
    ensureGuide(repoRoot);

    console.log();

    // 步骤 6/6: 记录仓库根并同步 skill-lock.json 软链接
    log.info('步骤 6/6: 记录仓库并同步 skill-lock.json...');
    writeConfig({ repoRoot });
    log.success(`已记录 skills 仓库: ${repoRoot}`);
    await syncCommand({ restore: false });

    console.log();

    // 收尾：安装 skills 到当前设备
    log.info('安装手写 skills...');
    const skills = scanSkills(repoRoot);
    if (skills.length === 0) {
      log.warn('skills/ 目录下暂无技能，跳过安装');
    } else {
      await installCommand({ dryRun: false });
    }
  } catch (err: any) {
    // 执行段出错：若刚 clone 出目录则清理，避免残留半成品/目录
    log.error(`初始化失败: ${err?.message ?? err}`);
    if (clonedRoot) {
      log.warn(`清理未完成的 clone 目录: ${clonedRoot}`);
      rmSync(clonedRoot, { recursive: true, force: true });
    }
    process.exit(1);
  }

  log.title('✅ 初始化完成！');
  log.dim(`你的 skills 仓库: ${repoRoot}`);
  log.info('运行 ss list / ss install 管理你的 skills');
}
