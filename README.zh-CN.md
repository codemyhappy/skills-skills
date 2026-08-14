# skills-skills 🧰

**skills-skills**（`ss`）CLI 工具 — 个人 skills 管理器。**一处编写，多处同步，版本管理**。

统一管理你手写的 skills 和 `skill-lock.json`，让不同设备都能拥有完全一致的 skills 环境。

> **English**: [README.md](README.md)

---

## 核心思路

1. **skills 仓库由你定义** —— skills 放在**你自己指定**的 git 仓库的 `skills/` 目录下。`ss setup` 会检测当前 git 项目，或按你提供的地址 clone；随后创建 `skills/` 并预置默认的 `skills-skills` 技能。
2. **skill-lock.json 用软链接同步** —— 将 `~/.agents/.skill-lock.json` 软链接到该仓库的 `skill-lock.json`，系统读写都直接落到仓库里，提交后其他设备 pull 即同步。

```
~/.agents/.skill-lock.json  ──(软链接)──>  <repo>/skill-lock.json
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
# 一键初始化：定位/创建你的 skills 仓库 + 同步软链接 + 安装所有手写 skills
ss setup
```

日常使用：

| 命令 | 说明 |
|------|------|
| `ss sync` | 将 `~/.agents/.skill-lock.json` 软链接到本仓库 |
| `ss sync --restore` | 取消软链接，恢复为普通文件 |
| `ss install` | 安装所有手写 skills |
| `ss install <name>` | 安装指定 skill |
| `ss install --dry-run` | 预览模式，只列不装 |
| `ss list` | 列出所有手写 skills |
| `ss -V` | 版本号 |

> `ss install` 内部执行 `npx skills add <绝对路径>`。

---

## 添加新手写 skill

```bash
# 1. 在 skills/ 下创建目录并编写 SKILL.md（含 frontmatter）
mkdir -p skills/my-skill

# 2. 安装到本地设备
ss install my-skill

# 3. 提交同步
git add .
git commit -m "feat: add my-skill"
git push
```

每台设备安装后执行一次 `ss setup` 即可恢复完整环境。

---

## 项目结构

```
skills-skills/
├── ss / skills-skills    # CLI 命令
├── skills/               # 手写 skills 存放目录
│   └── <name>/SKILL.md
├── skill-lock.json       # 设备同步的锁文件（软链接目标）
├── src/                  # CLI 源码（TypeScript + tsup 打包）
└── package.json
```

---

## 开发调试

```bash
pnpm dev     # 实时打包（tsup --watch）
```

VS Code 中 F5 → 选择 "Debug ss (tsx)" 即可直接调试 TypeScript 源码，内置 sync / setup / install / list 多组调试配置。

---

## 注意事项

- `skill-lock.json` 含本地路径信息，建议仓库设为 **私有**。
- 软链接在 macOS / Linux 原生支持，Windows 需管理员权限或开发者模式。
- 依赖 `npx skills`（OpenCLI 生态提供），请确保设备已安装相关工具。
