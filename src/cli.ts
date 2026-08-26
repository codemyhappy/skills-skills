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

// ── 读取 package.json 获取版本号 ──────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'),
);

// ── CLI 定义 ──────────────────────────────────────────
const program = new Command();

program
  .name('ss')
  .description('个人手写 skills 管理工具 — 跨设备统一管理你的 skills')
  .version(pkg.version, '-V, --version', '输出版本号')
  .addHelpCommand('help [command]', '显示帮助信息');

// ss init
program
  .command('init')
  .description('初始化 skills 仓库：复用当前 git 仓库或 clone 指定仓库到统一目录，并同步 skill-lock.json')
  .argument('[url]', 'skills git 仓库地址（可选；当前目录在 git 内时复用当前仓库）')
  .action(async (url) => {
    await initCommand({ url });
  });

// ss sync
program
  .command('sync')
  .description('同步本地与仓库的 skill-lock.json（自动三方合并）')
  .action(async () => {
    await syncCommand();
  });

// ss diff
program
  .command('diff')
  .description('比较本地与仓库的 skill-lock.json')
  .option('--json', '以 JSON 输出差异（脚本可读）')
  .action(async (options) => {
    await diffCommand({ json: options.json });
  });

// ss merge
program
  .command('merge')
  .description('三方合并本地与仓库的 skill-lock.json')
  .option('--ours', '冲突时取本地版本')
  .option('--theirs', '冲突时取仓库版本')
  .action(async (options) => {
    await mergeCommand({ ours: options.ours, theirs: options.theirs });
  });

// ss pull
program
  .command('pull')
  .description('将仓库 skill-lock.json 拉取到本地（覆盖前自动备份）')
  .action(async () => {
    await pullCommand();
  });

// ss push
program
  .command('push')
  .description('将本地 skill-lock.json 推送到仓库（覆盖前自动备份），随后自行 git commit/push')
  .action(async () => {
    await pushCommand();
  });

// ss status
program
  .command('status')
  .description('查看本地与仓库 skill-lock.json 同步状态')
  .action(async () => {
    await statusCommand();
  });

// ss install
program
  .command('install [skill]')
  .alias('i')
  .description('安装手写 skills 到本地设备（默认全部安装）')
  .option('--dry-run', '预览模式，只列不装')
  .action(async (skill, options) => {
    await installCommand({ skill, dryRun: options.dryRun });
  });

// ss list
program
  .command('list')
  .alias('ls')
  .description('列出所有手写 skills')
  .action(async () => {
    await listCommand();
  });

// ── 启动 ──────────────────────────────────────────────
program.parse();