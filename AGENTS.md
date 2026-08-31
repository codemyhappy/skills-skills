# AGENTS.md

给 AI 编码助手（Claude Code / Cline 等）在本仓库工作的**行为指导**，基于本项目开发者历次对话沉淀的约定。

## 项目一句话

`skills-skills`（`ss`）：个人手写 skills 同步管理 CLI（TypeScript + commander + tsup 打包）。手写 skills 和 `skill-lock.json` 统一放进用户自己的 git 仓库，保证**每台设备 skills 环境一致**。

## 核心架构（必须遵守，勿回退）

- **彻底不用软链接**：`~/.agents/.skill-lock.json` 与 `<repo>/skill-lock.json` 都是**真实文件**。禁止引入 `symlinkSync` / `isSymlink` / `sync --restore`。
- **仓库根固定**：`~/.config/skills-skills/skill-sync-repo`（clone 直达该目录，它就是仓库根）。**config 不存 repoRoot / repoName**，只存 `remoteUrl`。
- 三方合并基线：`~/.config/skills-skills/last-sync.json`。
- 职责边界：`ss` 管「本地 ⇄ 仓库」；「仓库 ⇄ 远端」交给原生 `git commit/pull/push`。

## 命令体系（git 风格）

| 命令 | 语义 |
|---|---|
| `ss init [url]`（别名 `setup`） | 初始化：clone 到统一目录（幂等复用），随后同步 + 安装 |
| `ss sync` | 自动三方合并（等价 merge） |
| `ss diff [--json]` | key 级差异：`+` 仅本地 / `-` 仅仓库 / `M` 均改不同 |
| `ss merge [--ours\|--theirs]` | 三方合并；冲突默认中止，可强制取一侧 |
| `ss pull` | 仓库 → 本地（覆盖前时间戳备份） |
| `ss push` | 本地 → 仓库（覆盖前时间戳备份），提示 git 提交 |
| `ss status` | 同步状态摘要 |
| `ss config [--lang <zh\|en>]` | 查看或修改本地配置（输出语言等） |
| `ss install [name]` / `ss list` | 技能安装 / 列表 |

## 关键行为约定

- **两段式执行**：校验段（只读、零副作用：`git`/`npx` 依赖、目标目录占用、远端 `ls-remote`）全部通过，才进入执行段（clone / 建目录 / 写文件）。
- 执行段失败必须清理刚 clone 的目录，**不留残留**。
- diff/merge 忽略 `installedAt` / `updatedAt` 时间戳字段（避免每次 install 都产生噪音）。
- 覆盖写入前先备份，按时间命名：`skill-lock-YYYY-MM-DD-HHmmss.json.ss.bak`（放 `~/.agents/`）。
- 遇到旧版遗留软链接：自动扁平化为真实文件（带备份），不报错中断。
- 报错信息要给出**可操作的下一步**（如安装命令、`ss merge --ours` 等），不抛裸异常。
- **双语输出**：所有命令提示支持中/英，按 `config.json` 的 `lang`（`zh`/`en`，默认 `zh`）自动选择。log 消息用 `{ zh, en }` 对象；切换语言用 `ss config --lang <zh|en>`（**不**在 `ss init` 里询问）。文档（README / SKILLS-GUIDE）需中英两份。
- CWD 中执行 `ss`（裸命令）输出帮助 + 精简使用指南。
- 注释用中文；逻辑改动请同步更新 README 双语 + SKILLS-GUIDE 相关描述。

## 开发与测试（红线）

- 构建：`npx tsup`（产物 `bin/ss.js`，已被 gitignore）；类型检查：`./node_modules/.bin/tsc -p tsconfig.json --noEmit`。
- **严禁在真实环境执行写操作验证**：不要去动本机 `~/.agents`、`~/.config/skills-skills` 或用户的真实仓库。曾因在用户真实环境跑 `push/pull` 造成污染，务必引以为戒。
- 注意 macOS `/var` → `/private/var` 软链路径差异（`git rev-parse` 返回 realpath），断言用宽松匹配。
- 用户的真实 gite 仓库测试由用户自己做；如需用其做只读校验，先征求同意。
- 不需要e2e测试，命令的测试工作交给用户来做。