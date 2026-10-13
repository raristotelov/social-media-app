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
const { addUserPost, updateUserPostCaption, deleteUserPost } = require('./userPostService');

const OWNER_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
const OTHER_USER_ID = '64b7f0a1c2d3e4f5a6b7c8d2';
const POST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';

const buildPost = (overrides = {}) => ({
	_id: POST_ID,
	imageIdentifier: 'cloudinary-id-1',
	imageUrl: 'https://example.com/1.jpg',
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
		const uploadedImage = { imageIdentifier: 'new-cloudinary-id', imageUrl: 'https://example.com/new.jpg' };

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
