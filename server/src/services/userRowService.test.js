jest.mock('../models/userModel');

const UserModel = require('../models/userModel');
const { USER_ROW_PROJECTION, getUserRowsInOrder } = require('./userRowService');

const FIRST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
const SECOND_ID = '64b7f0a1c2d3e4f5a6b7c8e2';
const THIRD_ID = '64b7f0a1c2d3e4f5a6b7c8e3';

const buildRow = (_id, overrides = {}) => ({ _id, username: `user-${_id}`, ...overrides });

describe('userRowService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('USER_ROW_PROJECTION', () => {
		it('keeps only the id, username and profile picture url', () => {
			expect(Object.keys(USER_ROW_PROJECTION).sort()).toEqual(['_id', 'profilePicture.imageUrl', 'username']);
		});

		it('does not expose email, password, bio, posts or follower lists', () => {
			['email', 'password', 'bio', 'posts', 'followers', 'following'].forEach((field) => expect(USER_ROW_PROJECTION).not.toHaveProperty(field));
		});
	});

	describe('getUserRowsInOrder', () => {
		it('matches the given ids and projects them with USER_ROW_PROJECTION', async () => {
			UserModel.aggregate = jest.fn().mockResolvedValue([]);

			await getUserRowsInOrder([FIRST_ID, SECOND_ID]);

			expect(UserModel.aggregate).toHaveBeenCalledWith([
				{ $match: { _id: { $in: [FIRST_ID, SECOND_ID] } } },
				{ $project: USER_ROW_PROJECTION },
			]);
		});

		it('returns the rows in the order of the given ids, whatever order the database answers in', async () => {
			UserModel.aggregate = jest.fn().mockResolvedValue([buildRow(FIRST_ID), buildRow(SECOND_ID), buildRow(THIRD_ID)]);

			const result = await getUserRowsInOrder([THIRD_ID, FIRST_ID, SECOND_ID]);

			expect(result.map((row) => row._id)).toEqual([THIRD_ID, FIRST_ID, SECOND_ID]);
		});

		it('skips ids with no matching user', async () => {
			UserModel.aggregate = jest.fn().mockResolvedValue([buildRow(SECOND_ID)]);

			const result = await getUserRowsInOrder([FIRST_ID, SECOND_ID, THIRD_ID]);

			expect(result.map((row) => row._id)).toEqual([SECOND_ID]);
		});

		it('matches rows to ids by their string form, so ObjectId-like values line up with strings', async () => {
			UserModel.aggregate = jest.fn().mockResolvedValue([buildRow({ toString: () => FIRST_ID })]);

			const result = await getUserRowsInOrder([FIRST_ID]);

			expect(result).toHaveLength(1);
		});

		it('returns the rows as projected, without adding fields', async () => {
			const row = buildRow(FIRST_ID, { profilePicture: { imageUrl: 'https://example.com/one.jpg' } });

			UserModel.aggregate = jest.fn().mockResolvedValue([row]);

			const result = await getUserRowsInOrder([FIRST_ID]);

			expect(result).toEqual([row]);
		});

		it('returns an empty list for no ids', async () => {
			UserModel.aggregate = jest.fn().mockResolvedValue([]);

			await expect(getUserRowsInOrder([])).resolves.toEqual([]);
		});

		it('lets a database failure reject', async () => {
			const dbError = new Error('connection lost');

			UserModel.aggregate = jest.fn().mockRejectedValue(dbError);

			await expect(getUserRowsInOrder([FIRST_ID])).rejects.toBe(dbError);
		});
	});
});
