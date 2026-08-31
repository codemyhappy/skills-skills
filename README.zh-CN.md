# skills-skills 🧰

**skills-skills**（`ss`）CLI 工具 — 个人 skills 管理器。**一处编写，多处同步，版本管理**。

统一管理你手写的 skills 和 `skill-lock.json`，让不同设备都能拥有完全一致的 skills 环境。

> **English**: [README.md](README.md)

---

## 核心思路

1. **skills 仓库由你定义** —— skills 放在**你自己指定**的 git 仓库的 `skills/` 目录下。`ss init <仓库地址>` 会把仓库 clone 到每台设备统一的目录 `~/.config/skills-skills/skill-sync-repo`（重复执行幂等复用），随后创建 `skills/` 并预置默认的 `skills-skills` 技能。
2. **skill-lock.json 双真实文件** —— 本地一份真实文件（`~/.agents/.skill-lock.json`）+ 仓库一份受版本控制的文件（`<repo>/skill-lock.json`）。`ss` 用 git 风格的 `diff` / `merge` / `pull` / `push` 三方合并来保持两边一致。

```
   ss push                     git push
本地 ────────►  <repo>/skill-lock.json ────────►  远端
本地 ◄────────  <repo>/skill-lock.json ◄────────  远端
   ss pull                     git pull
```

---

## 安装 CLI

```bash
# 需要 Node.js >= 18
npm install -g skills-skills   # 同时提供 ss / skills-skills 两个命令
```

---

## 快速开始

```bash
# 把给定仓库地址 clone 到统一目录
ss init <你的仓库地址>
```

> `ss init` 会询问选择输出语言（中文 / English），并保存到 `~/.config/skills-skills/config.json`（`lang` 字段）。可用 `--lang zh` 或 `--lang en` 跳过询问；所有命令都会按该语言输出。

日常使用：

| 命令 | 说明 |
|------|------|
| `ss init [url]` | 初始化：把 `url` clone 到统一目录 `~/.config/skills-skills/skill-sync-repo`（幂等），随后同步并安装。别名为 `ss setup`（兼容老版本） |
| `ss diff [--json]` | 比较本地与仓库的 `skill-lock.json`（按 skill key 语义对比） |
| `ss merge [--ours\|--theirs]` | 三方合并本地与仓库（base = 上次同步基线）；有冲突默认中止，可用一侧强制解决 |
| `ss pull` | 仓库 → 本地（覆盖前自动备份） |
| `ss push` | 本地 → 仓库（覆盖前自动备份），随后自行 `git commit` / `git push` |
| `ss sync` | 自动三方合并（等价 `ss merge`） |
| `ss status` | 查看同步状态摘要 |
| `ss install [<name>]` | 安装所有（或指定）手写 skill |
| `ss list` | 列出所有手写 skills |
| `ss -V` | 版本号 |

> `ss install` 内部执行 `npx skills add <绝对路径>`。
> `installedAt` / `updatedAt` 这两个时间戳字段在 diff/merge 中默认忽略，避免每次 install 都产生差异。

---

## 三方合并原理

合并基线为上次同步后的快照，保存在 `~/.config/skills-skills/last-sync.json`。

对每个 skill key：

| base | 本地 | 仓库 | 结果 |
|---|---|---|---|
| 无 | 新增 | 无 | 保留本地 |
| 无 | 无 | 新增 | 保留仓库 |
| 存在 | 删除 | 存在 | 删除 |
| 存在 | 存在 | 删除 | 删除 |
| 存在 | 改动 | 未动 | 取仓库 |
| 存在 | 未动 | 改动 | 取本地 |
| 存在 | 改动 | 改动 | **冲突** |
| 无 | 新增 | 新增且不同 | **冲突** |

冲突时 `ss merge` 不写任何文件并列出冲突 key，可用 `--ours` / `--theirs` 或手动编辑解决。

---

## 项目结构

```
skills-skills/
├── ss / skills-skills    # CLI 命令
├── skills/               # 手写 skills 存放目录
│   └── <name>/SKILL.md
├── src/                  # CLI 源码（TypeScript + tsup 打包）
└── package.json

~/.config/skills-skills/
├── config.json           # remoteUrl
├── last-sync.json        # 三方合并基线
└── skill-sync-repo/      # 仓库本身（ss init <url> 的统一 clone 目标）

~/.agents/.skill-lock.json # 本工具维护的本地真实锁文件
```

---

## 开发调试

```bash
pnpm dev     # 实时打包（tsup --watch）
```

VS Code 中 F5 → 选择 "Debug ss (tsx)" 即可直接调试 TypeScript 源码，内置 sync / install / list 调试配置。

---

## 注意事项

- `skill-lock.json` 含本地路径信息，建议仓库设为 **私有**。
- `ss init` 会先检查系统依赖：自动检测 `git` 与 `npx skills` 是否可用，缺失时给出安装指引。
- 依赖 `npx skills`（OpenCLI 生态提供），请确保设备已安装相关工具。