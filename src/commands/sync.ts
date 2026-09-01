import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  getAgentSkillLockPath,
  getRepoSKillLockPath,
  getRepoRoot,
  getLang,
  log,
  pathExists,
  readConfig,
  readLastSync,
  writeLastSync,
} from '../utils.js';

// ── 时间戳与备份 ──────────────────────────────────────

/** 生成 YYYY-MM-DD-HHmmss 时间戳（如 2026-08-26-160312） */
function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 生成目录下不冲突的时间戳备份路径 */
function nextBackupPath(dir: string): string {
  let p = resolve(dir, `skill-lock-${timestamp()}.json.ss.bak`);
  for (let i = 1; pathExists(p); i++) {
    p = resolve(dir, `skill-lock-${timestamp()}-${i}.json.ss.bak`);
  }
  return p;
}

/** 拷贝文件前先把源解析为真实文件（跟随软链接到原始目标） */
function copyResolved(src: string, dst: string): void {
  let real = src;
  try {
    if (lstatSync(src).isSymbolicLink()) real = realpathSync(src);
  } catch {
    /* 源不存在等，交给 copyFileSync 抛错 */
  }
  copyFileSync(real, dst);
}

/** 备份 src 到 dir 下（src 不存在则跳过），返回备份路径或 null */
function backupFile(src: string, dir: string): string | null {
  if (!pathExists(src)) return null;
  mkdirSync(dir, { recursive: true });
  const p = nextBackupPath(dir);
  copyResolved(src, p);
  return p;
}

/**
 * 兼容旧版本：若 ~/.agents/.skill-lock.json 仍是软链接，则扁平化为真实文件。
 * 软链接方案已废弃，这里仅做一次性迁移。
 */
function flattenLegacySymlink(agentPath: string): void {
  try {
    if (!lstatSync(agentPath).isSymbolicLink()) return;
    const real = realpathSync(agentPath);
    mkdirSync(dirname(agentPath), { recursive: true });
    const bak = backupFile(real, dirname(agentPath));
    unlinkSync(agentPath);
    copyFileSync(real, agentPath);
    log.warn(
      {
        zh: `检测到旧版软链接，已自动扁平化为真实文件${bak ? `（原内容备份: ${bak}）` : ''}`,
        en: `Detected a legacy symlink; flattened to a real file${bak ? ` (original backed up: ${bak})` : ''}`,
      },
    );
  } catch {
    /* 路径不存在等，忽略 */
  }
}

// ── skill-lock.json 读取与规范化 ──────────────────────

