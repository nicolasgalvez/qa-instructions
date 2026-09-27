# Jira Integration

## Project

- **Key:** `QI`
- **Board:** https://procyoncreative.atlassian.net/jira/software/c/projects/QI/boards
- **REST API base:** https://procyoncreative.atlassian.net/rest/api/3

## MCP Server

- **Server:** `procyon_atlassian` (Streamable HTTP) — registered in `.mcp.json`
- **URL:** `https://mcp.atlassian.com/v1/mcp`
- Tools are available as `mcp__procyon_atlassian__*` once Claude Code re-loads the project.

## Auth

- **Email:** set as the `JIRA_EMAIL` repo secret and used by MCP
- **API token:** generate at https://id.atlassian.com/manage-profile/security/api-tokens
- The token is required as the `JIRA_API_TOKEN` repo secret. Do not commit it. For local scripts, source it from `.env` (which is gitignored).

## Workflow Rules

- **No work without a ticket.** Every branch must reference a `QI-NNN` Jira ticket. If one doesn't exist, create it first via `/jira-ticket create` (or in the Jira UI) before opening the branch.
- **Branch name format:** `QI-NNN-short-description` (e.g. `QI-42-add-login-form`).
- **One ticket = one branch = one PR.** Work locally (any number of commits) until _all_ of the ticket's acceptance criteria are met and verified, then push once and open the single PR. Never open a PR per unit of work, and never reuse a ticket key for a follow-up branch after its PR merged — post-merge discoveries get a **new ticket**.
- **Ticket requirements:**
  - **Hours estimate** (Story Points or Original Estimate field — pick one and be consistent).
  - **Acceptance Criteria** including the mandatory line: **"Use Red/Green TDD"**.
- **PR opens → ticket moves to QA.** Handled automatically by `.github/workflows/jira.yml`.
- **PR merges → ticket moves to Done.** Same workflow.

## CI Workflow

The `.github/workflows/jira.yml` action:

1. Syncs ticket metadata onto the PR (comment, labels) on every PR open/reopen, for every ticket referenced in the branch, title, commits, or body.
2. Transitions to `QA` when a PR is opened or reopened.
3. Transitions to `Done` when a PR is merged.

Transitions apply only to the ticket named in the branch (`QI-NNN-…`). Other tickets mentioned in the PR get the comment but keep their status.

## Quick Reference

- Create / edit a ticket: `/jira-ticket`
- Move current branch's ticket to QA manually: comment `/jira-qa` on the PR (if `jira-action-man` rules are configured) or use the MCP.
