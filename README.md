# skills-skills 🧰

[![npm version](https://img.shields.io/npm/v/skills-skills.svg)](https://www.npmjs.com/package/skills-skills)
[![npm downloads](https://img.shields.io/npm/dm/skills-skills.svg)](https://www.npmjs.com/package/skills-skills)
[![License: MIT](https://img.shields.io/npm/l/skills-skills.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/codemyhappy/skills-skills.svg)](https://github.com/codemyhappy/skills-skills)

**[GitHub](https://github.com/codemyhappy/skills-skills) · [npm](https://www.npmjs.com/package/skills-skills)**

The **skills-skills** (`ss`) CLI — personal skills manager. **Write once, sync everywhere, version-controlled**.

Manage your handwritten skills and `skill-lock.json` in one place, so every device has an identical skills environment.

> **中文文档**: [README.zh-CN.md](README.zh-CN.md)

---

## Core Idea

1. **Your own skills repo** — skills live in the `skills/` directory of a git repo *you* define. `ss init <url>` clones the repo directly into the unified per-device location `~/.config/skills-skills/skill-sync-repo` (idempotent: re-uses an existing clone), then creates `skills/` and pre-seeds the default `skills-skills` skill.
2. **skill-lock.json as two real files** — a real file on this device (`~/.agents/.skill-lock.json`) and a version-controlled copy in the repo (`<repo>/skill-lock.json`). `ss` keeps them in sync with git-style `diff` / `merge` / `pull` / `push` three-way merge.

```
   ss push                     git push
local ────────►  <repo>/skill-lock.json ────────►  remote
local ◄────────  <repo>/skill-lock.json ◄────────  remote
   ss pull                     git pull
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
# Clone the given repo URL directly into the unified per-device repo dir
ss init <your-repo-url>
```

> All `ss` commands respect the output language saved in `~/.config/skills-skills/config.json` (`lang`, defaults to `zh`). Switch any time with `ss config --lang en` (or `zh`). No interactive prompt in `ss init`.
>
> Before cloning or overwriting anything, `ss init` runs read-only pre-checks: system dependencies (`git` / `npx`), whether the target dir already exists & is a git repo, whether a previous init is recorded, and whether the requested URL **matches** the existing repo's `origin` (URL normalization ignores `.git` suffix, trailing slash, `.git`-less, SSH vs HTTPS `host/path` forms and `file://` — but NOT host). Mismatches are refused with an actionable hint.

Daily use:

| Command | Description |
|---------|-------------|
| `ss init [url]` | Initialize: clone `url` directly into `~/.config/skills-skills/skill-sync-repo` (idempotent), then sync & install. Alias: `ss setup` (legacy compat) |
| `ss diff [--json]` | Compare local vs repo `skill-lock.json` (per-skill key semantics) |
| `ss merge [--ours\|--theirs]` | Three-way merge local & repo (base = last sync); conflict aborts unless a side is forced |
| `ss pull` | Copy repo `skill-lock.json` to local (auto backup before overwrite) |
| `ss push [--remote]` | Copy local to repo (auto backup before overwrite); `--remote` stages **all** repo changes, lists them, asks for confirmation, then `git add -A` + `commit` + `push` |
| `ss sync` | Auto three-way merge (same as `ss merge`) |
| `ss status` | Show sync state summary |
| `ss config [--lang <zh\|en>]` | Show or modify local config (output language, etc.) |
| `ss install [<name>]` | Install all (or a specific) handwritten skill |
| `ss list` | List all handwritten skills |
| `ss -V` | Print version |

> `ss install` internally runs `npx skills add <absolute-path>`.
> Time-stamp fields (`installedAt` / `updatedAt`) are ignored in diff/merge to avoid noise from every `install`.

---

## How three-way merge works

The merge base is the last synced snapshot stored in `~/.config/skills-skills/last-sync.json`.

Per skill key:

| base | local | repo | result |
|---|---|---|---|
| – | added | – | take local (kept) |
| – | – | added | take repo (kept) |
| exists | deleted | exists | delete |
| exists | exists | deleted | delete |
| exists | changed | unchanged | take repo |
| exists | unchanged | changed | take local |
| exists | changed | changed | **conflict** |
| – | added | added different | **conflict** |

On conflict `ss merge` writes nothing and lists the keys — resolve with `--ours` / `--theirs` or edit manually.

---

## Project Structure

```
skills-skills/
├── ss / skills-skills     # CLI commands
├── skills/                # handwritten skills
│   └── <name>/SKILL.md
├── src/                   # CLI source (TypeScript + tsup)
└── package.json

~/.config/skills-skills/
├── config.json            # remoteUrl
├── last-sync.json         # three-way merge base
└── skill-sync-repo/       # the repo itself — unified clone destination for `ss init <url>`

~/.agents/.skill-lock.json # local real lock file handled by this tool
```

---

## Development & Debug

```bash
pnpm dev     # watch build (tsup --watch)
```

Press F5 → select "Debug ss (tsx)" in VS Code to debug TypeScript directly; built-in launch configs for sync / install / list.

---

## Notes

- `skill-lock.json` contains local paths — keep this repo **private**.
- `ss init` checks the environment first: it verifies `git` and `npx skills` are available and prints install hints if missing.
- Depends on `npx skills` (from the OpenCLI ecosystem) — make sure it's installed.