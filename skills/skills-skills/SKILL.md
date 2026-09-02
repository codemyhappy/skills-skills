---
name: skills-skills
description: 手写 skills 环境管理工具 ss 的使用指南。当用户想安装/列出/同步 skills、需要管理本机 ~/.agents/.skill-lock.json 或 skills 仓库、或询问 ss init/sync/diff/merge/pull/push/status/config 等命令用法时，使用此 skill
---

# skills-skills（ss）使用指南

`ss`（skills-skills）是个人手写 skills 环境管理 CLI：把手写 skills 与 `skill-lock.json` 统一放进你自己的 git 仓库，保证**每台设备 skills 环境一致**。

## 核心概念

- 本地真实锁文件：`~/.agents/.skill-lock.json`（AI 系统实际读写）
- 仓库真实锁文件：`<repo>/skill-lock.json`（受 git 版本控制）
- **不再使用软链接**；仓库根固定为 `~/.config/skills-skills/skill-sync-repo`（clone 直达，即仓库根）
- 三方合并基线：`~/.config/skills-skills/last-sync.json`
- 配置：`~/.config/skills-skills/config.json`（只存 `remoteUrl` 与 `lang`）

```
本地 skill-lock.json  ⇄  仓库 skill-lock.json  ⇄  git 远端
      ss 负责左侧          git commit/pull/push 负责右侧
```

## 命令速查

| 命令 | 作用 |
|---|---|
| `ss init <url>`（别名 `setup`） | 初始化：clone 到统一目录 sync-repo（幂等复用，地址不匹配则拒绝），随后同步 + 安装 |
| `ss sync` | 自动三方合并本地与仓库的 lock（等价 `ss merge`） |
| `ss diff [--json]` | key 级差异：`+` 仅本地 / `-` 仅仓库 / `M` 均改不同 |
| `ss merge [--ours\|--theirs]` | 三方合并；冲突默认中止，可用一侧强制解决 |
| `ss pull` | 仓库 → 本地（覆盖前时间戳备份） |
| `ss push [-r]` | 本地 → 仓库（覆盖前自动备份）；`-r` 暂存全部变更、列出清单并确认后提交到远端 |
| `ss status` | 同步状态摘要 |
| `ss config [--lang <zh\|en>]` | 查看或修改配置（输出语言中英切换） |
| `ss install [name]` / `ss list` | 安装技能到本机 / 列出技能（含 lock 里的技能） |

## 触发时机

- 用户想安装或卸载某个手写 skill → 用 `ss install <name>`；不确定名字先 `ss list`
- 本机 skills 环境改了（skill-lock.json 有变化），想同步给其他设备：
  ```
  ss push           # 本地 → 仓库，然后按提示手动 git commit/push
  ss push -r        # 一步到位：本地 → 仓库 → 列出改动并确认后自动提交推送到远端
  ```
- 其他设备更新过，本机要拉取：
  ```
  cd ~/.config/skills-skills/skill-sync-repo && git pull   # 更新仓库
  ss pull                                                  # 仓库 → 本地
  ```
- 不确定本地与仓库差异：`ss diff` 查看；想智能合并：`ss merge`（冲突时按提示加 `--ours` 或 `--theirs`）
- 新设备 / 新仓库初始化：`ss init <仓库地址>`（重复执行幂等复用，可直接用于恢复环境）
- 输出语言切换：`ss config --lang=en` / `ss config --lang=zh`

## 注意事项

- `ss install` 内部调用 `npx skills add <绝对路径>`（依赖 OpenCLI 生态的 `npx`）
- `installedAt` / `updatedAt` 时间戳字段在 diff/merge 中自动忽略，避免噪音
- 所有覆盖写入前都会在 `~/.agents/` 生成时间戳备份：`skill-lock-YYYY-MM-DD-HHmmss.json.ss.bak`
- 仓库根目录在 `~/.config/skills-skills/skill-sync-repo`，不要在其他目录另建副本
- 报错时优先按提示执行可操作的下一步（如 `ss merge --theirs`、`git remote set-url origin <正确地址>`）
