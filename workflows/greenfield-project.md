# Workflow: Greenfield project (library / tool)

## Loop

A new repo or subsystem from idea to shippable v0.1 — one pass, bounded by a plan.

## Trigger

**Event:** User describes a new project, tool, or architectural subsystem with no existing code flow to extend.

**Not this workflow:** bounded change to existing code (use shorter in-chat design + implement), bug fix (diagnosing-bugs), huge foggy multi-month effort (wayfinder first).

## Phases (strict order)

```
research → grill → design → [user gate] → plan → SDD execute → verify → ship
```

### 1. Research (AFK, background agent)

**Skill:** `/research`

**Output:** `docs/research/YYYY-MM-DD-<topic>.md` with primary-source citations

**Questions answered before any design:**

- Does a product already do this?
- What are the framework extension APIs?
- Build vs contribute upstream?

**Stop condition:** Research doc written. Do not design until this exists for architectural work.

### 2. Grill (HITL or stateless)

**Skill:** `/grill-me` (no codebase) or `/grill-with-docs` (existing codebase)

**Output:** Decisions resolved; for architectural path → design spec

**One question at a time.** Agent recommends an answer; user confirms or overrides.

### 3. Design (agent writes, user approves)

**Skill:** brainstorming (architectural path)

**Output:** `docs/design.md` + link to research

**Hard gate:** User approves design before plan or code. No implementation skill until approval.

### 4. Plan (agent writes)

**Skill:** writing-plans

**Output:** `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

**Hard gate:** User may review plan; agent does not write product code until plan exists.

### 5. Execute (AFK, bounded)

**Skill:** subagent-driven-development

**Workspace:** `.superpowers/sdd/<plan-basename>/progress.md` ledger

**Rules:**

- One implementer subagent per plan task
- Task reviewer after each task
- Continuous execution until all plan tasks complete
- **Stop only when:** plan done, or destructive/security/external/broken-plan stop conditions
- Do not ask user between tasks
- Do not skip red/green TDD steps in plan
- Do not inline-execute tasks unless user explicitly chooses executing-plans over SDD

**Forbidden during execute:** new research, redesign, scope expansion without plan amendment

### 6. Verify

**Skill:** verification-before-completion (if available)

**Checks:**

- All plan tasks ledgered complete
- `pnpm test` (or equivalent) passes
- Success criteria from design.md explicitly checked
- Docs committed

### 7. Ship checkpoint (HITL brief)

**Skill:** finishing-a-development-branch

**Brief presents:**

- What shipped (commits, packages)
- What was deferred (ledger rulings, parked findings)
- Success criteria: met / not met
- One decision: merge, PR, or continue

**Push right:** User sees summary + links, not raw diffs.

## Nested product loop (qa-instructions specific)

After this workflow completes, the **product** runs on its own schedule:

```
Trigger: CI or `pnpm test` in consumer project
  → unmodified Playwright tests
  → qa-instructions reporter writes qa-runs/
  → `qa-instructions render` → qa-steps-out/
  → human pastes to ticket (checkpoint: optional review of steps)
```

This is CI-driven, not agent-driven. No unbounded agent work.

## Anti-patterns (this project violated)

| Violation                                    | Correct phase               |
| -------------------------------------------- | --------------------------- |
| Scaffold code before plan                    | After phase 4               |
| Web search instead of research skill         | Phase 1                     |
| Ask user "which execution approach?"         | SDD is default; just run it |
| SDD tasks 1–2 then inline 3–9                | Phase 5 throughout          |
| Explain instead of execute when user says go | Phase 5                     |
| loop-me / workflow spec never written        | Before or during phase 2–3  |

## Definition of done

- Plan tasks all `complete` in SDD ledger
- Tests pass
- Design success criteria checked (or explicitly deferred with ruling)
- Research + design + plan docs committed
- User receives ship brief (phase 7) — **then agent stops**
