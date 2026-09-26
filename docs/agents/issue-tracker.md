# Issue tracker: Jira

Issues and specs for this repo live in the Procyon Jira project **`QI`** (https://procyoncreative.atlassian.net). Use the `procyon_atlassian` MCP server (`mcp__procyon_atlassian__*`, registered in `.mcp.json`) for all operations, with `cloudId` `procyoncreative.atlassian.net`. The `/jira-ticket` skill wraps creation and editing in the team's house style.

Project setup, auth, and workflow rules (branch naming, one ticket per PR, required fields) are in [`docs/jira.md`](../jira.md). Read it before creating a ticket.

## Conventions

- **Create an issue**: `createJiraIssue` with `projectKey: "QI"`. Every ticket needs an hours estimate and Acceptance Criteria that include the line **"Use Red/Green TDD"**.
- **Read an issue**: `getJiraIssue` with the `QI-NNN` key; comments come back with the issue.
- **List issues**: `searchJiraIssuesUsingJql`, e.g. `project = QI AND statusCategory != Done ORDER BY created DESC`, adding `AND labels = "<label>"` to filter by triage label.
- **Comment on an issue**: `addCommentToJiraIssue`.
- **Apply / remove labels**: `editJiraIssue` on the `labels` field (send the full resulting label list).
- **Close**: `getTransitionsForJiraIssue`, then `transitionJiraIssue` to `Done` (or the workflow's won't-do resolution), with a comment explaining why.

Don't transition tickets to QA or Done for merged work by hand: `.github/workflows/jira.yml` does that when a PR opens or merges.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a Jira issue in `QI`.

## When a skill says "fetch the relevant ticket"

Run `getJiraIssue` with the `QI-NNN` key. The current branch name starts with it (`QI-NNN-short-description`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Epic with **child** issues as tickets.

- **Map**: an Epic labeled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue whose `parent` is the map Epic. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: a Jira `Blocks` issue link (`createIssueLink`; list types with `getIssueLinkTypes`). A ticket is unblocked when every issue that blocks it is Done.
- **Frontier query**: `searchJiraIssuesUsingJql` with `parent = <map key> AND statusCategory != Done AND assignee IS EMPTY ORDER BY rank`, then drop any with an open blocker; first in map order wins.
- **Claim**: `editJiraIssue` setting the assignee to the current user (`atlassianUserInfo`), the session's first write.
- **Resolve**: `addCommentToJiraIssue` with the answer, transition to `Done`, then append a context pointer (gist + key) to the map's Decisions-so-far.
