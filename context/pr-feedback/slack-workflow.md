# PR Feedback Slack Workflow

See also: [../overview.md](../overview.md), [../architecture.md](../architecture.md), [../glossary.md](../glossary.md)

## Current contract

- Trigger on GitHub `pull_request.closed`.
- Process both merged PRs and PRs closed without merge.
- Identify participants from the PR author, review submissions, PR conversation comments, and inline review comments.
- Exclude bots and deduplicate by GitHub login.
- Map recipients through `GITHUB_TO_SLACK_JSON`.
- Send one Slack DM per mapped participant using `SLACK_BOT_TOKEN` and `SLACK_WORKFLOW_URL`.
- Skip unmapped participants and report their GitHub logins in workflow output.
- Store responses only in Slack workflow form responses.

## Implemented code

- `src/pr-feedback/participants.ts` exports `collectParticipants(...)`.
- The module accepts the closed PR event plus review/comment inputs.
- Output is a deduplicated participant list keyed by GitHub login.
- Each returned participant includes one or more roles: `author`, `reviewer`, `commenter`.
- Bots are excluded when `user.type === 'Bot'` or the login ends with `[bot]`.
- `src/pr-feedback/slack-mapping.ts` exports `parseGitHubToSlackMap(...)` and `resolveSlackRecipients(...)`.
- Mapping parsing fails fast when `GITHUB_TO_SLACK_JSON` is malformed, not an object, or contains empty/non-string Slack IDs.
- Recipient resolution preserves participant order, returns mapped participants with `slackUserId`, and emits a missing-user report with mapped/unmapped counts plus ordered unmapped logins.
- `src/pr-feedback/slack-delivery.ts` exports `formatFeedbackRequestMessage(...)`, `createSlackApiClient(...)`, and `sendFeedbackRequests(...)`.
- Delivery opens or reuses a DM via `conversations.open`, posts the feedback request via `chat.postMessage`, and returns structured `sent` plus `failed` results per mapped participant.
- The DM text includes PR number, title, URL, closure state, participant roles, the Slack workflow link, and instructions to paste the PR number or URL into the form reference field.
- `src/pr-feedback/action.ts` exports the GitHub client, the end-to-end closed-PR runner, and the environment-driven action entrypoint used by the workflow.
- The action fetches PR reviews, issue comments, and review comments from GitHub, then logs participant/mapped/unmapped/sent/failed counts and writes the same summary to `GITHUB_OUTPUT` when available.
- `.github/workflows/pr-feedback-slack.yml` runs on `pull_request.closed`, builds the repo, and executes `node dist/src/pr-feedback/action.js` with `GITHUB_TOKEN`, `GITHUB_TO_SLACK_JSON`, `SLACK_BOT_TOKEN`, and `SLACK_WORKFLOW_URL`.
- Targeted tests live in `test/pr-feedback/participants.test.ts`, `test/pr-feedback/slack-mapping.test.ts`, `test/pr-feedback/slack-delivery.test.ts`, and `test/pr-feedback/action.test.ts`.

## Required operator inputs

- `SLACK_BOT_TOKEN`
- `SLACK_WORKFLOW_URL`
- `GITHUB_TO_SLACK_JSON`

## Operator expectations

- Maintain the GitHub-to-Slack mapping as team membership changes.
- Keep the Slack form short and link-triggered.
- Use Slack exports/downloads for response review in v1.
- Review workflow logs or outputs for unmapped logins and per-user Slack delivery failures after test runs or incidents.
