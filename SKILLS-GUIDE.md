# skills-skills 使用指南

skills-skills（`ss`）是一个「手写 skills 同步与管理」工具：把你的手写 skills 和 `skill-lock.json`
统一放在一个 git 仓库里，从而在**每台设备上都保持完全一致的 skills 环境**。

## 仓库结构

```
<你的 skills 仓库>/
├── skills/                 # 你手写的 skills
│   └── <skill-name>/SKILL.md
├── skill-lock.json         # 系统技能锁文件（通过软链接同步）
└── SKILLS-GUIDE.md         # 本使用指南
```

## 快速开始

### 1. 初始化（首次 / 新设备）

```bash
cd <你的 skills 仓库>
ss setup
```

- 若当前目录已在 git 项目内，直接复用该仓库；
- 否则可执行 `ss setup --git <仓库地址>` 自动克隆一个仓库；
- 自动创建 `skills/` 目录、生成本指南、预置内置技能，
  并把本地的 `~/.agents/.skill-lock.json` 拷贝进仓库建立软链接，全程无需手动操作。

### 2. 日常同步

```bash
ss sync            # 让 ~/.agents/.skill-lock.json 软链接到本仓库
ss sync --restore  # 取消软链接，恢复为普通文件
```

### 3. 安装 / 列出 skills

```bash
ss install             # 安装 skills/ 下所有手写 skill
ss install <name>      # 安装指定 skill
ss install --dry-run   # 预览：只列不装
ss list                # 列出所有手写 skill
```

## 添加一个新的手写 skill

```bash
mkdir -p skills/my-skill
# 编写 skills/my-skill/SKILL.md（含 frontmatter：name、description）
ss install my-skill        # 安装到当前设备
git add .
git commit -m "feat: 新增 my-skill"
git push                   # 推送到远端，其他设备 pull 即可同步
```

## 其他设备 / 新机器恢复

```bash
git clone <你的 skills 仓库地址>
cd <你的 skills 仓库>
ss setup
```

一条命令即可自动恢复 `skills/`、`skill-lock.json` 软链接，并安装所有手写 skill。

## 备注

- `skill-lock.json` 可能包含本地路径等敏感信息，请保持仓库**私有**。
- 软链接在 macOS / Linux 原生可用；Windows 需要管理员权限或开发者模式。
- `ss install` 内部调用 `npx skills add <绝对路径>`。