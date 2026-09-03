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
  readConfig,
  getLang,
  log,
  pathExists,
} from '../utils.js';

/** git clone 到 skillDir 目录本身（该目录即仓库根），失败时抛错，交由调用方清理 */
function cloneRepo(url: string, dest: string): string {
  log.info({ zh: `clone 仓库: ${url}`, en: `Cloning repo: ${url}` });
  execSync(`git clone ${url} ${dest}`, { stdio: 'inherit' });
  if (!pathExists(dest)) {
    throw new Error(`clone 失败或目录不存在: ${dest} / clone failed or directory missing: ${dest}`);
  }
  log.success({ zh: `已 clone 到: ${dest}`, en: `Cloned to: ${dest}` });
  return dest;
}

/** 非交互环境下用 readline 询问 git 仓库地址 */
async function promptGitUrl(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const url = await rl.question(
    getLang() === 'en'
      ? 'Enter your skills git repo URL: '
      : '请输入你的 skills git 仓库地址: ',
  );
  rl.close();
  return url.trim();
}

/** 检测系统依赖（git / npx）是否可用，缺失时给出安装指引并退出 */
function precheckDependencies(): void {
  // git
  try {
    execSync('git --version', { stdio: 'pipe' });
  } catch {
    log.error({ zh: '未检测到 git，请先安装：', en: 'git not found. Please install it first:' });
    log.error({ zh: '  macOS:   brew install git 或执行 xcode-select --install', en: '  macOS:   brew install git or run xcode-select --install' });
    log.error({ zh: '  Windows: 到 https://git-scm.com/download/win 下载安装', en: '  Windows: download from https://git-scm.com/download/win' });
    log.error({ zh: '  Linux:   sudo apt-get install -y git  （或 yum/dnf 等价命令）', en: '  Linux:   sudo apt-get install -y git  (or yum/dnf equivalent)' });
    log.error({ zh: '安装完成后请重新运行 ss init。', en: 'Rerun ss init after installation.' });
    process.exit(1);
  }

  // npx（ss install 通过 npx skills 临时调用，无需预装 skills 包）
  try {
    execSync('npx --version', { stdio: 'pipe' });
  } catch {
    log.error({ zh: '未检测到 npx，请先安装 Node.js >= 18：', en: 'npx not found. Please install Node.js >= 18:' });
    log.error({ zh: '  到 https://nodejs.org/ 下载安装，或通过 nvm / fnm 等版本管理器安装。', en: '  Download from https://nodejs.org/ or use a version manager like nvm / fnm.' });
    log.error({ zh: '安装完成后请重新运行 ss init。', en: 'Rerun ss init after installation.' });
    process.exit(1);
  }

  log.success({ zh: '系统依赖检查通过（git / npx 均可用）', en: 'Dependencies check passed (git / npx available)' });
}