/** 读取 lock JSON（解析失败返回 null） */
function readLock(p: string): any | null {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** diff 时忽略的时间戳字段（每次 install 都会变化，无实际意义） */
const IGNORED_FIELDS = ['installedAt', 'updatedAt'];

/** 规范化 skill 值：去掉时间戳字段，仅用于比较 */
function normalizeSkill(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  const copy: any = { ...value };
  for (const f of IGNORED_FIELDS) delete copy[f];
  return copy;
}

/** 规范化整个 lock：返回 { version, skills } 或 null */
function normalizeLock(lock: any): { version: any; skills: Record<string, any> } | null {
  if (!lock || typeof lock !== 'object') return null;
  const skills: Record<string, any> = {};
  const rawSkills = lock.skills ?? {};
  if (rawSkills && typeof rawSkills === 'object') {
    for (const [name, value] of Object.entries(rawSkills)) {
      skills[name] = normalizeSkill(value);
    }
  }
  return { version: lock.version, skills };
}

function lockEquals(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── diff（key 级语义对比）─────────────────────────────

interface DiffEntry {
  type: '+' | '-' | 'M';
  name: string;
}

/** 本地 vs 仓库差异：+ 仅本地新增、- 仅仓库存在（本地删除/未同步）、M 两边存在但不同 */
function computeDiff(local: any, repo: any): DiffEntry[] {
  const ln = normalizeLock(local) ?? { version: undefined, skills: {} };
  const rn = normalizeLock(repo) ?? { version: undefined, skills: {} };
  const names = new Set([...Object.keys(ln.skills), ...Object.keys(rn.skills)]);
  const entries: DiffEntry[] = [];
  for (const name of names) {
    const hasL = name in ln.skills;
    const hasR = name in rn.skills;
    if (hasL && !hasR) entries.push({ type: '+', name });
    else if (!hasL && hasR) entries.push({ type: '-', name });
    else if (!lockEquals(ln.skills[name], rn.skills[name])) entries.push({ type: 'M', name });
  }
  return entries;
}

// ── 三方合并 ──────────────────────────────────────────

interface MergeOutcome {
  merged: any; // 合并结果（含原始字段，非规范化）
  conflicts: string[];
  versionConflict: boolean;
}

/**
 * 三方合并：base = last-sync 镜像，ours = 本地，theirs = 仓库。
 * 自动解决单向改动；双侧都改且不一致时记为冲突。
 */
function mergeThreeWay(base: any, local: any, repo: any): MergeOutcome {
  const bn = normalizeLock(base) ?? { version: undefined, skills: {} };
  const ln = normalizeLock(local) ?? { version: undefined, skills: {} };
  const rn = normalizeLock(repo) ?? { version: undefined, skills: {} };
  const skillsOut: Record<string, any> = {};
  const conflicts: string[] = [];

  const names = new Set([
    ...Object.keys(bn.skills),
    ...Object.keys(ln.skills),
    ...Object.keys(rn.skills),
  ]);

  for (const name of names) {
    const b = name in bn.skills ? bn.skills[name] : undefined;
    const a = name in ln.skills ? ln.skills[name] : undefined;
    const c = name in rn.skills ? rn.skills[name] : undefined;
    const hasB = b !== undefined;
    const hasA = a !== undefined;
    const hasC = c !== undefined;

    if (!hasA && !hasC) continue; // 两侧都删除

    if (!hasB) {
      // 新增：base 中不存在
      if (hasA && !hasC) skillsOut[name] = local?.skills?.[name];
      else if (!hasA && hasC) skillsOut[name] = repo?.skills?.[name];
      else if (lockEquals(a, c)) skillsOut[name] = local?.skills?.[name];
      else conflicts.push(name); // 两侧同时新增且不同
      continue;
    }

    // 已存在：base 中有
    if (!hasA || !hasC) continue; // 任一侧删除 → 采用删除
    if (lockEquals(a, c)) skillsOut[name] = local?.skills?.[name];
    else if (lockEquals(a, b)) skillsOut[name] = repo?.skills?.[name];
    else if (lockEquals(c, b)) skillsOut[name] = local?.skills?.[name];
    else conflicts.push(name);
  }

  // version 字段：两侧不一致视为冲突，不自动选择
  const versionConflict =
    local?.version !== undefined &&
    repo?.version !== undefined &&
    local.version !== repo.version;

  const merged: any = {
    ...(local ?? repo ?? base ?? {}),
    version: local?.version ?? repo?.version ?? base?.version,
    skills: skillsOut,
  };

  return { merged, conflicts, versionConflict };
}

// ── 命令实现 ──────────────────────────────────────────

/** 解析当前 skills 仓库根，找不到则报错退出 */
function resolveRepoRoot(): string {
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    log.error({ zh: '未找到 skills 仓库，请先运行 ss init', en: 'No skills repo found. Run ss init first' });
    process.exit(1);
  }
  return repoRoot;
}

/** 拉取：仓库 → 本地真实文件（写前备份本地） */
export async function pullCommand(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  flattenLegacySymlink(agentPath);

  if (!pathExists(repoPath)) {
    log.error(`仓库中不存在 skill-lock.json: ${repoPath}`);
    process.exit(1);
  }

  mkdirSync(dirname(agentPath), { recursive: true });
  const bak = backupFile(agentPath, dirname(agentPath));
  copyResolved(repoPath, agentPath);

  const content = readLock(repoPath);
  if (content) writeLastSync(content);

  log.success({
    zh: `已拉取仓库 skill-lock.json 到本地${bak ? `（原文件备份: ${bak}）` : ''}`,
    en: `Pulled repo skill-lock.json to local${bak ? ` (original backed up: ${bak})` : ''}`,
  });
}

/** 推送：本地 → 仓库真实文件（写前备份仓库），随后提示 git 提交 */
export async function pushCommand(options: { remote?: boolean } = {}): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  flattenLegacySymlink(agentPath);

  if (!pathExists(agentPath)) {
    log.error({ zh: `本地不存在 skill-lock.json: ${agentPath}`, en: `No local skill-lock.json: ${agentPath}` });
    process.exit(1);
  }

  mkdirSync(dirname(repoPath), { recursive: true });
  const bak = backupFile(repoPath, dirname(agentPath));
  copyResolved(agentPath, repoPath);

  const content = readLock(agentPath);
  if (content) writeLastSync(content);

  log.success({
    zh: `已推送本地 skill-lock.json 到仓库${bak ? `（原仓库文件备份: ${bak}）` : ''}`,
    en: `Pushed local skill-lock.json to repo${bak ? ` (repo file backed up: ${bak})` : ''}`,
  });

  // --remote / -r：自动 git add + commit + push
  if (options.remote) {
    gitCommitPush(repoRoot);
  } else {
    log.info({
      zh: '提示：运行 ss push --remote 自动提交并推送到远端',
      en: 'Hint: run ss push --remote to auto commit & push to remote',
    });
  }
}

