# skills-skills 🧰

The **skills-skills** (`ss`) CLI — personal skills manager. **Write once, sync everywhere, version-controlled**.

Manage your handwritten skills and `skill-lock.json` in one place, so every device has an identical skills environment.

> **中文文档**: [README.zh-CN.md](README.zh-CN.md)

---

## Core Idea

1. **Your own skills repo** — skills live in the `skills/` directory of a git repo *you* define. `ss setup` detects the current git project, or clones the repo URL you provide; it then creates `skills/` and pre-seeds the default `skills-skills` skill.
2. **skill-lock.json via symlink** — symlink `~/.agents/.skill-lock.json` to your repo's `skill-lock.json`. The system reads/writes straight into the repo; commit and other devices pull to sync.

```
~/.agents/.skill-lock.json  --(symlink)-->  <repo>/skill-lock.json
```

---

## Install the CLI

```bash
# requires Node.js >= 18
npm install -g skills-skills   # also provides the `ss` alias
```

---

## Quick Start

```bash
# One-click init: locate/clone your skills repo + symlink + install all handwritten skills
ss setup
```

Daily use:

| Command | Description |
|---------|-------------|
| `ss sync` | Symlink `~/.agents/.skill-lock.json` to this repo |
| `ss sync --restore` | Undo the symlink, restore to a regular file |
| `ss install` | Install all handwritten skills |
| `ss install <name>` | Install a specific skill |
| `ss install --dry-run` | Dry run — list only, do not install |
| `ss list` | List all handwritten skills |
| `ss -V` | Print version |

> `ss install` internally runs `npx skills add <absolute-path>`.

---

## Add a New Handwritten Skill

```bash
# 1. Create a directory under skills/ and write a SKILL.md (with frontmatter)
mkdir -p skills/my-skill

# 2. Install it on the current device
ss install my-skill

# 3. Commit and sync
git add .
git commit -m "feat: add my-skill"
git push
```

Run `ss setup` once on each device to restore the full skills environment.

---

## Project Structure

```
skills-skills/
├── ss / skills-skills     # CLI commands
├── skills/                # handwritten skills
│   └── <name>/SKILL.md
├── skill-lock.json        # synced lock file (symlink target)
├── src/                   # CLI source (TypeScript + tsup)
└── package.json
```

---

## Development & Debug

```bash
pnpm dev     # watch build (tsup --watch)
```

Press F5 → select "Debug ss (tsx)" in VS Code to debug TypeScript directly; built-in launch configs for sync / setup / install / list.

---

## Notes

- `skill-lock.json` contains local paths — keep this repo **private**.
- Symlinks work natively on macOS / Linux; Windows needs admin privileges or developer mode.
- Depends on `npx skills` (from the OpenCLI ecosystem) — make sure it's installed.

