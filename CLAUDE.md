# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## What this repository is

`reimagined-couscous` distributes **lang-forge**, a Claude Agent Skill that synthesizes new
programming languages end-to-end — intent capture → formal spec → grammar → formal semantics →
implementation scaffold → example programs → iterative refinement.

This is a **documentation/prompt-artifact repository, not a software project**. There is no
application code, no build system, no dependency manifest, no test suite, and no CI. The
deliverable is a single Markdown file (`SKILL.md`) plus the integrity and governance scaffolding
that lets a third party trust it.

Licensed MIT, © 2026 Nusalexia Trans (PT Inscriptia Multikreasi Nusatama).

## Repository layout — read this before editing anything

The tracked repository root and the project layout are **not the same thing**:

```
/ (git root — what you see on checkout)
├── README.md               # one-line stub description
├── CLAUDE.md               # this file
└── lang-forge-github.zip   # the ENTIRE actual project, committed as a binary blob
```

Unzipping `lang-forge-github.zip` yields the real project tree:

```
lang-forge-github/
├── lang-forge/
│   └── SKILL.md            # THE deliverable — the skill itself
├── README.md               # real project README (install + usage)
├── SECURITY.md             # threat model, disclosure policy, branch protection
├── LICENSE                 # MIT
├── checksums.sha256        # SHA-256 of lang-forge/SKILL.md — must stay in sync
├── verify.sh               # integrity checker; run from the extracted root
└── .github/
    ├── CODEOWNERS
    └── ISSUE_TEMPLATE/security_report.md
```

**Consequence:** editing the skill means editing a file inside a zip. Every one of the repo's own
documented workflows (checksum verification, CODEOWNERS review, branch protection on
`lang-forge/SKILL.md`) assumes those paths exist as tracked files — but at the git level, only the
zip is versioned. Diffs are opaque, and path-based CODEOWNERS rules cannot actually match.

If asked to change the skill, do not silently work around this. Extract, edit, re-checksum,
repack — and surface the tradeoff (see *Known gaps* below).

## Core workflows

### Extract and inspect

```bash
unzip -o lang-forge-github.zip -d /tmp/lf && cd /tmp/lf/lang-forge-github
```

Work in a scratch directory, never in the repo root — extracting in place would litter the tree
with untracked files that duplicate the zip's contents.

### Verify integrity (always do this before and after editing)

```bash
bash verify.sh          # from the extracted root
```

It compares `sha256sum lang-forge/SKILL.md` against `checksums.sha256`, prints both hashes, and
exits non-zero on mismatch. As of the current commit it **passes**
(`72f0cbd1b2423f1078d0355c8a9fcb7a8445a78325dfef237ac83057e5574899`).

### The checksum invariant

**Any change to `lang-forge/SKILL.md` must be accompanied by a regenerated checksum in the same
commit.** This is stated in both `README.md` and `SECURITY.md` and is the repo's single most
important rule — a stale checksum makes a legitimate release indistinguishable from tampering.

```bash
sha256sum lang-forge/SKILL.md > checksums.sha256
bash verify.sh                                      # confirm PASS
```

### Repack

```bash
cd /tmp/lf && zip -r lang-forge-github.zip lang-forge-github
cp lang-forge-github.zip /home/user/reimagined-couscous/
```

Preserve the top-level `lang-forge-github/` directory inside the archive — `verify.sh`, the
README, and the install instructions all assume relative paths from that root.

## Editing SKILL.md — conventions to preserve

`SKILL.md` is a Claude Agent Skill, so its shape is load-bearing, not stylistic.

- **YAML frontmatter** carries `name` and `description`. The description is the trigger surface:
  it enumerates concrete user phrasings, includes casual forms ("I want a language that does X"),
  and closes with *"When in doubt, trigger."* Keep it broad and example-rich; narrowing it silently
  changes when the skill fires.
- **The seven-stage pipeline is the skill's spine.** Stages are sequential, each ends by offering
  the user a revise-or-proceed choice, and mid-pipeline entry requires back-filling upstream
  context rather than skipping it. Do not renumber or collapse stages casually — Stage 7's
  blast-radius table references stage numbers directly.
- **Decision tables over prose.** Recommendations (GPL vs DSL, EBNF vs PEG, operational vs
  denotational, host language choice) are expressed as signal→recommendation tables. Match that
  form when adding guidance.
- **Formal notation.** Unicode math inline (`Γ ⊢ e : τ`, `→`, `⇓`, `⟦·⟧`); ASCII-art rule boxes
  for inference rules. Grammar blocks are fenced `ebnf` or `peg`; example programs are fenced with
  the invented language's own name.
- **Influence citations are prose, never bullet lists** — an explicit output-formatting rule.
- **The Security section is a functional part of the skill**, not boilerplate. It instructs the
  model to treat all user-supplied grammar/code/spec text as untrusted data, to halt and surface
  suspected injection attempts, never to execute generated scaffold code, and never to fetch
  external resources. Preserve these guarantees; `SECURITY.md` documents them as the product's
  security posture, so weakening one desynchronizes the other.

Any structural edit to `SKILL.md` likely needs mirrored updates in the project `README.md` (which
restates the stage table) and `SECURITY.md` (which restates the injection defenses).

## Git and contribution workflow

- Branch `main` is the default. Per `SECURITY.md`, `main` expects CODEOWNER approval for
  `SKILL.md`/`checksums.sha256` changes and forbids force-pushes.
- Push feature work to the designated branch, then open a **draft PR**.
- Commit the regenerated checksum together with the skill change — never as a follow-up commit.
- Because the payload is a zip, write commit messages that describe the *content* change; the diff
  itself will show only a binary blob replacement.

## Known gaps

Worth flagging when relevant; don't fix unprompted:

- **Zip-as-payload.** Defeats meaningful diffs and review, and makes the documented path-based
  branch protection and CODEOWNERS rules unenforceable. Unpacking the archive into tracked files
  at the repo root would make every documented workflow real.
- **`.github/CODEOWNERS` contains the literal placeholder `@your-github-username`** on all three
  rules. It matches no one, so the review requirement is currently inert.
- **Root `README.md` is a one-line stub** that neither mentions the zip nor points at the real
  README inside it. A first-time visitor gets no install path.
- **No CI.** `.github/` holds only CODEOWNERS and an issue template — no workflows. Checksum
  verification is manual and unenforced; `verify.sh` would be a natural single-step CI gate.
- **Version support policy** in `SECURITY.md` says "latest `main` only", but the repo has no tags
  or releases yet.
