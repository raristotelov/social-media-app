const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const { getSuggestions } = require('./suggestionService');

const DAY_SECONDS = 24 * 60 * 60;
const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

const createObjectId = (joinedDaysAgo) =>
	new mongoose.Types.ObjectId(mongoose.Types.ObjectId.generate(Math.floor(Date.now() / 1000) - joinedDaysAgo * DAY_SECONDS));

const createUser = async (username, { joinedDaysAgo = 0, postCount = 0 } = {}) => {
	const userId = createObjectId(joinedDaysAgo);

	const posts = await UserPostModel.insertMany(
		Array.from({ length: postCount }, (_item, index) => ({
			imageIdentifier: `${username}-post-${index}`,
			imageUrl: `https://cdn.example.com/${username}-post-${index}.jpg`,
			imageWidth: 100,
			imageHeight: 100,
			userId,
		})),
	);

	await UserModel.create({
		_id: userId,
		email: `${username}@example.com`,
		username,
		password: 'hashed-password',
		posts: posts.map((post) => post._id),
	});

	return { _id: userId, username };
};

const createUsers = async (prefix, count, getOptions = () => ({})) => {
	const users = [];

	for (let index = 1; index <= count; index += 1) {
		users.push(await createUser(`${prefix}${index}`, getOptions(index)));
	}

	return users;
};

const follow = (follower, followee) =>
	UserModel.bulkWrite([
		{ updateOne: { filter: { _id: follower._id }, update: { $addToSet: { following: followee._id } } } },
		{ updateOne: { filter: { _id: followee._id }, update: { $addToSet: { followers: follower._id } } } },
	]);

const followAll = async (followers, followee) => {
	for (const follower of followers) {
		await follow(follower, followee);
	}
};

const addFollowers = async (user, count) => {
	const fans = await createUsers(`${user.username}-fan`, count);

	await followAll(fans, user);

	return fans;
};

const ids = (users) => users.map((user) => String(user._id));

const idsInGroup = (suggestions, group) => ids(suggestions.filter((suggestion) => suggestion.group === group));

const listedIds = ({ suggestions, reserve }) => ids([...suggestions, ...reserve]);

const fetchSuggestions = (user, placement) => getSuggestions({ userId: user._id, placement });

const seedFullWorld = async () => {
	const me = await createUser('me');
	const followed = await createUsers('followed', 3);

	for (const followedUser of followed) {
		await follow(me, followedUser);
	}

	const mutuals = await createUsers('mutual', 10);

	for (const mutual of mutuals) {
		await follow(followed[0], mutual);
	}

	const populars = await createUsers('popular', 8);

	for (const [index, popular] of populars.entries()) {
		await addFollowers(popular, 9 - index);
	}

	const news = await createUsers('new', 6, (index) => ({ joinedDaysAgo: index, postCount: 1 }));

	return { me, followed, mutuals, populars, news };
};

