import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  syncCommand,
  diffCommand,
  mergeCommand,
  pullCommand,
  pushCommand,
  statusCommand,
} from './commands/sync.js';
import { installCommand, listCommand } from './commands/install.js';
import { initCommand } from './commands/init.js';
import { getLang } from './utils.js';

// ── 读取 package.json 获取版本号 ──────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'),
);

// ── 语言（按 config.lang，默认 zh）────────────────────
const L = getLang();
const zh = L !== 'en';

// ── 项目使用指南（随帮助一起输出，双语）────────────────
const USAGE_GUIDE = zh
  ? `
📖 使用指南

1. 初始化（每台设备执行一次）
   ss init <你的仓库地址>

2. 同步 skill-lock.json
   ss push        # 改动本机环境后执行：本地写入仓库（随后 git commit/push）
   ss pull        # 其他设备有更新后执行：仓库写回本地

3. 差异与合并
   ss diff        # 查看本地与仓库的差异
   ss merge       # 自动合并；冲突时按提示加 --ours 或 --theirs

4. 管理技能
   ss install [名称]   # 安装技能到本机
   ss list             # 列出所有手写技能
`
  : `
📖 Usage Guide

1. Init (once per device)
   ss init <your-repo-url>

2. Sync skill-lock.json
   ss push        # after local changes: local → repo (then git commit/push)
   ss pull        # after other devices updated: repo → local

3. Diff & merge
   ss diff        # show differences between local and repo
   ss merge       # auto merge; use --ours or --theirs on conflict

4. Manage skills
   ss install [name]   # install skills on this device
   ss list             # list all handwritten skills
`;

// ── CLI 定义 ──────────────────────────────────────────
const program = new Command();

program
  .name('ss')
  .description(
    zh
      ? '个人手写 skills 管理工具 — 跨设备统一管理你的 skills'
      : 'Personal handwritten-skills manager — keep your skills identical across devices',
  )
  .version(pkg.version, '-V, --version', zh ? '输出版本号' : 'Print version')
  .addHelpCommand('help [command]', zh ? '显示帮助信息' : 'Display help for a command')
  .addHelpText('after', USAGE_GUIDE);

// ss init（别名 setup：兼容老版本）
program
  .command('init')
  .alias('setup')
  .description(
    zh
      ? '初始化 skills 仓库：clone 指定仓库到统一目录 ~/.config/skills-skills/skill-sync-repo 并同步 skill-lock.json（别名 setup，兼容老版本）'
      : 'Initialize: clone repo into ~/.config/skills-skills/skill-sync-repo & sync skill-lock.json (alias setup)',
  )
  .argument('[url]', zh ? 'skills git 仓库地址' : 'skills git repo URL')
  .option('--lang <zh|en>', zh ? '输出语言：zh 中文 / en English' : 'Output language: zh / en')
  .action(async (url, options) => {
    await initCommand({ url, lang: options.lang });
  });

// ss sync
program
  .command('sync')
  .description(
    zh ? '同步本地与仓库的 skill-lock.json（自动三方合并）' : 'Sync local & repo skill-lock.json via auto three-way merge',
  )
  .action(async () => {
    await syncCommand();
  });

// ss diff
program
  .command('diff')
  .description(zh ? '比较本地与仓库的 skill-lock.json' : 'Compare local vs repo skill-lock.json')
  .option('--json', zh ? '以 JSON 输出差异（脚本可读）' : 'Output diff as JSON (machine-readable)')
  .action(async (options) => {
    await diffCommand({ json: options.json });
  });

// ss merge
program
  .command('merge')
  .description(zh ? '三方合并本地与仓库的 skill-lock.json' : 'Three-way merge local & repo skill-lock.json')
  .option('--ours', zh ? '冲突时取本地版本' : 'Resolve conflicts with local version')
  .option('--theirs', zh ? '冲突时取仓库版本' : 'Resolve conflicts with repo version')
  .action(async (options) => {
    await mergeCommand({ ours: options.ours, theirs: options.theirs });
  });

// ss pull
program
  .command('pull')
  .description(
    zh ? '将仓库 skill-lock.json 拉取到本地（覆盖前自动备份）' : 'Pull repo skill-lock.json to local (auto backup before overwrite)',
  )
  .action(async () => {
    await pullCommand();
  });

// ss push
program
  .command('push')
  .description(
    zh ? '将本地 skill-lock.json 推送到仓库（覆盖前自动备份），随后自行 git commit/push' : 'Push local skill-lock.json to repo (auto backup), then git commit/push on your own',
  )
  .action(async () => {
    await pushCommand();
  });

// ss status
program
  .command('status')
  .description(zh ? '查看本地与仓库 skill-lock.json 同步状态' : 'Show local vs repo sync status')
  .action(async () => {
    await statusCommand();
  });

// ss install
program
  .command('install [skill]')
  .alias('i')
  .description(
    zh ? '安装手写 skills 到本地设备（默认全部安装）' : 'Install handwritten skills on this device (all by default)',
  )
  .option('--dry-run', zh ? '预览模式，只列不装' : 'Dry run: list only, do not install')
  .action(async (skill, options) => {
    await installCommand({ skill, dryRun: options.dryRun });
  });

// ss list
program
  .command('list')
  .alias('ls')
  .description(zh ? '列出所有手写 skills' : 'List all handwritten skills')
  .action(async () => {
    await listCommand();
  });

// ── 启动 ──────────────────────────────────────────────
// 裸执行 `ss`（无任何参数）：输出帮助 + 使用指南，
// 并以退出码 0 正常结束（commander 默认会打到 stderr 并以 1 退出）
if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exit(0);
}

program.parse();