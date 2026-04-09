import test from 'node:test';
import assert from 'node:assert/strict';

import { collectParticipants } from '../../src/pr-feedback/participants';

test('collects author reviewers and commenters for a merged PR', () => {
  const participants = collectParticipants({
    event: {
      pull_request: {
        user: { login: 'author' },
      },
    },
    reviews: [{ user: { login: 'reviewer' } }],
    issueComments: [{ user: { login: 'commenter' } }],
    reviewComments: [{ user: { login: 'inline-commenter' } }],
  });

  assert.deepEqual(participants, [
    { login: 'author', roles: ['author'] },
    { login: 'reviewer', roles: ['reviewer'] },
    { login: 'commenter', roles: ['commenter'] },
    { login: 'inline-commenter', roles: ['commenter'] },
  ]);
});

test('deduplicates participants by login and merges roles', () => {
  const participants = collectParticipants({
    event: {
      pull_request: {
        user: { login: 'shared-user' },
      },
    },
    reviews: [
      { user: { login: 'shared-user' } },
      { user: { login: 'shared-user' } },
    ],
    issueComments: [{ user: { login: 'shared-user' } }],
    reviewComments: [{ user: { login: 'shared-user' } }],
  });

  assert.deepEqual(participants, [
    { login: 'shared-user', roles: ['author', 'reviewer', 'commenter'] },
  ]);
});

test('excludes GitHub bot accounts by type and login suffix', () => {
  const participants = collectParticipants({
    event: {
      pull_request: {
        user: { login: 'dependabot[bot]' },
      },
    },
    reviews: [{ user: { login: 'ci-helper', type: 'Bot' } }],
    issueComments: [{ user: { login: 'human-commenter' } }],
    reviewComments: [{ user: { login: 'human-review-commenter' } }],
  });

  assert.deepEqual(participants, [
    { login: 'human-commenter', roles: ['commenter'] },
    { login: 'human-review-commenter', roles: ['commenter'] },
  ]);
});

test('supports closed without merge scenarios with no reviewers', () => {
  const participants = collectParticipants({
    event: {
      pull_request: {
        user: { login: 'author' },
      },
    },
    reviews: [],
    issueComments: [{ user: { login: 'commenter' } }],
    reviewComments: [],
  });

  assert.deepEqual(participants, [
    { login: 'author', roles: ['author'] },
    { login: 'commenter', roles: ['commenter'] },
  ]);
});

test('ignores empty or missing logins', () => {
  const participants = collectParticipants({
    event: {
      pull_request: {
        user: { login: 'author' },
      },
    },
    reviews: [{ user: { login: '   ' } }, { user: {} }],
    issueComments: [{}, { user: { login: null } }],
    reviewComments: [],
  });

  assert.deepEqual(participants, [{ login: 'author', roles: ['author'] }]);
});
