import type { MappedParticipant } from './slack-mapping';

export interface PullRequestContext {
  number: number;
  title: string;
  url: string;
  merged: boolean;
}

export interface SlackApiClient {
  openDirectMessage(slackUserId: string): Promise<{ channelId: string }>;
  postMessage(channelId: string, text: string): Promise<{ ts?: string }>;
}

export interface SlackDeliverySuccess {
  login: string;
  slackUserId: string;
  channelId: string;
  ts?: string;
}

export interface SlackDeliveryFailure {
  login: string;
  slackUserId: string;
  error: string;
}

export interface SlackDeliveryResult {
  sent: SlackDeliverySuccess[];
  failed: SlackDeliveryFailure[];
}

type FetchLike = typeof fetch;

function getClosureLabel(merged: boolean): string {
  return merged ? 'merged' : 'closed without merge';
}

function formatParticipantRoles(roles: string[]): string {
  return roles.join(', ');
}

async function callSlackApi<TResponse extends Record<string, unknown>>(
  fetchImpl: FetchLike,
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetchImpl(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Slack API request failed for ${method}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TResponse & { ok?: boolean; error?: string };

  if (payload.ok !== true) {
    throw new Error(`Slack API request failed for ${method}: ${payload.error ?? 'unknown_error'}`);
  }

  return payload;
}

export function formatFeedbackRequestMessage(
  participant: MappedParticipant,
  pullRequest: PullRequestContext,
  workflowUrl: string,
): string {
  const closureLabel = getClosureLabel(pullRequest.merged);
  const roles = formatParticipantRoles(participant.roles);

  return [
    `PR #${pullRequest.number} was ${closureLabel}: ${pullRequest.title}`,
    pullRequest.url,
    '',
    `You participated in this pull request as: ${roles}.`,
    'Please share your experience using this Slack workflow:',
    workflowUrl,
    '',
    `When the form opens, paste PR #${pullRequest.number} or the PR URL into the reference field.`,
  ].join('\n');
}

export function createSlackApiClient(token: string, fetchImpl: FetchLike = fetch): SlackApiClient {
  return {
    async openDirectMessage(slackUserId: string): Promise<{ channelId: string }> {
      const payload = await callSlackApi<{ channel?: { id?: string } }>(
        fetchImpl,
        token,
        'conversations.open',
        { users: slackUserId },
      );

      const channelId = payload.channel?.id;

      if (!channelId) {
        throw new Error(`Slack API request failed for conversations.open: missing channel id for ${slackUserId}`);
      }

      return { channelId };
    },

    async postMessage(channelId: string, text: string): Promise<{ ts?: string }> {
      const payload = await callSlackApi<{ ts?: string }>(fetchImpl, token, 'chat.postMessage', {
        channel: channelId,
        text,
      });

      return { ts: payload.ts };
    },
  };
}

export async function sendFeedbackRequests(
  slackClient: SlackApiClient,
  recipients: MappedParticipant[],
  pullRequest: PullRequestContext,
  workflowUrl: string,
): Promise<SlackDeliveryResult> {
  const sent: SlackDeliverySuccess[] = [];
  const failed: SlackDeliveryFailure[] = [];

  for (const recipient of recipients) {
    try {
      const { channelId } = await slackClient.openDirectMessage(recipient.slackUserId);
      const text = formatFeedbackRequestMessage(recipient, pullRequest, workflowUrl);
      const { ts } = await slackClient.postMessage(channelId, text);

      sent.push({
        login: recipient.login,
        slackUserId: recipient.slackUserId,
        channelId,
        ts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Slack delivery error';

      failed.push({
        login: recipient.login,
        slackUserId: recipient.slackUserId,
        error: message,
      });
    }
  }

  return { sent, failed };
}