/** 在仓库内执行 git add skill-lock.json + git commit + git push（自动提交） */
function gitCommitPush(repoRoot: string): void {
  const lang = getLang();
  // git 本地身份兜底（避免 commit 失败于缺少 user.name/user.email）
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'ss',
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'ss@local',
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'ss',
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'ss@local',
    GIT_TERMINAL_PROMPT: '0',
  };

  log.info({ zh: '提交并推送到远端...', en: 'Committing and pushing to remote...' });

  // 1) 把 skill-lock.json 暂存
  execSync('git add skill-lock.json', { cwd: repoRoot, stdio: 'inherit', env });

  // 2) 判断暂存区是否有变更：`git diff --quiet --cached` 在有差异时 exit 1，无差异时 exit 0
  let hasChange = false;
  try {
    execSync('git diff --quiet --cached -- skill-lock.json', { cwd: repoRoot, stdio: 'pipe', env });
    // exit 0 → 无暂存变更
  } catch {
    hasChange = true; // exit 1 → 有变更
  }

  if (!hasChange) {
    log.info({ zh: '暂存区无变更，跳过提交', en: 'No staged changes, skipping commit' });
  } else {
    const msg = lang === 'en' ? 'sync: update skill-lock.json' : 'sync: 更新 skill-lock.json';
    // 3) 提交（-m 避免打开编辑器）
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: repoRoot, stdio: 'inherit', env });
  }

  // 4) 推送到 origin
  try {
    execSync('git push', { cwd: repoRoot, stdio: 'inherit', env });
    log.success({ zh: '已提交并推送到远端 🎉', en: 'Committed and pushed to remote 🎉' });
  } catch (err: any) {
    log.error({ zh: `推送到远端失败: ${err?.message ?? err}`, en: `Push to remote failed: ${err?.message ?? err}` });
    log.info({
      zh: '可以手动执行: git push',
      en: 'You can do it manually: git push',
    });
    process.exit(1);
  }
}

/**
 * 三方合并并写回本地与仓库。
 * 返回 'merged' | 'conflict' | 'noop'；冲突时默认不写任何文件。
 */
