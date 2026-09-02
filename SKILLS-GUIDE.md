# skills-skills 使用指南

> **English**: [SKILLS-GUIDE.en.md](SKILLS-GUIDE.en.md)

skills-skills（`ss`）是一个「手写 skills 同步与管理」工具：把你的手写 skills 和 `skill-lock.json`
统一放在一个 git 仓库里，从而在**每台设备上都保持完全一致的 skills 环境**。

## 仓库结构

```
<你的 skills 仓库>/
├── skills/                 # 你手写的 skills
│   └── <skill-name>/SKILL.md
├── skill-lock.json         # 系统技能锁文件（仓库内真实文件，受版本控制）
└── SKILLS-GUIDE.md         # 本使用指南
```

本机相关目录：

```
~/.agents/.skill-lock.json              本机生效的锁文件（真实文件）
~/.config/skills-skills/skill-sync-repo/  仓库的统一 clone 目录（也是仓库根）
```

## 快速开始

### 1. 初始化（每台设备执行一次）

```bash
ss init <你的仓库地址>
# 兼容旧版：ss setup 等价于 ss init
```

- 仓库会 clone 到统一目录 `~/.config/skills-skills/skill-sync-repo`（重复执行幂等）；
- 自动创建 `skills/` 目录、生成本指南、预置内置技能，
  并同步 `skill-lock.json` 到本机，全程无需手动操作。

### 2. 日常同步

```bash
ss push     # 本机环境有改动时：本地 lock 写入仓库（随后 git commit / push）
ss push -r  # 一步到位：暂存全部变更→列出清单→确认→提交推送
ss pull     # 其他设备有更新时：仓库 lock 写回本地
ss diff     # 查看本地与仓库的差异
ss merge    # 自动三方合并（冲突时加 --ours 或 --theirs 强制取一侧）
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
ss init <你的仓库地址>
ss pull
ss install
```

一条命令即可自动恢复 `skills/`、`skill-lock.json`，并安装所有手写 skill。

## 备注

- `skill-lock.json` 可能包含本地路径等敏感信息，请保持仓库**私有**。
- `ss init` 会先检查系统依赖：自动检测 `git` 与 `npx skills` 是否可用，缺失时给出安装指引。
- `ss install` 内部调用 `npx skills add <绝对路径>`。