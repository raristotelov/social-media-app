import { STORY_RING_STATES } from '../constants/stories';

import { formatStoryAge, getStartStoryIndex, getStoryRingState, getTrayStartStories, getUpcomingStories, isStoryAspectRatio } from './stories';

const NOW = new Date('2026-10-22T12:00:00.000Z').getTime();
const minutesAgo = (minutes) => new Date(NOW - minutes * 60 * 1000).toISOString();

describe('formatStoryAge', () => {
	it.each([
		[0, '1m'],
		[0.5, '1m'],
		[1, '1m'],
		[1.9, '1m'],
		[2, '2m'],
		[59, '59m'],
		[59.99, '59m'],
	])('shows %p minutes old as "%s", never less than 1m', (minutes, expected) => {
		expect(formatStoryAge(minutesAgo(minutes), NOW)).toBe(expected);
	});

	it.each([
		[60, '1h'],
		[119, '1h'],
		[120, '2h'],
		[600, '10h'],
		[23 * 60 + 59, '23h'],
	])('shows %p minutes old as "%s" once it is an hour or more', (minutes, expected) => {
		expect(formatStoryAge(minutesAgo(minutes), NOW)).toBe(expected);
	});

	it('shows 1m for a story dated slightly in the future (clock skew)', () => {
		expect(formatStoryAge(minutesAgo(-3), NOW)).toBe('1m');
	});

	it('accepts a Date as well as an ISO string', () => {
		expect(formatStoryAge(new Date(NOW - 5 * 60 * 1000), NOW)).toBe('5m');
	});

	it('measures from the current time when no time is given', () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);

		expect(formatStoryAge(minutesAgo(10))).toBe('10m');

		vi.useRealTimers();
	});
});

describe('getStartStoryIndex', () => {
	const stories = [{ isWatched: true }, { isWatched: true }, { isWatched: false }, { isWatched: false }];

	it('starts on the first unwatched story', () => {
		expect(getStartStoryIndex(stories, 'first-unwatched')).toBe(2);
	});

	it('starts on the first story when they are all watched', () => {
		expect(getStartStoryIndex([{ isWatched: true }, { isWatched: true }], 'first-unwatched')).toBe(0);
	});

	it('starts on the first story when none are watched', () => {
		expect(getStartStoryIndex([{ isWatched: false }, { isWatched: false }], 'first-unwatched')).toBe(0);
	});

	it('starts on the first story when watched state is not known, as for your own stories', () => {
		expect(getStartStoryIndex([{ viewersCount: 2 }, { viewersCount: 0 }], 'first-unwatched')).toBe(0);
	});

	it('starts on index 0 when there are no stories', () => {
		expect(getStartStoryIndex([], 'first-unwatched')).toBe(0);
	});

	it('starts on the last story for the "last" target', () => {
		expect(getStartStoryIndex(stories, 'last')).toBe(3);
	});

	it('starts on index 0 for the "last" target when there are no stories', () => {
		expect(getStartStoryIndex([], 'last')).toBe(0);
	});

	it('starts on the first unwatched story for an unknown target', () => {
		expect(getStartStoryIndex(stories, 'something-else')).toBe(2);
	});

	it('starts on the first unwatched story when no target is given', () => {
		expect(getStartStoryIndex(stories)).toBe(2);
	});
});

describe('getUpcomingStories', () => {
	const story = (id, isWatched) => ({ _id: id, isWatched });

	const buildQueue = (storiesByUserId) => Object.keys(storiesByUserId).map((id) => ({ user: { _id: id } }));

	const getIds = (stories) => stories.map((entry) => entry._id);

	const storiesByUserId = {
		alice: [story('a1', true), story('a2', false), story('a3', false)],
		bob: [story('b1', true), story('b2', false), story('b3', false)],
	};

	it("returns the user's next story and the next user's first unwatched story from the middle of a user", () => {
		const result = getUpcomingStories({ queue: buildQueue(storiesByUserId), storiesByUserId, userIndex: 0, storyIndex: 0 });

		expect(getIds(result)).toEqual(['a2', 'b2']);
	});

	it("returns only the next user's start story from the last story of a user", () => {
		const result = getUpcomingStories({ queue: buildQueue(storiesByUserId), storiesByUserId, userIndex: 0, storyIndex: 2 });

		expect(getIds(result)).toEqual(['b2']);
	});

	it('starts the next user on their first story when they are all watched', () => {
		const watched = { ...storiesByUserId, bob: [story('b1', true), story('b2', true)] };

		const result = getUpcomingStories({ queue: buildQueue(watched), storiesByUserId: watched, userIndex: 0, storyIndex: 2 });

		expect(getIds(result)).toEqual(['b1']);
	});

	it('starts the next user on their first story when none are watched', () => {
		const unwatched = { ...storiesByUserId, bob: [story('b1', false), story('b2', false)] };

		const result = getUpcomingStories({ queue: buildQueue(unwatched), storiesByUserId: unwatched, userIndex: 0, storyIndex: 2 });

		expect(getIds(result)).toEqual(['b1']);
	});

	it('returns only the next story of the user from the middle of the last user', () => {
		const result = getUpcomingStories({ queue: buildQueue(storiesByUserId), storiesByUserId, userIndex: 1, storyIndex: 0 });

		expect(getIds(result)).toEqual(['b2']);
	});

	it('returns nothing from the last story of the last user', () => {
		const result = getUpcomingStories({ queue: buildQueue(storiesByUserId), storiesByUserId, userIndex: 1, storyIndex: 2 });

		expect(result).toEqual([]);
	});

	it('skips a next user who has no stories', () => {
		const withEmpty = { ...storiesByUserId, bob: [] };

		const result = getUpcomingStories({ queue: buildQueue(withEmpty), storiesByUserId: withEmpty, userIndex: 0, storyIndex: 0 });

		expect(getIds(result)).toEqual(['a2']);
	});

	it('returns nothing from the last story of a user when the next user has no stories', () => {
		const withEmpty = { ...storiesByUserId, bob: [] };

		const result = getUpcomingStories({ queue: buildQueue(withEmpty), storiesByUserId: withEmpty, userIndex: 0, storyIndex: 2 });

		expect(result).toEqual([]);
	});

	it('looks at the user after the current one only, not further ahead', () => {
		const three = { ...storiesByUserId, carol: [story('c1', false)] };

		const result = getUpcomingStories({ queue: buildQueue(three), storiesByUserId: three, userIndex: 0, storyIndex: 2 });

		expect(getIds(result)).toEqual(['b2']);
	});
});

