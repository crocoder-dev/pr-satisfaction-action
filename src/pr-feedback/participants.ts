export type ParticipantRole = 'author' | 'reviewer' | 'commenter';

export interface GitHubUserLike {
  login?: string | null;
  type?: string | null;
}

export interface PullRequestClosedEventLike {
  pull_request?: {
    user?: GitHubUserLike | null;
  } | null;
}

export interface ReviewLike {
  user?: GitHubUserLike | null;
}

export interface CommentLike {
  user?: GitHubUserLike | null;
}

export interface CollectParticipantsInput {
  event: PullRequestClosedEventLike;
  reviews?: ReviewLike[];
  issueComments?: CommentLike[];
  reviewComments?: CommentLike[];
}

export interface Participant {
  login: string;
  roles: ParticipantRole[];
}

function isBot(user: GitHubUserLike | null | undefined): boolean {
  if (!user) {
    return false;
  }

  return user.type === 'Bot' || user.login?.endsWith('[bot]') === true;
}

function addParticipant(
  participants: Map<string, Set<ParticipantRole>>,
  user: GitHubUserLike | null | undefined,
  role: ParticipantRole,
): void {
  const login = user?.login?.trim();

  if (!login || isBot(user)) {
    return;
  }

  const roles = participants.get(login) ?? new Set<ParticipantRole>();
  roles.add(role);
  participants.set(login, roles);
}

export function collectParticipants({
  event,
  reviews = [],
  issueComments = [],
  reviewComments = [],
}: CollectParticipantsInput): Participant[] {
  const participants = new Map<string, Set<ParticipantRole>>();

  addParticipant(participants, event.pull_request?.user, 'author');

  for (const review of reviews) {
    addParticipant(participants, review.user, 'reviewer');
  }

  for (const comment of issueComments) {
    addParticipant(participants, comment.user, 'commenter');
  }

  for (const comment of reviewComments) {
    addParticipant(participants, comment.user, 'commenter');
  }

  return Array.from(participants.entries()).map(([login, roles]) => ({
    login,
    roles: Array.from(roles),
  }));
}
