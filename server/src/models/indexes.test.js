const constants = require('../config/constants');
const CommentModel = require('./commentModel');
const UserModel = require('./userModel');
const UserPostModel = require('./userPostModel');

const hasIndex = (model, fields) => model.schema.indexes().some(([keys]) => JSON.stringify(keys) === JSON.stringify(fields));

describe('the indexes behind the visitor rules and the feed', () => {
	it('indexes comments by their author, for the visitor visibility lookups', () => {
		expect(hasIndex(CommentModel, { userId: 1 })).toBe(true);
	});

	it('keeps the existing comment index by post and time', () => {
		expect(hasIndex(CommentModel, { userPostId: 1, createdAt: 1 })).toBe(true);
	});

	it('indexes posts by author, newest first, with the id as the tie-break, for the paged feed', () => {
		expect(hasIndex(UserPostModel, { userId: 1, createdAt: -1, _id: -1 })).toBe(true);
	});

	it('indexes users by account type', () => {
		expect(UserModel.schema.path('accountType').options.index).toBe(true);
	});
});

describe('the shared constants', () => {
	it('has 1000 milliseconds in a second', () => {
		expect(constants.MS_PER_SECOND).toBe(1000);
	});

	it('knows the duplicate key error code of MongoDB', () => {
		expect(constants.DUPLICATE_KEY_ERROR_CODE).toBe(11000);
	});

	it('protects the shared avatar pool, and only it, from deletion', () => {
		expect(constants.SHARED_IMAGE_PREFIXES).toEqual(['demo-users/visitor-avatars/']);
	});

	it('pages the feed 30 posts at a time', () => {
		expect(constants.FEED_POSTS_PAGE_SIZE).toBe(30);
	});
});