describe('suggestionService against a real database', () => {
	let mongoServer;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), UserPostModel.init()]);
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		await Promise.all([UserModel.deleteMany({}), UserPostModel.deleteMany({})]);
	});

	describe('who is left out', () => {
		const seedExclusionWorld = async () => {
			const me = await createUser('me', { postCount: 1 });
			const [followedA, followedB] = await createUsers('followed', 2, () => ({ postCount: 1 }));

			await follow(me, followedA);
			await follow(me, followedB);
			await follow(followedA, followedB);
			await follow(followedB, followedA);
			await follow(followedA, me);

			await addFollowers(me, 6);
			await addFollowers(followedA, 6);
			await addFollowers(followedB, 6);

			const others = await createUsers('other', 12, () => ({ postCount: 1 }));

			for (const other of others) {
				await addFollowers(other, 1);
			}

			for (const other of others.slice(0, 4)) {
				await follow(followedA, other);
			}

			return { me, followedA, followedB, others };
		};

		it.each([['sidebar'], ['carousel'], ['empty-feed']])(
			'leaves the user and everyone they follow out of the %s, although they qualify for every group',
			async (placement) => {
				const { me, followedA, followedB } = await seedExclusionWorld();

				const result = await fetchSuggestions(me, placement);

				expect(result.suggestions.length).toBeGreaterThan(0);
				expect(listedIds(result)).not.toEqual(expect.arrayContaining([String(me._id)]));
				expect(listedIds(result)).not.toEqual(expect.arrayContaining([String(followedA._id)]));
				expect(listedIds(result)).not.toEqual(expect.arrayContaining([String(followedB._id)]));
			},
		);

		it('leaves out only the user themself when they follow nobody', async () => {
			const me = await createUser('me', { postCount: 1 });

			await addFollowers(me, 6);

			await createUsers('other', 6, () => ({ postCount: 1 }));

			const result = await fetchSuggestions(me, 'sidebar');

			expect(listedIds(result)).toHaveLength(10);
			expect(listedIds(result)).not.toContain(String(me._id));
		});
	});

	describe('the mutual group', () => {
		it('ranks by how many of the people the user follows follow them, then by followers, however many followers they have in total', async () => {
			const me = await createUser('me');
			const [followedA, followedB, followedC] = await createUsers('followed', 3);

			await follow(me, followedA);
			await follow(me, followedB);
			await follow(me, followedC);

			const mutuals = await createUsers('mutual', 5);
			const [mutual1, mutual2, mutual3, mutual4, lowestRanked] = mutuals;

			await followAll([followedA, followedB, followedC], mutual1);
			await followAll([followedA, followedB], mutual2);
			await addFollowers(mutual2, 8);
			await follow(followedA, mutual3);
			await addFollowers(mutual3, 5);
			await follow(followedA, mutual4);
			await addFollowers(mutual4, 2);
			await follow(followedA, lowestRanked);

			const result = await fetchSuggestions(me, 'carousel');

			expect(idsInGroup(result.suggestions, 'mutual')).toEqual(ids([mutual1, mutual2, mutual3, mutual4]));
		});

		it('only includes users followed by someone the user follows, not those followed only by strangers', async () => {
			const me = await createUser('me');
			const followedA = await createUser('followedA');

			await follow(me, followedA);

			const stranger = await createUser('stranger');
			const candidate = await createUser('candidate');
			const followedOnlyByStranger = await createUser('followedOnlyByStranger');

			await follow(followedA, candidate);
			await follow(stranger, followedOnlyByStranger);

			const result = await fetchSuggestions(me, 'carousel');

			expect(idsInGroup(result.suggestions, 'mutual')).toEqual(ids([candidate]));
			expect(idsInGroup(result.suggestions, 'popular')).toEqual(expect.arrayContaining([String(followedOnlyByStranger._id)]));
		});
	});

	describe('the most-followed group', () => {
		it('ranks by follower count, highest first', async () => {
			const me = await createUser('me');
			const populars = await createUsers('popular', 6);

			for (const [index, popular] of populars.entries()) {
				await addFollowers(popular, 6 - index);
			}

			const result = await fetchSuggestions(me, 'empty-feed');

			expect(ids(result.suggestions.slice(0, 6))).toEqual(ids(populars));
			expect(result.suggestions.slice(0, 6).every((suggestion) => suggestion.group === 'popular')).toBe(true);
		});

		it('does not rank someone with followers below someone with more', async () => {
			const me = await createUser('me');
			const [fewer, more] = await createUsers('candidate', 2);

			await addFollowers(fewer, 2);
			await addFollowers(more, 3);

			const result = await fetchSuggestions(me, 'empty-feed');

			expect(ids(result.suggestions.slice(0, 2))).toEqual(ids([more, fewer]));
		});
	});

	describe('the new group', () => {
		it('holds only users who joined in the last 30 days and have at least one post, newest first', async () => {
			const me = await createUser('me');
			const populars = await createUsers('popular', 5);

			for (const [index, popular] of populars.entries()) {
				await addFollowers(popular, 5 - index);
			}

			const joinedYesterday = await createUser('joinedYesterday', { joinedDaysAgo: 1, postCount: 1 });
			const joinedTenDaysAgo = await createUser('joinedTenDaysAgo', { joinedDaysAgo: 10, postCount: 2 });
			const joinedTwentyNineDaysAgo = await createUser('joinedTwentyNineDaysAgo', { joinedDaysAgo: 29, postCount: 1 });
			const recentWithoutPosts = await createUser('recentWithoutPosts', { joinedDaysAgo: 2 });
			const oldWithPosts = await createUser('oldWithPosts', { joinedDaysAgo: 45, postCount: 3 });
			const justOutsideWindow = await createUser('justOutsideWindow', { joinedDaysAgo: 31, postCount: 1 });

			const result = await fetchSuggestions(me, 'empty-feed');

			expect(idsInGroup(result.suggestions, 'new')).toEqual(ids([joinedYesterday, joinedTenDaysAgo, joinedTwentyNineDaysAgo]));
			expect(listedIds(result)).not.toEqual(expect.arrayContaining([String(recentWithoutPosts._id)]));
			expect(listedIds(result)).not.toEqual(expect.arrayContaining([String(oldWithPosts._id)]));
			expect(listedIds(result)).not.toEqual(expect.arrayContaining([String(justOutsideWindow._id)]));
		});
	});

	describe('the mix per placement', () => {
		it('gives the sidebar 2 mutual, 2 most-followed and 1 new, with a reserve of 5', async () => {
			const { me, populars, news } = await seedFullWorld();

			const { suggestions, reserve } = await fetchSuggestions(me, 'sidebar');

			expect(suggestions.map((suggestion) => suggestion.group)).toEqual(['mutual', 'mutual', 'popular', 'popular', 'new']);
			expect(idsInGroup(suggestions, 'popular')).toEqual(ids(populars.slice(0, 2)));
			expect(idsInGroup(suggestions, 'new')).toEqual(ids(news.slice(0, 1)));
			expect(reserve).toHaveLength(5);
		});

		it('gives the carousel 4 mutual, 4 most-followed and 2 new, with a reserve of 5', async () => {
			const { me, populars, news } = await seedFullWorld();

			const { suggestions, reserve } = await fetchSuggestions(me, 'carousel');

			expect(suggestions.map((suggestion) => suggestion.group)).toEqual([
				...Array(4).fill('mutual'),
				...Array(4).fill('popular'),
				...Array(2).fill('new'),
			]);
			expect(idsInGroup(suggestions, 'popular')).toEqual(ids(populars.slice(0, 4)));
			expect(idsInGroup(suggestions, 'new')).toEqual(ids(news.slice(0, 2)));
			expect(reserve).toHaveLength(5);
		});

		it('gives the empty feed 5 most-followed and 3 new, no mutuals and no reserve, even for a user who follows people', async () => {
			const { me, populars, news } = await seedFullWorld();

			const { suggestions, reserve } = await fetchSuggestions(me, 'empty-feed');

			expect(suggestions.map((suggestion) => suggestion.group)).toEqual([...Array(5).fill('popular'), ...Array(3).fill('new')]);
			expect(idsInGroup(suggestions, 'popular')).toEqual(ids(populars.slice(0, 5)));
			expect(idsInGroup(suggestions, 'new')).toEqual(ids(news.slice(0, 3)));
			expect(reserve).toEqual([]);
		});

		it('keeps the reserve in group order and never repeats a listed suggestion', async () => {
			const { me } = await seedFullWorld();

			const { suggestions, reserve } = await fetchSuggestions(me, 'sidebar');

			expect(reserve.map((suggestion) => suggestion.group)).toEqual(Array(5).fill('mutual'));
			expect(new Set([...ids(suggestions), ...ids(reserve)]).size).toBe(10);
		});
	});

	describe('a short group', () => {
		it('hands the mutual places it cannot fill to the most-followed group', async () => {
			const me = await createUser('me');
			const followedA = await createUser('followedA');

			await follow(me, followedA);

			const mutual = await createUser('mutual');

			await follow(followedA, mutual);

			const populars = await createUsers('popular', 6);

			for (const [index, popular] of populars.entries()) {
				await addFollowers(popular, 7 - index);
			}

			const news = await createUsers('new', 3, (index) => ({ joinedDaysAgo: index, postCount: 1 }));

			const { suggestions } = await fetchSuggestions(me, 'sidebar');

			expect(suggestions.map((suggestion) => suggestion.group)).toEqual(['mutual', 'popular', 'popular', 'popular', 'new']);
			expect(ids(suggestions)).toEqual(ids([mutual, ...populars.slice(0, 3), news[0]]));
		});

		it('fills the places the new group cannot fill when nobody qualifies as new', async () => {
			const { me, news } = await seedFullWorld();

			await UserModel.updateMany({ _id: { $in: news.map((newUser) => newUser._id) } }, { $set: { posts: [] } });

			const { suggestions } = await fetchSuggestions(me, 'sidebar');

			expect(suggestions).toHaveLength(5);
			expect(suggestions.some((suggestion) => suggestion.group === 'new')).toBe(false);
			expect(new Set(ids(suggestions)).size).toBe(5);
		});

		it('returns fewer suggestions than places, and no reserve, when there are not enough users', async () => {
			const me = await createUser('me');
			const others = await createUsers('other', 2);

			const { suggestions, reserve } = await fetchSuggestions(me, 'carousel');

			expect(new Set(ids(suggestions))).toEqual(new Set(ids(others)));
			expect(reserve).toEqual([]);
		});

		it('returns empty lists when the user is the only one there', async () => {
			const me = await createUser('me');

			const result = await fetchSuggestions(me, 'sidebar');

			expect(result).toEqual({ suggestions: [], reserve: [], isCarouselDismissed: false });
		});

		it('lists someone who qualifies for all three groups once, as a mutual', async () => {
			const me = await createUser('me');
			const followedA = await createUser('followedA');

			await follow(me, followedA);

			const everything = await createUser('everything', { joinedDaysAgo: 1, postCount: 1 });

			await follow(followedA, everything);
			await addFollowers(everything, 5);

			const result = await fetchSuggestions(me, 'sidebar');

			expect(listedIds(result).filter((listedId) => listedId === String(everything._id))).toHaveLength(1);
			expect(idsInGroup(result.suggestions, 'mutual')).toEqual(ids([everything]));
		});
	});

	describe('the reason a mutual is suggested', () => {
		it('names the most-followed of the people the user follows who follow them, and counts the others', async () => {
			const me = await createUser('me');
			const [followedA, followedB, followedC] = await createUsers('followed', 3);

			await follow(me, followedA);
			await follow(me, followedB);
			await follow(me, followedC);

			await addFollowers(followedA, 9);
			await addFollowers(followedB, 1);
			await addFollowers(followedC, 4);

			const [candidateX, candidateY, candidateZ] = await createUsers('candidate', 3);
			const outsider = await createUser('outsider');

			await addFollowers(outsider, 30);
			await followAll([followedA, followedB, followedC, outsider], candidateX);
			await followAll([followedB, followedC], candidateY);
			await follow(followedB, candidateZ);

			const { suggestions } = await fetchSuggestions(me, 'carousel');

			const mutuals = suggestions.filter((suggestion) => suggestion.group === 'mutual');

			expect(ids(mutuals)).toEqual(ids([candidateX, candidateY, candidateZ]));
			expect(mutuals.map((mutual) => [String(mutual.followedBy._id), mutual.followedBy.username, mutual.moreMutualCount])).toEqual([
				[String(followedA._id), 'followed1', 2],
				[String(followedC._id), 'followed3', 1],
				[String(followedB._id), 'followed2', 0],
			]);
		});

		it('carries the reason on mutuals in the reserve too, and none on the other groups', async () => {
			const { me } = await seedFullWorld();

			const { suggestions, reserve } = await fetchSuggestions(me, 'sidebar');

			const rows = [...suggestions, ...reserve];

			expect(rows.filter((row) => row.group === 'mutual').every((row) => row.followedBy?.username === 'followed1')).toBe(true);
			expect(rows.filter((row) => row.group !== 'mutual').every((row) => row.followedBy === undefined)).toBe(true);
			expect(reserve.every((row) => row.moreMutualCount === 0)).toBe(true);
		});
	});

	describe('the shape of a suggestion', () => {
		it('carries id, username, group and the profile picture url only, never the email or password', async () => {
			const me = await createUser('me');
			const other = await createUser('other');

			await UserModel.updateOne(
				{ _id: other._id },
				{ $set: { profilePicture: { imageUrl: 'https://cdn.example.com/other.jpg', imageIdentifier: 'secret-id' } } },
			);

			const { suggestions } = await fetchSuggestions(me, 'sidebar');

			expect(suggestions).toEqual([
				{ _id: other._id, username: 'other', profilePicture: { imageUrl: 'https://cdn.example.com/other.jpg' }, group: 'popular' },
			]);
		});
	});
});
