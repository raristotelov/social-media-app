jest.mock('../models/userModel');
jest.mock('./visitorVisibilityService');
jest.mock('./storyService');

const mongoose = require('mongoose');

const UserModel = require('../models/userModel');
const { ERROR_CODES } = require('../config/errorCodes');
const AppError = require('../utils/AppError');
const { getSuggestions, dismissCarousel } = require('./suggestionService');
const { getHiddenVisitorIds } = require('./visitorVisibilityService');
const storyService = require('./storyService');

const NOW = new Date('2026-10-22T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const buildId = (value) => new mongoose.Types.ObjectId(value.toString(16).padStart(24, '0'));

const ME = buildId(1);
const FOLLOWED_A = buildId(2);
const FOLLOWED_B = buildId(3);

const buildCandidate = (value, overrides = {}) => ({ _id: buildId(value), username: `user${value}`, ...overrides });

const buildCandidates = (firstValue, count, overrides = {}) =>
	Array.from({ length: count }, (_item, index) => buildCandidate(firstValue + index, overrides));

const buildLeanQuery = (result) => {
	const query = {};

	query.select = jest.fn().mockReturnValue(query);
	query.lean = jest.fn().mockResolvedValue(result);

	return query;
};

const getPoolName = (pipeline) => {
	const { $match: match } = pipeline[0];

	if (match.followers) {
		return 'mutual';
	}

	if (match['posts.0']) {
		return 'new';
	}

	if (match._id.$in) {
		return 'mutualFollowers';
	}

	return 'popular';
};

describe('suggestionService', () => {
	let pools;
	let currentUser;

	const getPipeline = (poolName) => {
		const call = UserModel.aggregate.mock.calls.find(([pipeline]) => getPoolName(pipeline) === poolName);

		return call ? call[0] : undefined;
	};

	const getStage = (poolName, stageName) => getPipeline(poolName).find((stage) => stage[stageName] !== undefined)[stageName];

	const getListedIds = (list) => list.map((item) => item._id.toString());

	beforeEach(() => {
		jest.resetAllMocks();
		jest.useFakeTimers({ now: NOW });

		pools = { mutual: [], popular: [], new: [], mutualFollowers: [] };
		currentUser = { _id: ME, following: [FOLLOWED_A, FOLLOWED_B] };

		UserModel.findById.mockImplementation(() => buildLeanQuery(currentUser));
		UserModel.aggregate.mockImplementation(async (pipeline) => pools[getPoolName(pipeline)]);
		getHiddenVisitorIds.mockResolvedValue([]);
		storyService.withStorySummaries.mockImplementation(async ({ users }) => users);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('getSuggestions', () => {
		describe('story rings', () => {
			beforeEach(() => {
				pools.popular = buildCandidates(10, 8);
			});

			it('asks for the story summaries of the suggestions in one call, for the signed-in user', async () => {
				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(storyService.withStorySummaries).toHaveBeenCalledTimes(1);
				expect(storyService.withStorySummaries).toHaveBeenCalledWith({ users: suggestions, viewerId: ME });
			});

			it('puts the story summary of each user on their own row', async () => {
				storyService.withStorySummaries.mockImplementation(async ({ users }) =>
					users.map((user) => ({ ...user, story: { isWatched: user.username === 'user10' } })),
				);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions).toHaveLength(5);
				expect(suggestions.every((row) => row.story !== undefined)).toBe(true);
				expect(suggestions.find((row) => row.username === 'user10').story).toEqual({ isWatched: true });
			});

			it('keeps every suggestion in the same order after the summaries are added', async () => {
				const { suggestions: before } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				storyService.withStorySummaries.mockImplementation(async ({ users }) => users.map((user) => ({ ...user, story: null })));

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getListedIds(suggestions)).toEqual(getListedIds(before));
			});

			it('answers 500 when the story summaries cannot be loaded', async () => {
				storyService.withStorySummaries.mockRejectedValue(new AppError('Could not load the stories', 500));

				await expect(getSuggestions({ userId: ME, placement: 'sidebar' })).rejects.toMatchObject({ statusCode: 500 });
			});
		});

		describe('validating the request', () => {
			it.each([['nowhere'], [undefined], [''], ['SIDEBAR'], ['toString'], ['__proto__']])(
				'answers 400 BAD_REQUEST for the placement %p, without touching the database',
				async (placement) => {
					const error = await getSuggestions({ userId: ME, placement }).catch((caught) => caught);

					expect(error).toBeInstanceOf(AppError);
					expect(error.statusCode).toBe(400);
					expect(error.code).toBe(ERROR_CODES.BAD_REQUEST);
					expect(UserModel.findById).not.toHaveBeenCalled();
					expect(UserModel.aggregate).not.toHaveBeenCalled();
				},
			);

			it('answers 401 UNAUTHENTICATED when the signed-in user no longer exists, without ranking anyone', async () => {
				currentUser = null;

				const error = await getSuggestions({ userId: ME, placement: 'sidebar' }).catch((caught) => caught);

				expect(error).toBeInstanceOf(AppError);
				expect(error.statusCode).toBe(401);
				expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
				expect(UserModel.aggregate).not.toHaveBeenCalled();
			});

			it('answers 401 for a deleted user on the carousel placement too', async () => {
				currentUser = null;

				await expect(getSuggestions({ userId: ME, placement: 'carousel' })).rejects.toMatchObject({ statusCode: 401 });
			});

			it('loads the signed-in user with only their following list and carousel dismissal', async () => {
				const query = buildLeanQuery(currentUser);

				UserModel.findById.mockReturnValue(query);

				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(UserModel.findById).toHaveBeenCalledWith(ME);
				expect(query.select).toHaveBeenCalledWith({ following: 1, suggestionsCarouselDismissedUntil: 1 });
			});

			it('wraps an unexpected database failure in a 500 AppError that keeps the cause', async () => {
				const failure = new Error('connection lost');

				UserModel.aggregate.mockRejectedValue(failure);

				const error = await getSuggestions({ userId: ME, placement: 'sidebar' }).catch((caught) => caught);

				expect(error).toBeInstanceOf(AppError);
				expect(error.statusCode).toBe(500);
				expect(error.cause).toBe(failure);
			});

			it('wraps a failure to load the user in a 500 AppError', async () => {
				UserModel.findById.mockImplementation(() => {
					throw new Error('boom');
				});

				await expect(getSuggestions({ userId: ME, placement: 'sidebar' })).rejects.toMatchObject({ statusCode: 500 });
			});
		});

		describe('who is left out', () => {
			it.each([['mutual'], ['popular'], ['new']])(
				'excludes the user themself and everyone they follow from the %s ranking',
				async (poolName) => {
					await getSuggestions({ userId: ME, placement: 'carousel' });

					const excludedIds = getStage(poolName, '$match')._id.$nin.map(String);

					expect(excludedIds).toEqual([ME, FOLLOWED_A, FOLLOWED_B].map(String));
				},
			);

			it('excludes only the user themself when they follow nobody', async () => {
				currentUser = { _id: ME, following: [] };

				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getStage('popular', '$match')._id.$nin.map(String)).toEqual([String(ME)]);
			});

			it('copes with a user document that has no following field', async () => {
				currentUser = { _id: ME };

				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getStage('popular', '$match')._id.$nin.map(String)).toEqual([String(ME)]);
			});

			it('excludes nobody extra because the carousel was dismissed: the sidebar still ranks everyone else', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() + DAY_MS) };
				pools.popular = buildCandidates(10, 3);

				const result = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getStage('popular', '$match')._id.$nin.map(String)).toEqual([ME, FOLLOWED_A, FOLLOWED_B].map(String));
				expect(getListedIds(result.suggestions)).toEqual(getListedIds(pools.popular));
				expect(result.isCarouselDismissed).toBe(false);
			});

			it('excludes nobody extra because the carousel dismissal has expired', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() - 1000) };
				pools.popular = buildCandidates(10, 3);

				const result = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(getStage('popular', '$match')._id.$nin.map(String)).toEqual([ME, FOLLOWED_A, FOLLOWED_B].map(String));
				expect(getListedIds(result.suggestions)).toEqual(getListedIds(pools.popular));
				expect(result.isCarouselDismissed).toBe(false);
			});
		});

		describe('the mutual group', () => {
			it('looks only at users followed by someone the user follows', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getStage('mutual', '$match').followers).toEqual({ $in: [FOLLOWED_A, FOLLOWED_B] });
			});

			it('ranks by number of mutual connections, then by followers, then by id for a stable order', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getPipeline('mutual').filter((stage) => stage.$sort)).toEqual([{ $sort: { mutualCount: -1, followersCount: -1, _id: 1 } }]);
			});

			it('counts mutual connections as the followers who are also followed by the user', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				const [firstAddFields] = getPipeline('mutual').filter((stage) => stage.$addFields);

				expect(firstAddFields.$addFields.mutualFollowerIds).toEqual({ $setIntersection: ['$followers', [FOLLOWED_A, FOLLOWED_B]] });
			});

			it('is not queried when the user follows nobody, so nobody can be a mutual', async () => {
				currentUser = { _id: ME, following: [] };
				pools.popular = buildCandidates(10, 8);

				const result = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getPipeline('mutual')).toBeUndefined();
				expect(result.suggestions.every((suggestion) => suggestion.group === 'popular')).toBe(true);
			});

			it('says "followed by X" with no count when one followed user follows them', async () => {
				const mutual = buildCandidate(10, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 });

				pools.mutual = [mutual];
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 4 }];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0]).toMatchObject({ group: 'mutual', followedBy: { _id: FOLLOWED_A, username: 'alice' }, moreMutualCount: 0 });
			});

			it('names the most-followed of the mutual followers and counts the rest as "more"', async () => {
				pools.mutual = [buildCandidate(10, { mutualFollowerIds: [FOLLOWED_A, FOLLOWED_B, buildId(4)], mutualCount: 3 })];
				pools.mutualFollowers = [
					{ _id: FOLLOWED_A, username: 'alice', followersCount: 4 },
					{ _id: FOLLOWED_B, username: 'bob', followersCount: 90 },
					{ _id: buildId(4), username: 'carol', followersCount: 12 },
				];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0].followedBy).toEqual({ _id: FOLLOWED_B, username: 'bob' });
				expect(suggestions[0].moreMutualCount).toBe(2);
			});

			it('breaks a tie between equally followed mutual followers by id', async () => {
				pools.mutual = [buildCandidate(10, { mutualFollowerIds: [FOLLOWED_B, FOLLOWED_A], mutualCount: 2 })];
				pools.mutualFollowers = [
					{ _id: FOLLOWED_B, username: 'bob', followersCount: 7 },
					{ _id: FOLLOWED_A, username: 'alice', followersCount: 7 },
				];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0].followedBy.username).toBe('alice');
			});

			it('looks the mutual followers up once, for every candidate in the mutual pool, including ones that are not selected', async () => {
				pools.mutual = [
					...buildCandidates(10, 11, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 }),
					buildCandidate(30, { mutualFollowerIds: [FOLLOWED_B], mutualCount: 1 }),
				];
				pools.mutualFollowers = [
					{ _id: FOLLOWED_A, username: 'alice', followersCount: 1 },
					{ _id: FOLLOWED_B, username: 'bob', followersCount: 1 },
				];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				const lookups = UserModel.aggregate.mock.calls.filter(([pipeline]) => getPoolName(pipeline) === 'mutualFollowers');

				expect(getListedIds(suggestions)).not.toContain(buildId(30).toString());
				expect(lookups).toHaveLength(1);
				expect(lookups[0][0][0].$match._id.$in.map(String).sort()).toEqual([FOLLOWED_A, FOLLOWED_B].map(String).sort());
			});

			it('does not look mutual followers up when the mutual pool is empty', async () => {
				pools.popular = buildCandidates(10, 8);

				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getPipeline('mutualFollowers')).toBeUndefined();
			});

			it('drops a mutual candidate whose mutual followers cannot be found, instead of relabelling it', async () => {
				const unresolved = buildCandidate(10, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 });

				pools.mutual = [unresolved];
				pools.mutualFollowers = [];
				pools.popular = buildCandidates(200, 10);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getListedIds(suggestions)).not.toContain(unresolved._id.toString());
				expect(suggestions.some((suggestion) => suggestion.group === 'mutual')).toBe(false);
			});

			it('keeps suggestions in mutual, most-followed, new order when a mutual candidate is dropped between mutual rows', async () => {
				pools.mutual = [
					buildCandidate(100, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 }),
					buildCandidate(101, { mutualFollowerIds: [buildId(9)], mutualCount: 1 }),
					buildCandidate(102, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 }),
					buildCandidate(103, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 }),
					buildCandidate(104, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 }),
				];
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 3 }];
				pools.popular = buildCandidates(200, 10);
				pools.new = buildCandidates(300, 10);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions.map((suggestion) => suggestion.group)).toEqual(['mutual', 'mutual', 'popular', 'popular', 'new']);
				expect(getListedIds(suggestions)).toEqual([100, 102, 200, 201, 300].map((value) => buildId(value).toString()));
			});
		});

		describe('the most-followed group', () => {
			it('ranks by number of followers, then by id for a stable order', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getPipeline('popular').filter((stage) => stage.$sort)).toEqual([{ $sort: { followersCount: -1, _id: 1 } }]);
			});

			it('counts followers as the size of the followers list, treating a missing list as zero', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getStage('popular', '$addFields').followersCount).toEqual({ $size: { $ifNull: ['$followers', []] } });
			});

			it('returns the group as popular with no mutual details', async () => {
				pools.popular = [buildCandidate(10)];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0].group).toBe('popular');
				expect(suggestions[0].followedBy).toBeUndefined();
				expect(suggestions[0].moreMutualCount).toBeUndefined();
			});
		});

		describe('the new group', () => {
			it('only includes users who joined in the last 30 days, judged by the time inside their id', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				const lowerBound = getStage('new', '$match')._id.$gte;
				const expectedSeconds = Math.floor((NOW.getTime() - 30 * DAY_MS) / 1000);

				expect(lowerBound.getTimestamp().getTime()).toBe(expectedSeconds * 1000);
			});

			it('only includes users with at least one post', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getStage('new', '$match')['posts.0']).toEqual({ $exists: true });
			});

			it('puts the most recently joined first', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getPipeline('new').filter((stage) => stage.$sort)).toEqual([{ $sort: { _id: -1 } }]);
			});

			it('moves the 30-day window with the clock', async () => {
				jest.setSystemTime(new Date(NOW.getTime() + 10 * DAY_MS));

				await getSuggestions({ userId: ME, placement: 'sidebar' });

				const expectedSeconds = Math.floor((NOW.getTime() + 10 * DAY_MS - 30 * DAY_MS) / 1000);

				expect(getStage('new', '$match')._id.$gte.getTimestamp().getTime()).toBe(expectedSeconds * 1000);
			});

			it('returns the group as new', async () => {
				pools.new = [buildCandidate(10)];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0].group).toBe('new');
			});
		});

		describe('the mix per placement', () => {
			beforeEach(() => {
				pools.mutual = buildCandidates(100, 12, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 });
				pools.popular = buildCandidates(200, 12);
				pools.new = buildCandidates(300, 12);
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 3 }];
			});

			it('gives the sidebar 2 mutual, 2 most-followed and 1 new, new last', async () => {
				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions.map((suggestion) => suggestion.group)).toEqual(['mutual', 'mutual', 'popular', 'popular', 'new']);
			});

			it('gives the carousel 4 mutual, 4 most-followed and 2 new, new last', async () => {
				const { suggestions } = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(suggestions.map((suggestion) => suggestion.group)).toEqual([
					...Array(4).fill('mutual'),
					...Array(4).fill('popular'),
					...Array(2).fill('new'),
				]);
			});

			it('gives the empty feed 5 most-followed and 3 new, and never ranks mutuals', async () => {
				currentUser = { _id: ME, following: [] };

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'empty-feed' });

				expect(suggestions.map((suggestion) => suggestion.group)).toEqual([...Array(5).fill('popular'), ...Array(3).fill('new')]);
				expect(getPipeline('mutual')).toBeUndefined();
			});

			it('does not rank mutuals for the empty feed even when the user follows people', async () => {
				const { suggestions } = await getSuggestions({ userId: ME, placement: 'empty-feed' });

				expect(getPipeline('mutual')).toBeUndefined();
				expect(suggestions).toHaveLength(8);
			});

			it('lists the suggestions in mutual, most-followed, new order', async () => {
				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getListedIds(suggestions)).toEqual([100, 101, 200, 201, 300].map((value) => buildId(value).toString()));
			});
		});

		describe('a short group', () => {
			it('hands the mutual places it cannot fill to the most-followed group', async () => {
				pools.mutual = buildCandidates(100, 1, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 });
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 3 }];
				pools.popular = buildCandidates(200, 10);
				pools.new = buildCandidates(300, 10);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions.map((suggestion) => suggestion.group)).toEqual(['mutual', 'popular', 'popular', 'popular', 'new']);
			});

			it('hands the places both earlier groups cannot fill to the new group', async () => {
				pools.popular = buildCandidates(200, 1);
				pools.new = buildCandidates(300, 10);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions.map((suggestion) => suggestion.group)).toEqual(['popular', 'new', 'new', 'new', 'new']);
			});

			it('fills the remaining places from the earlier groups when the new group is short', async () => {
				pools.popular = buildCandidates(200, 10);
				pools.new = [];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions).toHaveLength(5);
				expect(suggestions.every((suggestion) => suggestion.group === 'popular')).toBe(true);
			});

			it('returns a shorter list when there are fewer candidates than places', async () => {
				pools.popular = buildCandidates(200, 3);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(suggestions).toHaveLength(3);
			});

			it('returns an empty list when nobody is left to suggest', async () => {
				const result = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(result).toEqual({ suggestions: [], isCarouselDismissed: false });
			});

			it('lists someone once even if they qualify for two groups', async () => {
				const shared = buildCandidate(10);

				pools.popular = [shared, buildCandidate(11)];
				pools.new = [shared, buildCandidate(12)];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(getListedIds(suggestions).filter((id) => id === shared._id.toString())).toHaveLength(1);
			});

			it('still fills every place when the same people qualify for several groups', async () => {
				const people = buildCandidates(10, 8);

				pools.mutual = people.slice(0, 2).map((person) => ({ ...person, mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 }));
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 3 }];
				pools.popular = people.slice(0, 4);
				pools.new = people.slice(0, 6);

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions).toHaveLength(5);
				expect(new Set(getListedIds(suggestions)).size).toBe(5);
			});
		});

		describe('the response', () => {
			beforeEach(() => {
				pools.mutual = buildCandidates(100, 12, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 });
				pools.popular = buildCandidates(200, 12);
				pools.new = buildCandidates(300, 12);
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 3 }];
			});

			it.each([['sidebar'], ['carousel'], ['empty-feed']])(
				'holds only the suggestions and the dismissal flag for the %s',
				async (placement) => {
					const result = await getSuggestions({ userId: ME, placement });

					expect(Object.keys(result).sort()).toEqual(['isCarouselDismissed', 'suggestions']);
					expect(result).not.toHaveProperty('reserve');
				},
			);

			it('holds no reserve for a dismissed carousel either', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() + DAY_MS) };

				const result = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(result).not.toHaveProperty('reserve');
			});

			it('carries each mutual suggestion its reason details', async () => {
				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0].followedBy).toEqual({ _id: FOLLOWED_A, username: 'alice' });
			});
		});

		describe('how many candidates are asked for', () => {
			beforeEach(() => {
				pools.mutual = buildCandidates(100, 12, { mutualFollowerIds: [FOLLOWED_A], mutualCount: 1 });
				pools.mutualFollowers = [{ _id: FOLLOWED_A, username: 'alice', followersCount: 3 }];
			});

			it.each([
				['sidebar', 5 * 2],
				['carousel', 10 * 2],
				['empty-feed', 8 * 2],
			])('limits each pool to twice the list size for the %s', async (placement, expectedLimit) => {
				await getSuggestions({ userId: ME, placement });

				const askedPools = ['mutual', 'popular', 'new'].filter((poolName) => getPipeline(poolName));

				expect(askedPools.length).toBeGreaterThan(0);
				askedPools.forEach((poolName) => {
					expect(getStage(poolName, '$limit')).toBe(expectedLimit);
				});
			});
		});

		describe('the shape of a suggestion', () => {
			it('carries id, username, group and the profile picture url only', async () => {
				pools.popular = [
					buildCandidate(10, { profilePicture: { imageUrl: 'https://cdn/10.jpg', imageIdentifier: 'secret-id' }, followersCount: 9 }),
				];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0]).toEqual({
					_id: pools.popular[0]._id,
					username: 'user10',
					profilePicture: { imageUrl: 'https://cdn/10.jpg' },
					group: 'popular',
				});
			});

			it('leaves the profile picture out for a user without one', async () => {
				pools.popular = [buildCandidate(10)];

				const { suggestions } = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(suggestions[0].profilePicture).toBeUndefined();
			});

			it('projects only the fields it returns, never the password or email', async () => {
				await getSuggestions({ userId: ME, placement: 'sidebar' });

				const projections = ['popular', 'new', 'mutual'].map((poolName) => getStage(poolName, '$project'));

				projections.forEach((projection) => {
					expect(projection.password).toBeUndefined();
					expect(projection.email).toBeUndefined();
					expect(projection.username).toBe(1);
				});
			});
		});

		describe('the carousel dismissal', () => {
			it('answers an empty carousel marked as dismissed while the dismissal lasts, without ranking anyone', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() + DAY_MS) };
				pools.popular = buildCandidates(200, 10);

				const result = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(result).toEqual({ suggestions: [], isCarouselDismissed: true });
				expect(UserModel.aggregate).not.toHaveBeenCalled();
			});

			it('is over once the dismissal date has passed', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() - DAY_MS) };
				pools.popular = buildCandidates(200, 3);

				const result = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(result.isCarouselDismissed).toBe(false);
				expect(result.suggestions).toHaveLength(3);
			});

			it('is over exactly at the dismissal date', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime()) };

				const result = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(result.isCarouselDismissed).toBe(false);
			});

			it('does not apply to the sidebar', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() + DAY_MS) };
				pools.popular = buildCandidates(200, 3);

				const result = await getSuggestions({ userId: ME, placement: 'sidebar' });

				expect(result.suggestions).toHaveLength(3);
				expect(result.isCarouselDismissed).toBe(false);
			});

			it('does not apply to the empty feed', async () => {
				currentUser = { ...currentUser, suggestionsCarouselDismissedUntil: new Date(NOW.getTime() + DAY_MS) };
				pools.popular = buildCandidates(200, 3);

				const result = await getSuggestions({ userId: ME, placement: 'empty-feed' });

				expect(result.suggestions).toHaveLength(3);
			});

			it('marks a carousel that was never dismissed as not dismissed', async () => {
				const result = await getSuggestions({ userId: ME, placement: 'carousel' });

				expect(result.isCarouselDismissed).toBe(false);
			});
		});
	});

	describe('dismissCarousel', () => {
		it('stores a dismissal that lasts 7 days from now against the account', async () => {
			UserModel.updateOne.mockResolvedValue({ matchedCount: 1 });

			await dismissCarousel(ME);

			expect(UserModel.updateOne).toHaveBeenCalledWith(
				{ _id: ME },
				{ $set: { suggestionsCarouselDismissedUntil: new Date(NOW.getTime() + 7 * DAY_MS) } },
			);
		});

		it('resolves with nothing', async () => {
			UserModel.updateOne.mockResolvedValue({ matchedCount: 1 });

			await expect(dismissCarousel(ME)).resolves.toBeUndefined();
		});

		it('answers 401 UNAUTHENTICATED when the account no longer exists', async () => {
			UserModel.updateOne.mockResolvedValue({ matchedCount: 0 });

			const error = await dismissCarousel(ME).catch((caught) => caught);

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(401);
			expect(error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
		});

		it('wraps a database failure in a 500 AppError that keeps the cause', async () => {
			const failure = new Error('connection lost');

			UserModel.updateOne.mockRejectedValue(failure);

			const error = await dismissCarousel(ME).catch((caught) => caught);

			expect(error).toBeInstanceOf(AppError);
			expect(error.statusCode).toBe(500);
			expect(error.cause).toBe(failure);
		});
	});
});
