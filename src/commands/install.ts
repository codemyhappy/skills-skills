import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { getRepoRoot, getSkillsDir, getLang, log, pathExists, getAgentSkillLockPath, getRepoSKillLockPath } from '../utils.js';

interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

/** 读取 lock JSON（解析失败返回 null） */
function readLock(p: string): any | null {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** 解析当前 skills 仓库根，找不到则报错退出 */
function resolveRepoRoot(): string {
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    log.error({ zh: '未找到 skills 仓库，请先运行 ss init', en: 'No skills repo found. Run ss init first' });
    log.info({
      zh: '提示：运行 ss init <仓库地址> 初始化',
      en: 'Hint: run ss init <repo-url> to initialize',
    });
    process.exit(1);
  }
  return repoRoot;
}

/** 扫描 skills/ 目录，收集所有包含 SKILL.md 的 skill */
export function scanSkills(repoRoot: string): SkillInfo[] {
  const skillsDir = getSkillsDir(repoRoot);
  if (!pathExists(skillsDir)) {
    return [];
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
    if (!pathExists(skillMdPath)) continue;

    const info = parseSkillMd(skillMdPath, getLang());
    skills.push({
      name: info.name || entry.name,
      description: info.description || (getLang() === 'en' ? '(no description)' : '(无描述)'),
      path: resolve(skillsDir, entry.name),
    });
  }

  return skills;
}

/** 解析 SKILL.md 的 frontmatter，提取 name 和 description */
function parseSkillMd(filePath: string, lang: 'zh' | 'en' = 'zh'): { name?: string; description?: string } {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);

    // 处理 description（支持单行、多行 >- 折叠语法）
    let description: string | undefined;
    const descBlockMatch = frontmatter.match(/^description:\s*>\s*-?\n((?:\s{2,}.+\n?)*)/m);
    if (descBlockMatch) {
      // 多行折叠块: >- 或 >
      description = descBlockMatch[1]
        .split('\n')
        .map(line => line.replace(/^\s{2,}/, '').trim())
        .filter(Boolean)
        .join(' ');
    } else {
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    return {
      name: nameMatch ? nameMatch[1].trim() : undefined,
      description,
    };
  } catch {
    return {};
  }
}

export async function listCommand() {
  const repoRoot = resolveRepoRoot();
  const lang = getLang();
  const skills = scanSkills(repoRoot);

  // ── 1. 手写 skills（skills/ 目录下）─────────────────────
  if (skills.length === 0) {
    log.warn({ zh: 'skills/ 目录下未找到任何手写 skill', en: 'No handwritten skills found in skills/' });
  } else {
    log.title({
      zh: `📦 手写 Skills（共 ${skills.length} 个）`,
      en: `📦 Handwritten Skills (${skills.length} total)`,
    });
    console.log();

    for (const skill of skills) {
      console.log(`  ${skill.name}`);
      log.dim({ zh: `    描述: ${skill.description}`, en: `    description: ${skill.description}` });
      log.dim({ zh: `    路径: ${skill.path}`, en: `    path: ${skill.path}` });
      console.log();
    }
  }

  // ── 2. skill-lock.json 中的技能 ────────────────────────
  const agentLockPath = getAgentSkillLockPath();
  const repoLockPath = getRepoSKillLockPath(repoRoot);
  const agentLock = readLock(agentLockPath);
  const repoLock = readLock(repoLockPath);

  const agentSkills = agentLock?.skills ? Object.keys(agentLock.skills) : [];
  const repoSkills = repoLock?.skills ? Object.keys(repoLock.skills) : [];

  // 合并去重
  const allLockSkills = [...new Set([...agentSkills, ...repoSkills])].sort();

  if (allLockSkills.length > 0) {
    log.title({
      zh: `🔒 skill-lock.json 中的技能（共 ${allLockSkills.length} 个）`,
      en: `🔒 Skills in skill-lock.json (${allLockSkills.length} total)`,
    });
    console.log();

    for (const name of allLockSkills) {
      const inAgent = agentSkills.includes(name);
      const inRepo = repoSkills.includes(name);
      let tag = '';
      if (inAgent && inRepo) tag = lang === 'en' ? '  (local + repo)' : '  （本地 + 仓库）';
      else if (inAgent) tag = lang === 'en' ? '  (local only)' : '  （仅本地）';
      else tag = lang === 'en' ? '  (repo only)' : '  （仅仓库）';
      log.info(`  ${name}${chalk.dim(tag)}`);
    }
    console.log();
  }
}

export async function installCommand(options: { skill?: string; dryRun?: boolean }) {
  const repoRoot = resolveRepoRoot();
  const skills = scanSkills(repoRoot);

  if (skills.length === 0) {
    log.warn({ zh: 'skills/ 目录下未找到任何手写 skill', en: 'No handwritten skills found in skills/' });
    return;
  }

  const targets = options.skill
    ? skills.filter(s => s.name === options.skill || s.path.endsWith(options.skill!))
    : skills;

  if (targets.length === 0) {
    log.error({ zh: `未找到 skill: ${options.skill}`, en: `Skill not found: ${options.skill}` });
    log.info({ zh: '可用 skills 列表:', en: 'Available skills:' });
    for (const s of skills) {
      log.dim(`  - ${s.name}`);
    }
    process.exit(1);
  }

  log.title(
    options.dryRun
      ? { zh: `🔍 预览模式 — 将要安装以下 Skills（${targets.length}）`, en: `🔍 Dry run — will install ${targets.length} skills` }
      : { zh: `📥 安装 Skills（共 ${targets.length} 个）`, en: `📥 Installing ${targets.length} skills` },
  );
  console.log();

  let successCount = 0;
  let failCount = 0;

  for (const skill of targets) {
    if (options.dryRun) {
      console.log(`  ${skill.name}`);
      log.dim({ zh: `    路径: ${skill.path}`, en: `    path: ${skill.path}` });
      console.log();
      continue;
    }

    try {
      log.info({ zh: `安装: ${skill.name}`, en: `Installing: ${skill.name}` });
      execSync(`npx skills add "${skill.path}"`, {
        stdio: 'inherit',
        cwd: repoRoot,
      });
      log.success({ zh: `${skill.name} 安装成功`, en: `${skill.name} installed` });
      successCount++;
    } catch (err: any) {
      log.error({ zh: `${skill.name} 安装失败: ${err.message}`, en: `${skill.name} install failed: ${err.message}` });
      failCount++;
    }
    console.log();
  }

  if (!options.dryRun) {
    log.title({ zh: '📊 安装结果', en: '📊 Install result' });
    log.success({ zh: `成功: ${successCount}`, en: `Success: ${successCount}` });
    if (failCount > 0) log.error({ zh: `失败: ${failCount}`, en: `Failed: ${failCount}` });
  }
}