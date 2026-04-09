# Patterns

## Contract-first delivery

- Define repo-level workflow behavior, participant scope, secret names, and operator expectations in documentation before implementing runtime code.
- Resolve scope ambiguity in the contract rather than in later workflow logic.

## Participant handling

- Build the recipient set from PR author, reviewers, and commenters only.
- Exclude bots.
- Deduplicate by GitHub login before Slack mapping.
- Preserve discovered roles per login so later workflow steps can reason about why a user was included.

## Minimal TypeScript task scaffolding

- Use a root `package.json` with `build` and `test` scripts when a planned implementation task requires executable TypeScript and targeted tests.
- Keep early scaffolding small: compile with `tsc`, run focused tests with Node's built-in test runner.

## Mapping and reporting

- Treat missing Slack mappings as skip-and-report cases, not feature failure by default.
- Keep invalid required secrets as fail-fast configuration errors.

## Slack delivery

- Format the PR feedback DM deterministically from PR metadata, recipient roles, and the workflow URL.
- Use an injectable Slack client boundary so delivery flow can be tested with mocks while the runtime implementation calls Slack Web API endpoints.
- Continue sending to remaining recipients when one DM fails, and return structured per-user failures for workflow logging.

## Workflow orchestration

- Keep the GitHub Action runtime entrypoint thin: read environment/event inputs, call GitHub for PR discussion data, then compose participant collection, mapping, and Slack delivery modules.
- Treat missing required secrets or invalid configuration as fail-fast errors.
- Expose mapped/unmapped and sent/failed counts through both workflow logs and `GITHUB_OUTPUT` for downstream action inspection.

## Response storage

- Use a Slack link-triggered workflow form for feedback collection.
- Keep Slack as the sole response store in v1.