describe('getTrayStartStories', () => {
	const story = (id, isWatched) => ({ _id: id, isWatched });

	const entry = (userId, stories) => ({ user: { _id: userId }, stories });

	const getIds = (stories) => stories.map((item) => item._id);

	it('returns the start story of every entry when there are fewer entries than the count', () => {
		const entries = [entry('alice', [story('a1', false)]), entry('bob', [story('b1', false)])];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['a1', 'b1']);
	});

	it('returns only the start stories of the first entries when there are more than the count', () => {
		const entries = ['alice', 'bob', 'carol', 'dave', 'erin'].map((id) => entry(id, [story(`${id}-1`, false)]));

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['alice-1', 'bob-1', 'carol-1']);
	});

	it('returns the start stories in tray order', () => {
		const entries = [entry('own', [story('o1', true)]), entry('bob', [story('b1', false)]), entry('carol', [story('c1', false)])];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['o1', 'b1', 'c1']);
	});

	it('picks the first unwatched story of an entry', () => {
		const entries = [entry('alice', [story('a1', true), story('a2', false), story('a3', false)])];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['a2']);
	});

	it('picks the first story of an entry when they are all watched', () => {
		const entries = [entry('alice', [story('a1', true), story('a2', true)])];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['a1']);
	});

	it('picks the first story of an entry whose watched state is not known, as for your own stories', () => {
		const entries = [
			entry('own', [
				{ _id: 'o1', viewersCount: 2 },
				{ _id: 'o2', viewersCount: 0 },
			]),
		];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['o1']);
	});

	it('skips an entry with no stories', () => {
		const entries = [entry('alice', []), entry('bob', [story('b1', false)])];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['b1']);
	});

	it('counts an entry with no stories towards the count', () => {
		const entries = [
			entry('alice', []),
			entry('bob', [story('b1', false)]),
			entry('carol', [story('c1', false)]),
			entry('dave', [story('d1', false)]),
		];

		expect(getIds(getTrayStartStories(entries, 3))).toEqual(['b1', 'c1']);
	});

	it('returns nothing for an empty tray', () => {
		expect(getTrayStartStories([], 3)).toEqual([]);
	});
});

describe('getStoryRingState', () => {
	it.each([[null], [undefined]])('returns no ring state when the story is %p', (story) => {
		expect(getStoryRingState(story)).toBeUndefined();
	});

	it('returns the unwatched state for a story that is not watched', () => {
		expect(getStoryRingState({ isWatched: false })).toBe(STORY_RING_STATES.UNWATCHED);
	});

	it('returns the watched state for a story that is watched', () => {
		expect(getStoryRingState({ isWatched: true })).toBe(STORY_RING_STATES.WATCHED);
	});

	it('treats a story without isWatched as not watched', () => {
		expect(getStoryRingState({})).toBe(STORY_RING_STATES.UNWATCHED);
	});
});

describe('isStoryAspectRatio', () => {
	it('accepts an exact 9:16 photo', () => {
		expect(isStoryAspectRatio({ imageWidth: 1080, imageHeight: 1920 })).toBe(true);
	});

	it('accepts a photo just within 0.02 of 9:16 on the wider side', () => {
		expect(isStoryAspectRatio({ imageWidth: 580, imageHeight: 1000 })).toBe(true);
	});

	it('accepts a photo just within 0.02 of 9:16 on the narrower side', () => {
		expect(isStoryAspectRatio({ imageWidth: 545, imageHeight: 1000 })).toBe(true);
	});

	it('rejects a photo just beyond 0.02 of 9:16 on the wider side', () => {
		expect(isStoryAspectRatio({ imageWidth: 584, imageHeight: 1000 })).toBe(false);
	});

	it('rejects a photo just beyond 0.02 of 9:16 on the narrower side', () => {
		expect(isStoryAspectRatio({ imageWidth: 541, imageHeight: 1000 })).toBe(false);
	});

	it.each([
		['a square photo', 1000, 1000],
		['a landscape photo', 1920, 1080],
		['a 4:5 portrait photo', 800, 1000],
		['a very tall photo', 300, 1500],
	])('rejects %s', (name, imageWidth, imageHeight) => {
		expect(isStoryAspectRatio({ imageWidth, imageHeight })).toBe(false);
	});
});
