import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { getRepoRoot, getSkillsDir, log, pathExists } from '../utils.js';

interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

/** 解析当前 skills 仓库根，找不到则报错退出 */
function resolveRepoRoot(): string {
  const repoRoot = getRepoRoot(process.cwd());
  if (!repoRoot) {
    log.error('未找到 skills 仓库，请先运行 ss init');
    log.info('提示：在任意 git 目录执行 ss init，或使用 ss init <仓库地址>');
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

    const info = parseSkillMd(skillMdPath);
    skills.push({
      name: info.name || entry.name,
      description: info.description || '(无描述)',
      path: resolve(skillsDir, entry.name),
    });
  }

  return skills;
}

/** 解析 SKILL.md 的 frontmatter，提取 name 和 description */
function parseSkillMd(filePath: string): { name?: string; description?: string } {
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
  const skills = scanSkills(repoRoot);

  if (skills.length === 0) {
    log.warn('skills/ 目录下未找到任何手写 skill');
    return;
  }

  log.title(`📦 手写 Skills（共 ${skills.length} 个）`);
  console.log();

  for (const skill of skills) {
    console.log(`  ${skill.name}`);
    log.dim(`    描述: ${skill.description}`);
    log.dim(`    路径: ${skill.path}`);
    console.log();
  }
}

export async function installCommand(options: { skill?: string; dryRun?: boolean }) {
  const repoRoot = resolveRepoRoot();
  const skills = scanSkills(repoRoot);

  if (skills.length === 0) {
    log.warn('skills/ 目录下未找到任何手写 skill');
    return;
  }

  const targets = options.skill
    ? skills.filter(s => s.name === options.skill || s.path.endsWith(options.skill!))
    : skills;

  if (targets.length === 0) {
    log.error(`未找到 skill: ${options.skill}`);
    log.info('可用 skills 列表:');
    for (const s of skills) {
      log.dim(`  - ${s.name}`);
    }
    process.exit(1);
  }

  log.title(options.dryRun ? '🔍 预览模式 — 将要安装以下 Skills' : `📥 安装 Skills（共 ${targets.length} 个）`);
  console.log();

  let successCount = 0;
  let failCount = 0;

  for (const skill of targets) {
    if (options.dryRun) {
      console.log(`  ${skill.name}`);
      log.dim(`    路径: ${skill.path}`);
      console.log();
      continue;
    }

    try {
      log.info(`安装: ${skill.name}`);
      execSync(`npx skills add "${skill.path}"`, {
        stdio: 'inherit',
        cwd: repoRoot,
      });
      log.success(`${skill.name} 安装成功`);
      successCount++;
    } catch (err: any) {
      log.error(`${skill.name} 安装失败: ${err.message}`);
      failCount++;
    }
    console.log();
  }

  if (!options.dryRun) {
    log.title('📊 安装结果');
    log.success(`成功: ${successCount}`);
    if (failCount > 0) log.error(`失败: ${failCount}`);
  }
}