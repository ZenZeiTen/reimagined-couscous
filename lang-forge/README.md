# lang-forge

A Claude skill for synthesizing and developing new programming languages end-to-end — from intent capture through formal spec, grammar, semantics, implementation scaffold, and example programs.

Designed for PL designers and CS researchers. Supports GPLs and DSLs. Draws from the full C-era-to-present language corpus.

---

## What it does

| Stage | Output |
|---|---|
| 1 — Intent & Scope | GPL vs DSL recommendation + paradigm/type/memory/runtime elicitation |
| 2 — Language Spec | Name, philosophy, influence map, all core features |
| 3 — Formal Grammar | EBNF or PEG, complexity-determined; operator precedence table |
| 4 — Formal Semantics | Operational/denotational + typing judgments + Progress/Preservation |
| 5 — Implementation Scaffold | Lexer, AST, parser, typechecker, evaluator, REPL in Python/Rust/JS |
| 6 — Example Programs | 5–6 annotated programs in the new language |
| 7 — Iterative Refinement | Blast-radius tracking and consistent propagation across all stages |

---

## Installation

### 1. Verify integrity

Before installing, verify the SKILL.md checksum against `checksums.sha256`:

```bash
# Clone or download the repository, then:
sha256sum lang-forge/SKILL.md

# Compare against:
cat checksums.sha256
```

If checksums do not match, do not install. See [SECURITY.md](SECURITY.md) to report a discrepancy.

### 2. Install

Copy the `lang-forge/` directory to your Claude skills folder, or install the `.skill` file if available via your Claude interface.

### 3. Verify triggering

Test with a prompt such as:

> "I want to design a statically typed language inspired by Rust and Haskell, targeting a research VM."

Claude should automatically consult this skill and begin Stage 1.

---

## Security

This skill processes user-provided text as language design data only. It contains explicit defenses against prompt injection via user inputs. See [SECURITY.md](SECURITY.md) for the full policy, vulnerability reporting, and integrity verification procedures.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributing

Pull requests welcome. See branch protection rules: all changes to `lang-forge/SKILL.md` require review by a CODEOWNER before merge. Checksum must be regenerated and committed alongside any SKILL.md change.

```bash
sha256sum lang-forge/SKILL.md > checksums.sha256
```
