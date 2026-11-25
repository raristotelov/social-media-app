import { APP_NAME } from '../constants/app';

import { getSuggestionReason } from './suggestions';

describe('getSuggestionReason', () => {
	it('says "Followed by X" for a mutual suggestion with no one else', () => {
		const suggestion = { group: 'mutual', followedBy: { _id: 'u2', username: 'alice' }, moreMutualCount: 0 };

		expect(getSuggestionReason(suggestion)).toBe('Followed by alice');
	});

	it('says "Followed by X + N more" for a mutual suggestion with others', () => {
		const suggestion = { group: 'mutual', followedBy: { _id: 'u2', username: 'alice' }, moreMutualCount: 3 };

		expect(getSuggestionReason(suggestion)).toBe('Followed by alice + 3 more');
	});

	it('says "+ 1 more" for a single extra mutual connection', () => {
		const suggestion = { group: 'mutual', followedBy: { _id: 'u2', username: 'alice' }, moreMutualCount: 1 };

		expect(getSuggestionReason(suggestion)).toBe('Followed by alice + 1 more');
	});

	it('treats a missing more-count as none', () => {
		const suggestion = { group: 'mutual', followedBy: { _id: 'u2', username: 'alice' } };

		expect(getSuggestionReason(suggestion)).toBe('Followed by alice');
	});

	it('says "Popular on {APP_NAME}" for the most-followed group', () => {
		expect(getSuggestionReason({ group: 'popular' })).toBe(`Popular on ${APP_NAME}`);
	});

	it('says "New to {APP_NAME}" for the new group', () => {
		expect(getSuggestionReason({ group: 'new' })).toBe(`New to ${APP_NAME}`);
	});

	it('falls back to the popular line for a mutual suggestion without a named follower', () => {
		expect(getSuggestionReason({ group: 'mutual' })).toBe(`Popular on ${APP_NAME}`);
	});

	it('uses the app name constant, not a hardcoded name', () => {
		expect(getSuggestionReason({ group: 'popular' })).toContain(APP_NAME);
		expect(getSuggestionReason({ group: 'new' })).toContain(APP_NAME);
	});
});