export async function mergeImpl(
  repoRoot: string,
  options: { ours?: boolean; theirs?: boolean },
): Promise<'merged' | 'conflict' | 'noop'> {
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  flattenLegacySymlink(agentPath);

  // 一侧缺失 → 等价 pull / push
  if (!pathExists(agentPath)) {
    await pullCommand();
    return 'merged';
  }
  if (!pathExists(repoPath)) {
    await pushCommand();
    return 'merged';
  }

  const local = readLock(agentPath);
  const repo = readLock(repoPath);

  // 无差异（忽略时间戳字段）
  if (computeDiff(local, repo).length === 0) {
    log.success({ zh: '本地与仓库已一致，无需合并', en: 'Local and repo are already in sync, nothing to merge' });
    return 'noop';
  }

  const force = options.ours ? 'ours' : options.theirs ? 'theirs' : null;
  const base = readLastSync();
  const result = mergeThreeWay(base, local, repo);

  const conflicts = [...result.conflicts];
  if (result.versionConflict) conflicts.push('(顶层 version 字段不一致) / (top-level version field mismatch)');

  if (conflicts.length > 0 && !force) {
    log.error({ zh: '合并存在冲突，未做任何修改：', en: 'Merge conflicts found, no changes made:' });
    for (const name of conflicts) log.error(`  ✖ ${name}`);
    log.info({
      zh: '请运行 ss merge --ours / ss merge --theirs 选择一侧，或手动编辑后重试。',
      en: 'Run ss merge --ours / ss merge --theirs to pick a side, or edit manually and retry.',
    });
    return 'conflict';
  }

  // 强制选侧时解决冲突
  if (conflicts.length > 0) {
    if (result.versionConflict && force === 'ours') result.merged.version = local?.version;
    if (result.versionConflict && force === 'theirs') result.merged.version = repo?.version;
    for (const name of result.conflicts) {
      result.merged.skills[name] =
        force === 'ours' ? local?.skills?.[name] : repo?.skills?.[name];
    }
    log.warn({ zh: `冲突已按 --${force} 解决`, en: `Conflicts resolved with --${force}` });
  }

  // 写回本地与仓库（先各自备份）
  mkdirSync(dirname(agentPath), { recursive: true });
  backupFile(agentPath, dirname(agentPath));
  backupFile(repoPath, dirname(agentPath));
  writeFileSync(agentPath, JSON.stringify(result.merged, null, 2) + '\n');
  writeFileSync(repoPath, JSON.stringify(result.merged, null, 2) + '\n');
  writeLastSync(result.merged);

  log.success({ zh: '合并完成，已写回本地与仓库', en: 'Merge complete, written to local and repo' });
  log.info({
    zh: '提示：若仓库内容有变更，请执行 git add skill-lock.json && git commit && git push',
    en: 'Hint: if repo content changed, run git add skill-lock.json && git commit && git push',
  });
  return 'merged';
}

/** ss merge：三方合并命令 */
export async function mergeCommand(options: { ours?: boolean; theirs?: boolean }): Promise<void> {
  const repoRoot = resolveRepoRoot();
  log.title({ zh: '🔀 skill-lock.json 三方合并', en: '🔀 Three-way merge skill-lock.json' });
  const result = await mergeImpl(repoRoot, options);
  if (result === 'conflict') process.exit(1);
}

/** ss sync：便捷同步，等价 merge */
export async function syncCommand(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  log.title({ zh: '🔄 skill-lock.json 同步', en: '🔄 Sync skill-lock.json' });
  const result = await mergeImpl(repoRoot, {});
  if (result === 'conflict') process.exit(1);
}

