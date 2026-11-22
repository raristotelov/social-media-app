const mongoose = require('mongoose');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const UserModel = require('../models/userModel');
const StoryModel = require('../models/storyModel');
const StoryViewModel = require('../models/storyViewModel');
const { ERROR_CODES } = require('../config/errorCodes');
const constants = require('../config/constants');
const { getSuggestions } = require('./suggestionService');
const { withStorySummaries, getUserStory } = require('./storyService');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const JWT_SECRET = 'story-rings-integration-test-secret';
const HOUR_MS = 60 * 60 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

describe('story rings against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;
	let storyCounter;
	let viewer;
	let poster;
	let other;

	const createUser = (username, accountType = 'user') =>
		UserModel.create({ email: `${username}@example.com`, username, password: 'hashed-password', accountType });

	const createStory = (author, { hoursOld = 1 } = {}) => {
		storyCounter += 1;

		return StoryModel.create({
			imageIdentifier: `story-${storyCounter}`,
			imageUrl: `https://cdn.example.com/story-${storyCounter}.jpg`,
			imageWidth: 1080,
			imageHeight: 1920,
			userId: author._id,
			createdAt: new Date(Date.now() - hoursOld * HOUR_MS),
		});
	};

	const watch = (story, watcher) => StoryViewModel.create({ storyId: story._id, viewerId: watcher._id });

	const get = (path, user) =>
		fetch(`${baseUrl}${path}`, {
			headers: user
				? { Cookie: `${constants.AUTH_COOKIE_NAME}=${JWT.sign({ userId: String(user._id), username: user.username }, JWT_SECRET)}` }
				: {},
		});

	const storyOf = (users, username) => users.find((user) => user.username === username).story;

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await Promise.all([UserModel.init(), StoryModel.init(), StoryViewModel.init()]);

		server = await new Promise((resolve) => {
			const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
		});
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		process.env.JWT_SECRET = originalJwtSecret;

		await new Promise((resolve) => server.close(resolve));
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		storyCounter = 0;
		jest.spyOn(console, 'error').mockImplementation(() => {});

		await Promise.all([UserModel.deleteMany({}), StoryModel.deleteMany({}), StoryViewModel.deleteMany({})]);

		viewer = await createUser('viewer');
		poster = await createUser('poster');
		other = await createUser('other');
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('withStorySummaries', () => {
		const summaries = async (users, viewerId) =>
			withStorySummaries({ users: users.map((user) => user.toObject()), viewerId: viewerId && viewerId._id });

		it('gives a user without any story a null summary', async () => {
			const [row] = await summaries([poster], viewer);

			expect(row.story).toBeNull();
		});

		it('ignores stories older than 24 hours', async () => {
			await createStory(poster, { hoursOld: 25 });

			const [row] = await summaries([poster], viewer);

			expect(row.story).toBeNull();
		});

		it('counts only the active story when a user has an expired one too', async () => {
			const expired = await createStory(poster, { hoursOld: 30 });

			await createStory(poster, { hoursOld: 1 });
			await watch(expired, viewer);

			const [row] = await summaries([poster], viewer);

			expect(row.story).toEqual({ isWatched: false });
		});

		it('marks an unwatched story as not watched', async () => {
			await createStory(poster);

			const [row] = await summaries([poster], viewer);

			expect(row.story).toEqual({ isWatched: false });
		});

		it('marks a partly watched user as not watched', async () => {
			const first = await createStory(poster, { hoursOld: 3 });

			await createStory(poster, { hoursOld: 2 });
			await watch(first, viewer);

			const [row] = await summaries([poster], viewer);

			expect(row.story).toEqual({ isWatched: false });
		});

		it('marks a user as watched once every active story is watched', async () => {
			const first = await createStory(poster, { hoursOld: 3 });
			const second = await createStory(poster, { hoursOld: 2 });

			await watch(first, viewer);
			await watch(second, viewer);

			const [row] = await summaries([poster], viewer);

			expect(row.story).toEqual({ isWatched: true });
		});

		it('does not take another viewer watching as the viewer watching', async () => {
			const story = await createStory(poster);

			await watch(story, other);

			const [row] = await summaries([poster], viewer);

			expect(row.story).toEqual({ isWatched: false });
		});

		it('marks the viewer own story as watched even though nobody recorded a view', async () => {
			await createStory(viewer);

			const [row] = await summaries([viewer], viewer);

			expect(row.story).toEqual({ isWatched: true });
		});

		it('marks every story as not watched for a guest', async () => {
			const story = await createStory(poster);

			await watch(story, viewer);

			const [row] = await summaries([poster], undefined);

			expect(row.story).toEqual({ isWatched: false });
		});

		it('summarises a mixed list in one call, each user on their own stories', async () => {
			const posterStory = await createStory(poster);

			await createStory(other);
			await createStory(viewer);
			await watch(posterStory, viewer);

			const rows = await summaries([poster, other, viewer], viewer);

			expect(rows.map((row) => row.story)).toEqual([{ isWatched: true }, { isWatched: false }, { isWatched: true }]);
		});

		it('runs one stories query and one views query however many users there are', async () => {
			const storyFind = jest.spyOn(StoryModel, 'find');
			const viewFind = jest.spyOn(StoryViewModel, 'find');
			const users = [poster, other, viewer];

			for (const user of users) {
				await createStory(user);
			}

			storyFind.mockClear();

			await summaries(users, viewer);

			expect(storyFind).toHaveBeenCalledTimes(1);
			expect(viewFind).toHaveBeenCalledTimes(1);
		});
	});

	describe('getUserStory', () => {
		it('answers no story for a user without an active story', async () => {
			await createStory(poster, { hoursOld: 25 });

			await expect(getUserStory({ userId: String(poster._id), viewerId: String(viewer._id) })).resolves.toEqual({ story: null, stories: [] });
		});

		it("lists another user's active stories oldest first, each with whether the viewer has watched it", async () => {
			const first = await createStory(poster, { hoursOld: 5 });
			const second = await createStory(poster, { hoursOld: 2 });

			await createStory(poster, { hoursOld: 26 });
			await watch(first, viewer);

			const { story, stories } = await getUserStory({ userId: String(poster._id), viewerId: String(viewer._id) });

			expect(story).toEqual({ isWatched: false });
			expect(stories.map((entry) => [String(entry._id), entry.isWatched])).toEqual([
				[String(first._id), true],
				[String(second._id), false],
			]);
		});

		it('never exposes the storage identifier', async () => {
			await createStory(poster);

			const { stories } = await getUserStory({ userId: String(poster._id), viewerId: String(viewer._id) });

			expect(stories[0]).not.toHaveProperty('imageIdentifier');
		});

		it('answers a grey ring once every story has been watched', async () => {
			const story = await createStory(poster);

			await watch(story, viewer);

			const { story: summary } = await getUserStory({ userId: String(poster._id), viewerId: String(viewer._id) });

			expect(summary).toEqual({ isWatched: true });
		});

		it('answers a guest a red ring with no stories', async () => {
			await createStory(poster);

			await expect(getUserStory({ userId: String(poster._id), viewerId: undefined })).resolves.toEqual({
				story: { isWatched: false },
				stories: [],
			});
		});

		it('answers the owner a grey ring with the viewers count of each story', async () => {
			const first = await createStory(viewer, { hoursOld: 3 });

			await createStory(viewer, { hoursOld: 1 });
			await watch(first, poster);
			await watch(first, other);

			const { story, stories } = await getUserStory({ userId: String(viewer._id), viewerId: String(viewer._id) });

			expect(story).toEqual({ isWatched: true });
			expect(stories.map((entry) => entry.viewersCount)).toEqual([2, 0]);
		});

		it('leaves hidden visitors out of the owner viewers count', async () => {
			const visitor = await createUser('visitor', 'demo');
			const story = await createStory(viewer);

			await watch(story, poster);
			await watch(story, visitor);

			const { stories } = await getUserStory({ userId: String(viewer._id), viewerId: String(viewer._id) });

			expect(stories[0].viewersCount).toBe(1);
		});

		it('answers 404 USER_NOT_FOUND for a hidden visitor', async () => {
			const visitor = await createUser('visitor', 'demo');

			await createStory(visitor);

			await expect(getUserStory({ userId: String(visitor._id), viewerId: String(viewer._id) })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.USER_NOT_FOUND,
			});
		});

		it('answers 404 USER_NOT_FOUND for a hidden visitor to a guest too', async () => {
			const visitor = await createUser('visitor', 'demo');

			await createStory(visitor);

			await expect(getUserStory({ userId: String(visitor._id), viewerId: undefined })).rejects.toMatchObject({ statusCode: 404 });
		});

		it('lets a visitor see their own story', async () => {
			const visitor = await createUser('visitor', 'demo');

			await createStory(visitor);

			const { story } = await getUserStory({ userId: String(visitor._id), viewerId: String(visitor._id) });

			expect(story).toEqual({ isWatched: true });
		});

		it('answers 404 USER_NOT_FOUND for a malformed id', async () => {
			await expect(getUserStory({ userId: 'not-an-id', viewerId: String(viewer._id) })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.USER_NOT_FOUND,
			});
		});
	});

	describe('GET /users/:userId/story', () => {
		it('answers a guest without a token: a red ring and no stories', async () => {
			await createStory(poster);

			const response = await get(`/users/${poster._id}/story`);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ story: { isWatched: false }, stories: [] });
		});

		it('treats an invalid token as a guest', async () => {
			await createStory(poster);

			const response = await fetch(`${baseUrl}/users/${poster._id}/story`, {
				headers: { Cookie: `${constants.AUTH_COOKIE_NAME}=not.a.token` },
			});

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toEqual({ story: { isWatched: false }, stories: [] });
		});

		it('answers a signed-in user the stories with their watched state', async () => {
			const story = await createStory(poster);

			await watch(story, viewer);

			const response = await get(`/users/${poster._id}/story`, viewer);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.story).toEqual({ isWatched: true });
			expect(body.stories).toHaveLength(1);
			expect(body.stories[0]).toMatchObject({ _id: String(story._id), userId: String(poster._id), isWatched: true });
		});

		it('answers no story as null for a user without one', async () => {
			const response = await get(`/users/${poster._id}/story`, viewer);

			await expect(response.json()).resolves.toEqual({ story: null, stories: [] });
		});

		it('answers 404 USER_NOT_FOUND for a malformed id', async () => {
			const response = await get('/users/not-an-id/story', viewer);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('answers 404 USER_NOT_FOUND for a hidden visitor', async () => {
			const visitor = await createUser('visitor', 'demo');

			await createStory(visitor);

			const response = await get(`/users/${visitor._id}/story`, viewer);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({ code: ERROR_CODES.USER_NOT_FOUND });
		});

		it('answers 404 for a hidden visitor to a guest as well', async () => {
			const visitor = await createUser('visitor', 'demo');

			await createStory(visitor);

			const response = await get(`/users/${visitor._id}/story`);

			expect(response.status).toBe(404);
		});
	});

	describe('search rows', () => {
		it('carry a null story for a user without one', async () => {
			const response = await get('/users?searchWord=poster', viewer);

			const [row] = await response.json();

			expect(row.story).toBeNull();
		});

		it('carry a red ring for a user with an unwatched story', async () => {
			await createStory(poster);

			const [row] = await (await get('/users?searchWord=poster', viewer)).json();

			expect(row.story).toEqual({ isWatched: false });
		});

		it('carry a grey ring once the searching user has watched everything', async () => {
			const story = await createStory(poster);

			await watch(story, viewer);

			const [row] = await (await get('/users?searchWord=poster', viewer)).json();

			expect(row.story).toEqual({ isWatched: true });
		});

		it('carry a red ring to a guest, whatever anyone has watched', async () => {
			const story = await createStory(poster);

			await watch(story, viewer);

			const [row] = await (await get('/users?searchWord=poster')).json();

			expect(row.story).toEqual({ isWatched: false });
		});

		it('show the searching user own ring as grey', async () => {
			await createStory(viewer);

			const [row] = await (await get('/users?searchWord=viewer', viewer)).json();

			expect(row.story).toEqual({ isWatched: true });
		});

		it('summarise every row of a wider search on its own stories', async () => {
			const ringed = await createUser('match-ringed');

			await createUser('match-plain');
			await createStory(ringed);

			const rows = await (await get('/users?searchWord=match-', viewer)).json();

			expect(rows).toHaveLength(2);
			expect(storyOf(rows, 'match-ringed')).toEqual({ isWatched: false });
			expect(storyOf(rows, 'match-plain')).toBeNull();
		});
	});

	describe('suggestion rows', () => {
		const fetchSuggestions = (user, placement = 'sidebar') => getSuggestions({ userId: user._id, placement });

		it('carry a null story for a candidate without one', async () => {
			const { suggestions } = await fetchSuggestions(viewer);

			expect(storyOf(suggestions, 'poster')).toBeNull();
		});

		it('carry a red ring for a candidate with an unwatched story', async () => {
			await createStory(poster);

			const { suggestions } = await fetchSuggestions(viewer);

			expect(storyOf(suggestions, 'poster')).toEqual({ isWatched: false });
		});

		it('carry a grey ring once the user has watched the candidate stories', async () => {
			const story = await createStory(poster);

			await watch(story, viewer);

			const { suggestions } = await fetchSuggestions(viewer);

			expect(storyOf(suggestions, 'poster')).toEqual({ isWatched: true });
		});

		it('carry the story on reserve rows too', async () => {
			const crowd = [];

			for (let index = 0; index < 12; index += 1) {
				crowd.push(await createUser(`crowd${index}`));
			}

			for (const candidate of crowd) {
				await createStory(candidate);
			}

			const { suggestions, reserve } = await fetchSuggestions(viewer);

			expect(reserve.length).toBeGreaterThan(0);
			expect(
				[...suggestions, ...reserve].filter((row) => row.username.startsWith('crowd')).every((row) => row.story?.isWatched === false),
			).toBe(true);
		});

		it('ignore expired stories', async () => {
			await createStory(poster, { hoursOld: 25 });

			const { suggestions } = await fetchSuggestions(viewer);

			expect(storyOf(suggestions, 'poster')).toBeNull();
		});
	});
});
