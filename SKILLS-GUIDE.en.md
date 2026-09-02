# skills-skills Usage Guide

**skills-skills** (`ss`) is a tool for syncing & managing your handwritten skills: put your handwritten skills and `skill-lock.json` into one git repo, so **every device has an identical skills environment**.

## Repo Layout

```
<your skills repo>/
├── skills/                 # your handwritten skills
│   └── <skill-name>/SKILL.md
├── skill-lock.json         # system skill lock file (real file, version-controlled)
└── SKILLS-GUIDE.md         # this guide
```

Local directories on your machine:

```
~/.agents/.skill-lock.json                   the lock file in effect on this machine (real file)
~/.config/skills-skills/skill-sync-repo/     unified clone directory (also the repo root)
```

## Quick Start

### 1. Init (run once per device)

```bash
ss init <your-repo-url>
# legacy alias: ss setup
```

- The repo is cloned into `~/.config/skills-skills/skill-sync-repo` (idempotent on re-run);
- `skills/`, this guide, and the default skill are created automatically,
  and `skill-lock.json` is synced to this machine — no manual steps needed.

### 2. Daily sync

```bash
ss push     # after local changes: local lock → repo (then git commit / push)
ss push -r  # one-shot: stage all → list → confirm → commit & push
ss pull     # after other devices updated: repo lock → local
ss diff     # show differences between local and repo
ss merge    # auto three-way merge (add --ours or --theirs to force one side on conflict)
```

### 3. Install / list skills

```bash
ss install             # install all handwritten skills under skills/
ss install <name>      # install a specific skill
ss install --dry-run   # preview: list only, no install
ss list                # list all handwritten skills
```

## Add a New Handwritten Skill

```bash
mkdir -p skills/my-skill
# write skills/my-skill/SKILL.md (frontmatter: name, description)
ss install my-skill        # install on this device
git add .
git commit -m "feat: add my-skill"
git push                   # push to remote; other devices pull to sync
```

## Restore on Another Device / New Machine

```bash
ss init <your-repo-url>
ss pull
ss install
```

One command restores `skills/` and `skill-lock.json`, then installs all handwritten skills.

## Notes

- `skill-lock.json` may contain local paths — keep this repo **private**.
- `ss init` checks system dependencies first: verifies `git` and `npx` are available and prints install hints if missing.
- `ss install` internally runs `npx skills add <absolute-path>`.