/** ss diff：key 级语义对比 */
export async function diffCommand(options: { json?: boolean }): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  flattenLegacySymlink(agentPath);

  const local = readLock(agentPath);
  const repo = readLock(repoPath);

  if (options.json) {
    console.log(JSON.stringify(computeDiff(local, repo), null, 2));
    return;
  }

  log.title({ zh: 'skill-lock.json 差异（本地 vs 仓库）', en: 'skill-lock.json diff (local vs repo)' });
  const entries = computeDiff(local, repo);
  if (entries.length === 0) {
    log.success({ zh: '无差异，本地与仓库一致', en: 'No differences, local and repo are in sync' });
    return;
  }
  for (const e of entries) {
    if (e.type === '+') log.info({ zh: `  + ${e.name}  （仅本地）`, en: `  + ${e.name}  (local only)` });
    else if (e.type === '-') log.info({ zh: `  - ${e.name}  （仅仓库）`, en: `  - ${e.name}  (repo only)` });
    else log.warn({ zh: `  M ${e.name}  （两边存在但内容不同）`, en: `  M ${e.name}  (different on both sides)` });
  }
  console.log();
  log.info({ zh: '运行 ss merge 自动合并，或 ss pull / ss push 强制覆盖。', en: 'Run ss merge to auto-merge, or ss pull / ss push to force overwrite.' });
}

/** ss status：同步状态摘要 */
export async function statusCommand(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const cfg = readConfig();
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  flattenLegacySymlink(agentPath);

  const local = readLock(agentPath);
  const repo = readLock(repoPath);

  log.title({ zh: '📋 skills 同步状态', en: '📋 skills sync status' });
  log.info({ zh: `仓库根目录: ${repoRoot}`, en: `Repo root: ${repoRoot}` });
  if (cfg.remoteUrl) log.info({ zh: `远端地址: ${cfg.remoteUrl}`, en: `Remote URL: ${cfg.remoteUrl}` });
  log.info({
    zh: `本地文件: ${pathExists(agentPath) ? agentPath : '（不存在）'}`,
    en: `Local file: ${pathExists(agentPath) ? agentPath : '(missing)'}`,
  });
  log.info({
    zh: `仓库文件: ${pathExists(repoPath) ? repoPath : '（不存在）'}`,
    en: `Repo file: ${pathExists(repoPath) ? repoPath : '(missing)'}`,
  });

  const entries = computeDiff(local, repo);
  if (!pathExists(agentPath)) {
    log.warn({ zh: '本地尚未有 skill-lock.json，运行 ss pull 拉取', en: 'No local skill-lock.json yet, run ss pull' });
  } else if (!pathExists(repoPath)) {
    log.warn({ zh: '仓库尚未有 skill-lock.json，运行 ss push 推送', en: 'No repo skill-lock.json yet, run ss push' });
  } else if (entries.length === 0) {
    log.success({ zh: '状态：已同步，无差异', en: 'Status: in sync, no differences' });
  } else {
    log.warn({
      zh: `状态：存在 ${entries.length} 处差异（ss diff 查看，ss merge 合并）`,
      en: `Status: ${entries.length} difference(s) (see ss diff, merge with ss merge)`,
    });
  }
}

/**
 * init 结尾的自动同步：按两文件有无情况选择 pull/push/初始化/合并。
 * 不退出进程（init 即使遇冲突也继续完成）。
 */
export async function syncSkillLock(repoRoot: string): Promise<void> {
  const agentPath = getAgentSkillLockPath();
  const repoPath = getRepoSKillLockPath(repoRoot);

  flattenLegacySymlink(agentPath);

  const hasLocal = pathExists(agentPath);
  const hasRepo = pathExists(repoPath);

  if (!hasLocal && !hasRepo) {
    mkdirSync(dirname(agentPath), { recursive: true });
    writeFileSync(agentPath, '{}\n');
    log.warn({ zh: '本地与仓库均无 skill-lock.json，已在本地初始化空文件', en: 'No skill-lock.json on either side, initialized an empty file locally' });
    return;
  }
  if (!hasLocal) {
    await pullCommand();
    return;
  }
  if (!hasRepo) {
    await pushCommand();
    return;
  }

  const local = readLock(agentPath);
  const repo = readLock(repoPath);
  if (computeDiff(local, repo).length === 0) {
    log.success({ zh: 'skill-lock.json 本地与仓库已一致', en: 'skill-lock.json is in sync between local and repo' });
    return;
  }
  await mergeImpl(repoRoot, {});
}