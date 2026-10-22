jest.mock('../models/userModel');
jest.mock('../models/userPostModel');
jest.mock('./commentService');
jest.mock('./imageStorageService');

const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const commentService = require('./commentService');
const imageStorageService = require('./imageStorageService');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');
const { addUserPost, getFollowedUsersPosts, likeUserPost, unlikeUserPost, updateUserPostCaption, deleteUserPost } = require('./userPostService');

const ActualUserPostModel = jest.requireActual('../models/userPostModel');

const OWNER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const OTHER_USER_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';

const buildPost = (overrides = {}) => ({
	_id: POST_ID,
	imageIdentifier: 'cloudinary-id-1',
	imageUrl: 'https://example.com/1.jpg',
	imageWidth: 1080,
	imageHeight: 1350,
	caption: 'old caption',
	userId: OWNER_ID,
	save: jest.fn().mockResolvedValue(undefined),
	...overrides,
});

const givenPostOwnedByCaller = (post = buildPost()) => {
	UserPostModel.findById = jest.fn().mockResolvedValue(post);
	UserModel.exists = jest.fn().mockResolvedValue({ _id: OWNER_ID });

	return post;
};

describe('userPostService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('ownership checks (shared by caption edit and delete)', () => {
		const actions = [
			['updateUserPostCaption', (args) => updateUserPostCaption({ ...args, caption: 'new caption' })],
			['deleteUserPost', (args) => deleteUserPost(args)],
		];

		describe.each(actions)('%s', (name, act) => {
			it('rejects with a 404 for a malformed post id without querying the database', async () => {
				UserPostModel.findById = jest.fn();

				await expect(act({ userPostId: 'not-an-object-id', userId: OWNER_ID })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
					message: 'Post not found',
				});

				expect(UserPostModel.findById).not.toHaveBeenCalled();
			});

			it('rejects with a 404 when no post has that id', async () => {
				UserPostModel.findById = jest.fn().mockResolvedValue(null);

				await expect(act({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
				});
			});

			it('rejects with a 403 when the post belongs to someone else, and changes nothing', async () => {
				const post = buildPost({ userId: OTHER_USER_ID });

				givenPostOwnedByCaller(post);

				await expect(act({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({
					statusCode: 403,
					code: ERROR_CODES.POST_FORBIDDEN,
				});

				expect(post.save).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(commentService.deleteCommentsForPost).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
				expect(UserModel.updateOne).not.toHaveBeenCalled();
			});

			it('rejects with a 403 when the image has no owner recorded', async () => {
				givenPostOwnedByCaller(buildPost({ userId: undefined }));

				await expect(act({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({
					statusCode: 403,
					code: ERROR_CODES.POST_FORBIDDEN,
				});
			});

			it("rejects with a 404 for an image owned by the caller that is not in the caller's posts (e.g. a profile picture)", async () => {
				const profilePicture = buildPost();

				UserPostModel.findById = jest.fn().mockResolvedValue(profilePicture);
				UserModel.exists = jest.fn().mockResolvedValue(null);

				await expect(act({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.POST_NOT_FOUND,
				});

				expect(UserModel.exists).toHaveBeenCalledWith({ _id: OWNER_ID, posts: POST_ID });
				expect(profilePicture.save).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});
		});
	});

	describe('addUserPost', () => {
		const imageFile = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: 'photo.jpg' };
		const uploadedImage = { imageIdentifier: 'new-cloudinary-id', imageUrl: 'https://example.com/new.jpg', imageWidth: 1920, imageHeight: 1080 };

		const buildUserPostModelMock = (save = jest.fn().mockResolvedValue(undefined)) => {
			UserPostModel.mockImplementation(function UserPostModelMock(data) {
				Object.assign(this, data);
				this._id = 'newPost1';
				this.save = save;
			});

			return save;
		};

		let consoleErrorSpy;

		beforeEach(() => {
			imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
			imageStorageService.discardUploadedImage.mockResolvedValue(undefined);
			UserPostModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
			UserModel.findByIdAndUpdate.mockResolvedValue({});
			consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		it('uploads the received file through the image storage service under the post image field', async () => {
			buildUserPostModelMock();

			await addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID);

			expect(imageStorageService.uploadImage).toHaveBeenCalledWith({ file: imageFile, fieldName: 'image' });
		});

		it('saves a post carrying the uploaded image, the caption and the owner', async () => {
			const save = buildUserPostModelMock();

			await addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID);

			expect(UserPostModel).toHaveBeenCalledWith({ ...uploadedImage, caption: 'Sunset', userId: OWNER_ID });
			expect(save).toHaveBeenCalledTimes(1);
		});

		it('saves the width and height from the uploaded image on the post', async () => {
			buildUserPostModelMock();

			await addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID);

			expect(UserPostModel).toHaveBeenCalledWith(expect.objectContaining({ imageWidth: 1920, imageHeight: 1080 }));
		});

		it("adds the new post to the owner's posts", async () => {
			buildUserPostModelMock();

			await addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID);

			expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(OWNER_ID, { $addToSet: { posts: 'newPost1' } });
		});

		it('resolves with the saved post', async () => {
			buildUserPostModelMock();

			const result = await addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID);

			expect(result).toMatchObject({ _id: 'newPost1', imageIdentifier: 'new-cloudinary-id', caption: 'Sunset' });
		});

		it('does not discard the image or remove the post on success', async () => {
			buildUserPostModelMock();

			await addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID);

			expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
			expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
		});

		it('propagates an upload failure unchanged and saves nothing', async () => {
			const uploadError = new AppError('Could not upload image', 502);

			buildUserPostModelMock();
			imageStorageService.uploadImage.mockRejectedValue(uploadError);

			await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toBe(uploadError);

			expect(UserPostModel).not.toHaveBeenCalled();
			expect(UserModel.findByIdAndUpdate).not.toHaveBeenCalled();
			expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
		});

		it.each([
			[
				'wrong type',
				new AppError('image: IMAGE_TYPE_INVALID', 400, {
					code: ERROR_CODES.IMAGE_TYPE_INVALID,
					fields: { image: ERROR_CODES.IMAGE_TYPE_INVALID },
				}),
			],
			[
				'over 10 MB',
				new AppError('image: IMAGE_TOO_LARGE', 413, { code: ERROR_CODES.IMAGE_TOO_LARGE, fields: { image: ERROR_CODES.IMAGE_TOO_LARGE } }),
			],
		])('surfaces the %s rejection with its status, code and field', async (_name, validationError) => {
			buildUserPostModelMock();
			imageStorageService.uploadImage.mockRejectedValue(validationError);

			await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toMatchObject({
				statusCode: validationError.statusCode,
				code: validationError.code,
				fields: validationError.fields,
			});
		});

		describe('when saving the post fails', () => {
			it('destroys the uploaded image and answers with a 500 that keeps the cause', async () => {
				const saveError = new Error('connection lost');

				buildUserPostModelMock(jest.fn().mockRejectedValue(saveError));

				await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toMatchObject({
					statusCode: 500,
					message: 'Could not save the user post',
					cause: saveError,
				});

				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-cloudinary-id');
			});

			it('does not touch the owner and removes the post record it tried to save', async () => {
				buildUserPostModelMock(jest.fn().mockRejectedValue(new Error('connection lost')));

				await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toBeInstanceOf(AppError);

				expect(UserModel.findByIdAndUpdate).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'newPost1' });
			});
		});

		describe('when adding the post to the owner fails', () => {
			it('removes the post record and destroys the uploaded image', async () => {
				const updateError = new Error('connection lost');

				buildUserPostModelMock();
				UserModel.findByIdAndUpdate.mockRejectedValue(updateError);

				await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toMatchObject({
					statusCode: 500,
					message: 'Could not save the user post',
					cause: updateError,
				});

				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'newPost1' });
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-cloudinary-id');
			});
		});

		describe('rollback resilience', () => {
			it('still destroys the image, logs, and answers with the 500 when removing the post record fails', async () => {
				const deleteError = new Error('delete failed');

				buildUserPostModelMock(jest.fn().mockRejectedValue(new Error('connection lost')));
				UserPostModel.deleteOne.mockRejectedValue(deleteError);

				await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toMatchObject({
					statusCode: 500,
					message: 'Could not save the user post',
				});

				expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('newPost1'), deleteError);
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-cloudinary-id');
			});

			it('removes the post record before destroying the image', async () => {
				const callOrder = [];

				buildUserPostModelMock(jest.fn().mockRejectedValue(new Error('connection lost')));
				UserPostModel.deleteOne.mockImplementation(async () => callOrder.push('record'));
				imageStorageService.discardUploadedImage.mockImplementation(async () => callOrder.push('image'));

				await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toBeInstanceOf(AppError);

				expect(callOrder).toEqual(['record', 'image']);
			});
		});
	});

	describe('addUserPost caption length', () => {
		const imageFile = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: 'photo.jpg' };

		beforeEach(() => {
			UserPostModel.validate.mockImplementation((...args) => ActualUserPostModel.validate(...args));
			imageStorageService.uploadImage.mockResolvedValue({
				imageIdentifier: 'new-cloudinary-id',
				imageUrl: 'https://example.com/new.jpg',
				imageWidth: 1080,
				imageHeight: 1350,
			});
			UserPostModel.mockImplementation(function UserPostModelMock(data) {
				Object.assign(this, data);
				this._id = 'newPost1';
				this.save = jest.fn().mockResolvedValue(undefined);
			});
			UserModel.findByIdAndUpdate.mockResolvedValue({});
		});

		it('rejects a 1001-character caption with a 400 CAPTION_TOO_LONG on the caption field', async () => {
			await expect(addUserPost({ caption: 'a'.repeat(1001), imageFile }, OWNER_ID)).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.CAPTION_TOO_LONG,
				fields: { caption: ERROR_CODES.CAPTION_TOO_LONG },
			});
		});

		it('does not upload the image when the caption is too long', async () => {
			await expect(addUserPost({ caption: 'a'.repeat(1001), imageFile }, OWNER_ID)).rejects.toBeInstanceOf(AppError);

			expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
		});

		it('saves nothing and touches nothing in the database when the caption is too long', async () => {
			await expect(addUserPost({ caption: 'a'.repeat(1001), imageFile }, OWNER_ID)).rejects.toBeInstanceOf(AppError);

			expect(UserPostModel).not.toHaveBeenCalled();
			expect(UserModel.findByIdAndUpdate).not.toHaveBeenCalled();
			expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
		});

		it('rejects a caption far over the limit the same way', async () => {
			await expect(addUserPost({ caption: 'a'.repeat(5000), imageFile }, OWNER_ID)).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.CAPTION_TOO_LONG,
			});
		});

		it('accepts a caption of exactly 1000 characters and uploads the image', async () => {
			await expect(addUserPost({ caption: 'a'.repeat(1000), imageFile }, OWNER_ID)).resolves.toMatchObject({ _id: 'newPost1' });

			expect(imageStorageService.uploadImage).toHaveBeenCalledTimes(1);
		});

		it('accepts a post without a caption', async () => {
			await expect(addUserPost({ imageFile }, OWNER_ID)).resolves.toMatchObject({ _id: 'newPost1' });

			expect(imageStorageService.uploadImage).toHaveBeenCalledTimes(1);
		});

		it('accepts an empty caption', async () => {
			await expect(addUserPost({ caption: '', imageFile }, OWNER_ID)).resolves.toMatchObject({ _id: 'newPost1' });
		});

		it('answers with a 500, without uploading, when the check itself fails unexpectedly', async () => {
			const checkError = new Error('connection lost');

			UserPostModel.validate.mockRejectedValue(checkError);

			await expect(addUserPost({ caption: 'Sunset', imageFile }, OWNER_ID)).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not save the user post',
				cause: checkError,
			});

			expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
		});
	});

	describe('getFollowedUsersPosts', () => {
		const FOLLOWED_IDS = ['64b7f0a1c2d3e4f5a6b7c8a1', '64b7f0a1c2d3e4f5a6b7c8a2'];

		const buildPostDoc = (id, authorUsername = 'alice') => {
			const data = { _id: id, imageUrl: `https://example.com/${id}.jpg`, likes: [], userId: { _id: 'author1', username: authorUsername } };

			return { _id: id, toObject: () => ({ ...data }) };
		};

		const givenFeed = ({ following = FOLLOWED_IDS, posts = [], commentCounts = {}, previewComments = {} } = {}) => {
			const populate = jest.fn().mockResolvedValue(posts);
			const sort = jest.fn().mockReturnValue({ populate });
			const select = jest.fn().mockResolvedValue({ following });

			UserModel.findById = jest.fn().mockReturnValue({ select });
			UserPostModel.find = jest.fn().mockReturnValue({ sort });
			commentService.getCommentCountsForPosts.mockResolvedValue(commentCounts);
			commentService.getPreviewCommentsForPosts.mockResolvedValue(previewComments);

			return { sort, populate, select };
		};

		it('reads only the followed user ids of the requesting user', async () => {
			const { select } = givenFeed();

			await getFollowedUsersPosts(OWNER_ID);

			expect(UserModel.findById).toHaveBeenCalledWith(OWNER_ID);
			expect(select).toHaveBeenCalledWith({ following: 1 });
		});

		it('loads the posts of the followed users only', async () => {
			givenFeed();

			await getFollowedUsersPosts(OWNER_ID);

			expect(UserPostModel.find).toHaveBeenCalledWith({ userId: { $in: FOLLOWED_IDS } });
		});

		it('sorts the posts newest first, ordering equal timestamps by id', async () => {
			const { sort } = givenFeed();

			await getFollowedUsersPosts(OWNER_ID);

			expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
		});

		it('populates the author with only the username and profile picture', async () => {
			const { populate } = givenFeed();

			await getFollowedUsersPosts(OWNER_ID);

			expect(populate).toHaveBeenCalledWith({ path: 'userId', select: 'username profilePicture' });
		});

		it('returns the posts in the order the query gave them, with the author populated', async () => {
			givenFeed({ posts: [buildPostDoc('p3', 'carol'), buildPostDoc('p2', 'bob'), buildPostDoc('p1', 'alice')] });

			const feed = await getFollowedUsersPosts(OWNER_ID);

			expect(feed.map((post) => post._id)).toEqual(['p3', 'p2', 'p1']);
			expect(feed.map((post) => post.userId.username)).toEqual(['carol', 'bob', 'alice']);
		});

		it('adds the comment count of each post, defaulting to 0', async () => {
			givenFeed({ posts: [buildPostDoc('p2'), buildPostDoc('p1')], commentCounts: { p2: 4 } });

			const feed = await getFollowedUsersPosts(OWNER_ID);

			expect(feed.map((post) => post.commentsCount)).toEqual([4, 0]);
		});

		it('adds the preview comments of each post, defaulting to an empty list', async () => {
			const preview = [{ _id: 'c1' }, { _id: 'c2' }];

			givenFeed({ posts: [buildPostDoc('p2'), buildPostDoc('p1')], previewComments: { p2: preview } });

			const feed = await getFollowedUsersPosts(OWNER_ID);

			expect(feed.map((post) => post.previewComments)).toEqual([preview, []]);
		});

		it('asks for the counts and previews of all the posts in one call each', async () => {
			givenFeed({ posts: [buildPostDoc('p2'), buildPostDoc('p1')] });

			await getFollowedUsersPosts(OWNER_ID);

			expect(commentService.getCommentCountsForPosts).toHaveBeenCalledTimes(1);
			expect(commentService.getCommentCountsForPosts).toHaveBeenCalledWith(['p2', 'p1']);
			expect(commentService.getPreviewCommentsForPosts).toHaveBeenCalledTimes(1);
			expect(commentService.getPreviewCommentsForPosts).toHaveBeenCalledWith(['p2', 'p1']);
		});

		it('returns an empty list when the user follows nobody', async () => {
			givenFeed({ following: [] });

			await expect(getFollowedUsersPosts(OWNER_ID)).resolves.toEqual([]);
		});

		it('returns an empty list when the followed users have no posts', async () => {
			givenFeed({ posts: [] });

			await expect(getFollowedUsersPosts(OWNER_ID)).resolves.toEqual([]);
		});

		describe('when the user of the token no longer exists', () => {
			const givenMissingUser = () => {
				const select = jest.fn().mockResolvedValue(null);

				UserModel.findById = jest.fn().mockReturnValue({ select });
				UserPostModel.find = jest.fn();
			};

			it('rejects with a 401 UNAUTHENTICATED error', async () => {
				givenMissingUser();

				await expect(getFollowedUsersPosts(OWNER_ID)).rejects.toMatchObject({
					statusCode: 401,
					code: ERROR_CODES.UNAUTHENTICATED,
				});
			});

			it('rejects with an AppError, not a 500', async () => {
				givenMissingUser();

				await expect(getFollowedUsersPosts(OWNER_ID)).rejects.toBeInstanceOf(AppError);
			});

			it('loads no posts and no comment data', async () => {
				givenMissingUser();

				await getFollowedUsersPosts(OWNER_ID).catch(() => undefined);

				expect(UserPostModel.find).not.toHaveBeenCalled();
				expect(commentService.getCommentCountsForPosts).not.toHaveBeenCalled();
				expect(commentService.getPreviewCommentsForPosts).not.toHaveBeenCalled();
			});
		});

		it('wraps an unexpected database failure in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			givenFeed();
			UserPostModel.find = jest.fn().mockImplementation(() => {
				throw dbError;
			});

			await expect(getFollowedUsersPosts(OWNER_ID)).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not load followed users posts',
				cause: dbError,
			});
		});

		it('rethrows an AppError from the comment service unchanged', async () => {
			const commentError = new AppError('Could not load comment counts', 500);

			givenFeed({ posts: [buildPostDoc('p1')] });
			commentService.getCommentCountsForPosts.mockRejectedValue(commentError);

			await expect(getFollowedUsersPosts(OWNER_ID)).rejects.toBe(commentError);
		});
	});

	describe.each([
		['likeUserPost', likeUserPost, 'userWhoLikedId', { $addToSet: { likes: OTHER_USER_ID } }, 'Could not like the post'],
		['unlikeUserPost', unlikeUserPost, 'userWhoUnlikedId', { $pull: { likes: OTHER_USER_ID } }, 'Could not unlike the post'],
	])('%s', (_name, action, userKey, expectedUpdate, failureMessage) => {
		const run = (userPostId = POST_ID) => action({ userPostId, [userKey]: OTHER_USER_ID });

		it('updates the likes of the post with the right operator and resolves with the updated post', async () => {
			const updatedPost = { _id: POST_ID, likes: [OTHER_USER_ID] };

			UserPostModel.findOneAndUpdate = jest.fn().mockResolvedValue(updatedPost);

			const result = await run();

			expect(UserPostModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: POST_ID }, expectedUpdate, { new: true });
			expect(result).toBe(updatedPost);
		});

		it('rejects a malformed post id with a 404 POST_NOT_FOUND, without querying the database', async () => {
			UserPostModel.findOneAndUpdate = jest.fn();

			await expect(run('not-an-object-id')).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.POST_NOT_FOUND,
			});

			expect(UserPostModel.findOneAndUpdate).not.toHaveBeenCalled();
		});

		it('rejects a post that does not exist with a 404 POST_NOT_FOUND instead of resolving with null', async () => {
			UserPostModel.findOneAndUpdate = jest.fn().mockResolvedValue(null);

			await expect(run()).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.POST_NOT_FOUND,
			});
		});

		it('wraps an unexpected database failure in a 500 AppError that keeps the cause', async () => {
			const dbError = new Error('connection lost');

			UserPostModel.findOneAndUpdate = jest.fn().mockRejectedValue(dbError);

			await expect(run()).rejects.toMatchObject({
				statusCode: 500,
				message: failureMessage,
				cause: dbError,
			});
		});
	});

	describe('liking a post twice', () => {
		it('adds the user with $addToSet, which keeps the likes free of duplicates, and never with $push', async () => {
			UserPostModel.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: POST_ID, likes: [OTHER_USER_ID] });

			await likeUserPost({ userPostId: POST_ID, userWhoLikedId: OTHER_USER_ID });
			await likeUserPost({ userPostId: POST_ID, userWhoLikedId: OTHER_USER_ID });

			UserPostModel.findOneAndUpdate.mock.calls.forEach(([, update]) => {
				expect(update).toEqual({ $addToSet: { likes: OTHER_USER_ID } });
				expect(update).not.toHaveProperty('$push');
			});
		});
	});

	describe('updateUserPostCaption', () => {
		it('saves the new caption on the owned post and returns it', async () => {
			const post = givenPostOwnedByCaller();

			const result = await updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption: 'new caption' });

			expect(post.caption).toBe('new caption');
			expect(post.save).toHaveBeenCalledTimes(1);
			expect(result).toBe(post);
		});

		it('leaves the image fields unchanged', async () => {
			const post = givenPostOwnedByCaller();

			await updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption: 'new caption' });

			expect(post.imageUrl).toBe('https://example.com/1.jpg');
			expect(post.imageIdentifier).toBe('cloudinary-id-1');
		});

		it('accepts an empty caption', async () => {
			const post = givenPostOwnedByCaller();

			await updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption: '' });

			expect(post.caption).toBe('');
			expect(post.save).toHaveBeenCalledTimes(1);
		});

		it.each([[undefined], [null], [42], [{ text: 'x' }], [['a']]])(
			'rejects a non-string caption (%p) with a 400 and fields.caption',
			async (caption) => {
				const post = givenPostOwnedByCaller();

				await expect(updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.CAPTION_INVALID,
					fields: { caption: ERROR_CODES.CAPTION_INVALID },
				});

				expect(post.save).not.toHaveBeenCalled();
			},
		);

		it('checks the caption type before looking the post up', async () => {
			UserPostModel.findById = jest.fn();

			await expect(updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption: 5 })).rejects.toMatchObject({
				statusCode: 400,
			});

			expect(UserPostModel.findById).not.toHaveBeenCalled();
		});

		it('wraps an unexpected save failure in a 500 AppError', async () => {
			const dbError = new Error('connection lost');
			const post = givenPostOwnedByCaller(buildPost({ save: jest.fn().mockRejectedValue(dbError) }));

			await expect(updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption: 'x' })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not update the post',
				cause: dbError,
			});

			expect(post.save).toHaveBeenCalledTimes(1);
		});

		it('rethrows an AppError unchanged', async () => {
			UserPostModel.findById = jest.fn().mockResolvedValue(null);

			await expect(updateUserPostCaption({ userPostId: POST_ID, userId: OWNER_ID, caption: 'x' })).rejects.toBeInstanceOf(AppError);
		});
	});

	describe('deleteUserPost', () => {
		it('destroys the Cloudinary image, deletes the comments, deletes the post and pulls it from the owner', async () => {
			givenPostOwnedByCaller();

			await deleteUserPost({ userPostId: POST_ID, userId: OWNER_ID });

			expect(imageStorageService.deleteImage).toHaveBeenCalledWith('cloudinary-id-1');
			expect(commentService.deleteCommentsForPost).toHaveBeenCalledWith({ userPostId: POST_ID });
			expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: POST_ID });
			expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: OWNER_ID }, { $pull: { posts: POST_ID } });
		});

		it('destroys the Cloudinary image before changing anything in the database', async () => {
			const callOrder = [];

			givenPostOwnedByCaller();
			imageStorageService.deleteImage.mockImplementation(async () => callOrder.push('cloudinary'));
			commentService.deleteCommentsForPost.mockImplementation(async () => callOrder.push('comments'));
			UserPostModel.deleteOne.mockImplementation(async () => callOrder.push('post'));
			UserModel.updateOne.mockImplementation(async () => callOrder.push('owner'));

			await deleteUserPost({ userPostId: POST_ID, userId: OWNER_ID });

			expect(callOrder).toEqual(['cloudinary', 'comments', 'post', 'owner']);
		});

		it('resolves without a value', async () => {
			givenPostOwnedByCaller();

			await expect(deleteUserPost({ userPostId: POST_ID, userId: OWNER_ID })).resolves.toBeUndefined();
		});

		it('surfaces a 502 and makes no database changes when the Cloudinary destroy fails', async () => {
			givenPostOwnedByCaller();
			imageStorageService.deleteImage.mockRejectedValue(new AppError('Could not delete image cloudinary-id-1', 502));

			await expect(deleteUserPost({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({ statusCode: 502 });

			expect(commentService.deleteCommentsForPost).not.toHaveBeenCalled();
			expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			expect(UserModel.updateOne).not.toHaveBeenCalled();
		});

		it('wraps an unexpected database failure in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			givenPostOwnedByCaller();
			UserPostModel.deleteOne.mockRejectedValue(dbError);

			await expect(deleteUserPost({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not delete the post',
				cause: dbError,
			});

			expect(UserModel.updateOne).not.toHaveBeenCalled();
		});

		it('surfaces a failure to delete the comments and keeps the post', async () => {
			givenPostOwnedByCaller();
			commentService.deleteCommentsForPost.mockRejectedValue(new AppError('Could not delete comments', 500));

			await expect(deleteUserPost({ userPostId: POST_ID, userId: OWNER_ID })).rejects.toMatchObject({ statusCode: 500 });

			expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			expect(UserModel.updateOne).not.toHaveBeenCalled();
		});
	});
});
