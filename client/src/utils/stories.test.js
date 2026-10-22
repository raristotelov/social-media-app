import { formatStoryAge, getStartStoryIndex, isStoryAspectRatio } from './stories';

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
		jest.useFakeTimers('modern');
		jest.setSystemTime(NOW);

		expect(formatStoryAge(minutesAgo(10))).toBe('10m');

		jest.useRealTimers();
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

	it('starts on the first story for the "first" target even when it is watched', () => {
		expect(getStartStoryIndex(stories, 'first')).toBe(0);
	});

	it('starts on the last story for the "last" target', () => {
		expect(getStartStoryIndex(stories, 'last')).toBe(3);
	});

	it('starts on index 0 for the "last" target when there are no stories', () => {
		expect(getStartStoryIndex([], 'last')).toBe(0);
	});

	it('starts on the first story for an unknown target', () => {
		expect(getStartStoryIndex(stories, 'something-else')).toBe(0);
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
