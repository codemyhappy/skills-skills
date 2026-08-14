import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncCommand } from './commands/sync.js';
import { installCommand, listCommand } from './commands/install.js';
import { setupCommand } from './commands/setup.js';

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

// ss sync
program
  .command('sync')
  .description('将 ~/.agents/.skill-lock.json 软链接到本仓库')
  .option('--restore', '取消软链接，恢复为普通文件')
  .action(async (options) => {
    await syncCommand(options);
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

// ss setup
program
  .command('setup')
  .description('一键初始化：定位/创建 skills 仓库（复用当前 git 项目或 clone 指定仓库）+ 同步 + 安装')
  .option('--git <url>', '指定 skills git 仓库地址（当前目录不在 git 内时自动 clone）')
  .action(async (options) => {
    await setupCommand({ git: options.git });
  });

// ── 启动 ──────────────────────────────────────────────
program.parse();