/** 校验远程仓库确实可访问（只读网络检查，无本地改动） */
function precheckRemote(url: string): void {
  log.info({ zh: `校验远程仓库可访问性: ${url}`, en: `Checking remote repo accessibility: ${url}` });
  try {
    execSync(`git ls-remote "${url}"`, {
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch {
    log.error({ zh: `无法访问远程仓库: ${url}`, en: `Cannot access remote repo: ${url}` });
    log.error({
      zh: '请检查地址是否正确、网络是否可达、是否有权限后重试。本次未做任何本地改动。',
      en: 'Check the URL, network access, or permissions, then retry. No local changes were made.',
    });
    process.exit(1);
  }
  log.success({ zh: '远程仓库可访问', en: 'Remote repo is accessible' });
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

/**
 * 归一化 git URL，用于跨写法比较：
 *   https://github.com/foo/bar.git
 *   https://github.com/foo/bar/
 *   git@github.com:foo/bar.git
 *   ssh://git@github.com/foo/bar
 * 统一变为：github.com/foo/bar（小写）
 * 注意：协议不同（http vs ssh）只影响写法，不影响「同一个仓库」的判定，所以一并归一。
 */
function normalizeUrl(u: string | undefined | null): string {
  if (!u) return '';
  let s = u.trim();
  // file://localhost/...  →  ...  (strip scheme+host)
  s = s.replace(/^file:\/\/localhost\//i, '');
  // file:///abs/path  →  /abs/path  (strip scheme; leading slash preserved)
  s = s.replace(/^file:\/\//i, '');
  // git@host:relative/path  →  host/relative/path  (scp 语法；仅相对路径适用 —
  // 若路径为绝对（git@host:/abs/...），它表示 SSH 到 host 上的绝对路径，与本机路径不等，故当作不同远端处理)
  s = s.replace(/^git@([^:]+):/i, '$1/');
  // ssh://user@host/path  →  host/path
  s = s.replace(/^[a-z]+:\/\/[^/@]+@([^/]+)\//i, '$1/');
  // 通用 https://host/  →  host/
  s = s.replace(/^[a-z]+:\/\/([^/]+)\//i, '$1/');
  // 去掉结尾的 .git 与 /
  s = s.replace(/\.git$/i, '').replace(/\/+$/, '');
  return s.toLowerCase();
}

/** 两个 URL 是否指向同一仓库（归一化后比较） */
function sameRepo(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  return na !== '' && na === nb;
}

/** 确保仓库 skills/ 目录下预置默认的 skills-skills 技能 */
function ensureDefaultSkill(skillsDir: string): void {
  const src = resolve(getPackageRoot(), 'skills', 'skills-skills');
  const dst = resolve(skillsDir, 'skills-skills');

  if (pathExists(dst)) {
    log.success({ zh: 'skills-skills 已存在，跳过预置', en: 'skills-skills already exists, skipping' });
    return;
  }
  if (!pathExists(src)) {
    log.warn({ zh: '未找到内置 skills-skills 模板，跳过预置', en: 'Built-in skills-skills template not found, skipping' });
    return;
  }
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  log.success({ zh: '已预置默认技能: skills-skills', en: 'Pre-seeded default skill: skills-skills' });
}

/** 在仓库根生成中英两份使用指南（各自存在则跳过） */
function ensureGuide(repoRoot: string): void {
  const langs: Array<{ file: string; zh: string; en: string }> = [
    { file: 'SKILLS-GUIDE.md', zh: '使用指南已存在: SKILLS-GUIDE.md', en: 'Guide already exists: SKILLS-GUIDE.md' },
    { file: 'SKILLS-GUIDE.en.md', zh: '使用指南已存在: SKILLS-GUIDE.en.md', en: 'Guide already exists: SKILLS-GUIDE.en.md' },
  ];
  for (const lang of langs) {
    ensureGuideFile(repoRoot, lang.file, lang.zh, lang.en);
  }
}

/** 生成单份使用指南（已存在则跳过） */
function ensureGuideFile(repoRoot: string, fileName: string, existsZh: string, existsEn: string): void {
  const guidePath = resolve(repoRoot, fileName);
  if (pathExists(guidePath)) {
    log.success({ zh: existsZh, en: existsEn });
    return;
  }

  const templatePath = resolve(getPackageRoot(), fileName);
  if (!pathExists(templatePath)) {
    log.warn({ zh: `未找到内置使用指南模板: ${templatePath}，跳过生成`, en: `Guide template not found: ${templatePath}, skipping` });
    return;
  }

  writeFileSync(guidePath, readFileSync(templatePath, 'utf-8'));
  log.success({ zh: `已生成使用指南: ${guidePath}`, en: `Generated guide: ${guidePath}` });
}

/**
 * ss init：初始化 skills 仓库（git 风格）。
 * 仓库统一存放在 ~/.config/skills-skills/skill-sync-repo，与执行目录无关：
 * 提供 url（位置参数或交互询问）→ clone 到该统一目录；目录已存在且为 git 仓库则幂等复用。
 * 校验（只读）全部通过后才执行写入。
 */
export async function initCommand(options: { url?: string }) {
  log.title({ zh: '🚀 初始化 skills 仓库', en: '🚀 Initialize skills repo' });

  // ═══ 校验段：只读、零副作用 ═══
  // 0) 提示当前语言（修改请先运行 ss config --lang <zh|en>）
  log.info({
    zh: `输出语言: ${getLang() === 'en' ? 'English' : '中文'}（修改请运行 ss config --lang <zh|en>）`,
    en: `Output language: ${getLang() === 'en' ? 'English' : 'Chinese'} (change with ss config --lang <zh|en>)`,
  });

    // 1) 系统依赖（git / npx）检测
  precheckDependencies();

  /** 用户本次传入的远端地址（位置参数），可能为空 */
  const inputUrl = options.url?.trim() || null;
  /** 上次 init 记录在 config 中的远端地址（可能无） */
  const cfg = readConfig();
  /** 是否已「初始化过」：config 中记录了 remoteUrl */
  const wasInitialized = Boolean(cfg.remoteUrl);

  // 统一 clone 到的仓库根（也是整个目录本身）
  let repoRoot = getSkillSyncRepoDir();

  let cloneUrl: string | null = null;        // 若需新建，则 clone 到此地址
  let originNeedsSet: string | null = null;   // 执行段中，为 origin 设置/更新的地址（只读校验段不执行）
  const dirExists = pathExists(repoRoot);

  // ── 层次 1/2/3：目录存在性 & 是否 git 仓库 ──────────────
  if (dirExists) {
    if (!isInsideGitRepo(repoRoot)) {
      log.error({ zh: `目标目录已存在但不是 git 仓库: ${repoRoot}`, en: `Target dir exists but is not a git repo: ${repoRoot}` });
      log.error({
        zh: '你可以清空该目录 `rm -rf ~/.config/skills-skills/skill-sync-repo` 后重试，或直接 `cd` 进该目录当作普通 git 仓库使用。',
        en: 'Empty the dir `rm -rf ~/.config/skills-skills/skill-sync-repo` and retry, or treat that dir as an ordinary git repo.',
      });
      process.exit(1);
    }

    // 目录已存在且为 git 仓库 → 读取 origin，进入「是否已初始化 + 地址是否匹配」校验
    const origin = getRemoteUrl(repoRoot);

    // 期望远端地址的优先级：用户本次输入 > config 历史记录
    const expectedUrl = inputUrl ?? cfg.remoteUrl ?? null;

    if (wasInitialized) {
      log.info({
        zh: `检测到已初始化过 (config.remoteUrl = ${cfg.remoteUrl})`,
        en: `Already initialized before (config.remoteUrl = ${cfg.remoteUrl})`,
      });
    }

    // ── 层次 4：地址一致性校验 ───────────────────────────
    if (expectedUrl) {
      if (origin && !sameRepo(origin, expectedUrl)) {
        // origin 与期望不匹配 → 阻止
        log.error({
          zh: `仓库远端地址不匹配，拒绝覆盖已存在的目录:\n  现有 origin: ${origin}\n  期望地址:   ${expectedUrl}`,
          en: `Remote URL mismatch, refusing to overwrite existing dir:\n  existing origin: ${origin}\n  expected URL:    ${expectedUrl}`,
        });
        log.info({
          zh: '解决办法：\n  1) `git remote set-url origin <正确地址>` 修正远端后重试；\n  2) 或 `rm -rf ~/.config/skills-skills/{skill-sync-repo,config.json}` 后重新 init。',
          en: 'Fix it:\n  1) `git remote set-url origin <correct-url>` and retry;\n  2) or `rm -rf ~/.config/skills-skills/{skill-sync-repo,config.json}` and re-init.',
        });
        process.exit(1);
      }
      // origin 为空（没配 remote）却有期望地址 → 执行段设置 origin
      if (!origin) {
        originNeedsSet = expectedUrl;
        log.warn({ zh: `目标仓库 origin 为空，将设置为: ${expectedUrl}`, en: `Repo has no origin; will set to: ${expectedUrl}` });
      }
    }

    // 地址一致（或都为空）→ 幂等复用，无需重新 clone
    log.warn({ zh: `目标目录已存在且为 git 仓库，直接复用: ${repoRoot}`, en: `Target dir already exists as a git repo, reusing: ${repoRoot}` });
    cloneUrl = null;
  } else {
    // ── 目录不存在：决定要 clone 的地址 ────────────────
    cloneUrl = inputUrl ?? cfg.remoteUrl ?? null;
    if (!cloneUrl) {
      cloneUrl = (await promptGitUrl()).trim() || null;
    }
    if (!cloneUrl) {
      log.error({ zh: '未提供 git 仓库地址，取消初始化', en: 'No git repo URL provided, init cancelled' });
      process.exit(1);
    }
    // 校验远程仓库可访问（只读网络检查）
    precheckRemote(cloneUrl);
    if (wasInitialized) {
      // config 里有地址但目录不见 → 警告，说明可能是上次 clone 失败
      log.warn({
        zh: `检测到 config.json 里记录的远端 (${cfg.remoteUrl}) 但目录不存在，重新克隆`,
        en: `config.json has remote (${cfg.remoteUrl}) but the repo dir is missing; re-cloning`,
      });
    }
  }

  log.success({ zh: `前置校验通过，目标仓库: ${repoRoot}`, en: `Pre-checks passed, target repo: ${repoRoot}` });

  // ═══ 执行段：此时才开始任何副作用 ═══
  let clonedRoot: string | null = null;
  try {
    // 1. clone（若需新建仓库，直接 clone 到统一目录即仓库根）
    if (cloneUrl) {
      repoRoot = cloneRepo(cloneUrl, repoRoot);
      clonedRoot = repoRoot;
    }

    // 2. 设置 origin（复用已有目录但 origin 为空的情况）
    if (originNeedsSet) {
      log.info({ zh: '设置仓库 origin...', en: 'Setting repo origin...' });
      execSync(`git remote add origin ${originNeedsSet}`, { cwd: repoRoot, stdio: 'inherit' });
      log.success({ zh: `origin 已设置为: ${originNeedsSet}`, en: `Origin set to: ${originNeedsSet}` });
    }

    // 2. 确保 skills/ 目录存在
    log.info({ zh: '检查 skills 目录...', en: 'Checking skills directory...' });
    const skillsDir = getSkillsDir(repoRoot);
    if (!pathExists(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
      log.success({ zh: `已创建 skills/ 目录: ${skillsDir}`, en: `Created skills/ directory: ${skillsDir}` });
    } else {
      log.success({ zh: `skills/ 目录已存在: ${skillsDir}`, en: `skills/ directory already exists: ${skillsDir}` });
    }

    // 3. 预置默认 skills-skills 技能
    log.info({ zh: '预置默认技能...', en: 'Pre-seeding default skill...' });
    ensureDefaultSkill(skillsDir);

    // 4. 生成中英两份使用指南
    log.info({ zh: '生成使用指南...', en: 'Generating usage guide...' });
    ensureGuide(repoRoot);

    // 5. 记录仓库配置（config 存 remoteUrl + lang，仓库根为固定统一目录，无需记录）
    log.info({ zh: '记录仓库配置...', en: 'Saving repo config...' });
    const remoteUrl = cloneUrl ?? getRemoteUrl(repoRoot);
    writeConfig({
      ...readConfig(),
      remoteUrl,
    });
    log.success({ zh: `已记录远端仓库: ${remoteUrl ?? '(无)'}`, en: `Remote repo saved: ${remoteUrl ?? '(none)'}` });

    // 6. 同步 skill-lock.json（pull/push/merge/初始化）
    log.info({ zh: '同步 skill-lock.json...', en: 'Syncing skill-lock.json...' });
    await syncSkillLock(repoRoot);


  } catch (err: any) {
    // 执行段出错：若刚 clone 出目录则清理，避免残留半成品
    log.error({ zh: `初始化失败: ${err?.message ?? err}`, en: `Init failed: ${err?.message ?? err}` });
    if (clonedRoot) {
      log.warn({ zh: `清理未完成的 clone 目录: ${clonedRoot}`, en: `Cleaning up incomplete clone dir: ${clonedRoot}` });
      rmSync(clonedRoot, { recursive: true, force: true });
    }
    process.exit(1);
  }

  log.title({ zh: '✅ 初始化完成！', en: '✅ Init complete!' });
  log.dim({ zh: `你的 skills 仓库: ${repoRoot}`, en: `Your skills repo: ${repoRoot}` });
  log.info({
    zh: '运行 ss list / ss install 管理你的 skills，运行 ss status 查看同步状态',
    en: 'Run ss list / ss install to manage skills, ss status to see sync state',
  });
}