import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSlackApiClient,
  formatFeedbackRequestMessage,
  sendFeedbackRequests,
} from '../../src/pr-feedback/slack-delivery';
import type { MappedParticipant } from '../../src/pr-feedback/slack-mapping';

test('formats a merged feedback request DM with required PR context', () => {
  const text = formatFeedbackRequestMessage(
    { login: 'author', roles: ['author', 'commenter'], slackUserId: 'U123' },
    {
      number: 42,
      title: 'Improve retry handling',
      url: 'https://github.com/acme/app/pull/42',
      merged: true,
    },
    'https://slack.com/workflows/pr-feedback',
  );

  assert.match(text, /PR #42 was merged: Improve retry handling/);
  assert.match(text, /https:\/\/github.com\/acme\/app\/pull\/42/);
  assert.match(text, /You participated in this pull request as: author, commenter\./);
  assert.match(text, /https:\/\/slack.com\/workflows\/pr-feedback/);
  assert.match(text, /paste PR #42 or the PR URL into the reference field/);
});

test('formats an unmerged feedback request DM with closed-without-merge status', () => {
  const text = formatFeedbackRequestMessage(
    { login: 'reviewer', roles: ['reviewer'], slackUserId: 'U456' },
    {
      number: 7,
      title: 'Experiment branch cleanup',
      url: 'https://github.com/acme/app/pull/7',
      merged: false,
    },
    'https://slack.com/workflows/pr-feedback',
  );

  assert.match(text, /PR #7 was closed without merge: Experiment branch cleanup/);
});

test('sends one DM per mapped participant with opened channels', async () => {
  const openedUsers: string[] = [];
  const postedMessages: Array<{ channelId: string; text: string }> = [];
  const recipients: MappedParticipant[] = [
    { login: 'author', roles: ['author'], slackUserId: 'U123' },
    { login: 'reviewer', roles: ['reviewer'], slackUserId: 'U456' },
  ];

  const result = await sendFeedbackRequests(
    {
      async openDirectMessage(slackUserId) {
        openedUsers.push(slackUserId);
        return { channelId: `D-${slackUserId}` };
      },
      async postMessage(channelId, text) {
        postedMessages.push({ channelId, text });
        return { ts: `ts-${channelId}` };
      },
    },
    recipients,
    {
      number: 100,
      title: 'Ship feedback workflow',
      url: 'https://github.com/acme/app/pull/100',
      merged: true,
    },
    'https://slack.com/workflows/pr-feedback',
  );

  assert.deepEqual(openedUsers, ['U123', 'U456']);
  assert.equal(postedMessages.length, 2);
  assert.equal(postedMessages[0]?.channelId, 'D-U123');
  assert.match(postedMessages[0]?.text ?? '', /PR #100 was merged: Ship feedback workflow/);
  assert.equal(postedMessages[1]?.channelId, 'D-U456');
  assert.deepEqual(result, {
    sent: [
      { login: 'author', slackUserId: 'U123', channelId: 'D-U123', ts: 'ts-D-U123' },
      { login: 'reviewer', slackUserId: 'U456', channelId: 'D-U456', ts: 'ts-D-U456' },
    ],
    failed: [],
  });
});

test('records per-recipient Slack delivery failures and continues', async () => {
  const recipients: MappedParticipant[] = [
    { login: 'author', roles: ['author'], slackUserId: 'U123' },
    { login: 'reviewer', roles: ['reviewer'], slackUserId: 'U456' },
  ];

  const result = await sendFeedbackRequests(
    {
      async openDirectMessage(slackUserId) {
        return { channelId: `D-${slackUserId}` };
      },
      async postMessage(channelId) {
        if (channelId === 'D-U123') {
          throw new Error('Slack API request failed for chat.postMessage: channel_not_found');
        }

        return { ts: `ts-${channelId}` };
      },
    },
    recipients,
    {
      number: 100,
      title: 'Ship feedback workflow',
      url: 'https://github.com/acme/app/pull/100',
      merged: true,
    },
    'https://slack.com/workflows/pr-feedback',
  );

  assert.deepEqual(result, {
    sent: [{ login: 'reviewer', slackUserId: 'U456', channelId: 'D-U456', ts: 'ts-D-U456' }],
    failed: [
      {
        login: 'author',
        slackUserId: 'U123',
        error: 'Slack API request failed for chat.postMessage: channel_not_found',
      },
    ],
  });
});

test('Slack API client opens DMs and posts messages through Slack Web API', async () => {
  const requests: Array<{ url: string; method: string; headers: Headers; body: string }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : '';

    requests.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body,
    });

    if (url.endsWith('/conversations.open')) {
      return new Response(JSON.stringify({ ok: true, channel: { id: 'D123' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ts: '123.456' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createSlackApiClient('xoxb-test-token', fetchMock);
  const { channelId } = await client.openDirectMessage('U123');
  const message = await client.postMessage(channelId, 'hello');

  assert.equal(channelId, 'D123');
  assert.deepEqual(message, { ts: '123.456' });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, 'https://slack.com/api/conversations.open');
  assert.equal(requests[0]?.method, 'POST');
  assert.equal(requests[0]?.headers.get('Authorization'), 'Bearer xoxb-test-token');
  assert.deepEqual(JSON.parse(requests[0]?.body ?? '{}'), { users: 'U123' });
  assert.equal(requests[1]?.url, 'https://slack.com/api/chat.postMessage');
  assert.deepEqual(JSON.parse(requests[1]?.body ?? '{}'), { channel: 'D123', text: 'hello' });
});

test('Slack API client surfaces Slack API errors clearly', async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const client = createSlackApiClient('xoxb-test-token', fetchMock);

  await assert.rejects(
    () => client.openDirectMessage('U123'),
    /Slack API request failed for conversations.open: invalid_auth/,
  );
});
