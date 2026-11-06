const UserPostModel = require('./userPostModel');
const constants = require('../config/constants');

const buildPost = (overrides = {}) => ({
	imageIdentifier: 'cloudinary-id-1',
	imageUrl: 'https://example.com/1.jpg',
	imageWidth: 1080,
	imageHeight: 1350,
	caption: 'A caption',
	...overrides,
});

describe('UserPostModel', () => {
	describe('caption length', () => {
		it('allows a caption of exactly the maximum length', async () => {
			const post = new UserPostModel(buildPost({ caption: 'a'.repeat(constants.MAX_CAPTION_LENGTH) }));

			await expect(post.validate()).resolves.toBeUndefined();
		});

		it('sets the maximum to 1000 characters', () => {
			expect(constants.MAX_CAPTION_LENGTH).toBe(1000);
		});

		it('rejects a caption one character over the maximum', async () => {
			const post = new UserPostModel(buildPost({ caption: 'a'.repeat(constants.MAX_CAPTION_LENGTH + 1) }));

			await expect(post.validate()).rejects.toMatchObject({ errors: { caption: { kind: 'maxlength' } } });
		});

		it('allows an empty caption', async () => {
			const post = new UserPostModel(buildPost({ caption: '' }));

			await expect(post.validate()).resolves.toBeUndefined();
		});

		it('allows a post without a caption', async () => {
			const post = new UserPostModel(buildPost({ caption: undefined }));

			await expect(post.validate()).resolves.toBeUndefined();
		});

		it('rejects a too long caption when only the caption is validated, as the upload check does', async () => {
			await expect(UserPostModel.validate({ caption: 'a'.repeat(constants.MAX_CAPTION_LENGTH + 1) }, ['caption'])).rejects.toMatchObject({
				name: 'ValidationError',
			});
		});

		it('accepts a caption of the maximum length when only the caption is validated', async () => {
			await expect(UserPostModel.validate({ caption: 'a'.repeat(constants.MAX_CAPTION_LENGTH) }, ['caption'])).resolves.toBeDefined();
		});
	});

	describe('image dimensions', () => {
		describe.each(['imageWidth', 'imageHeight'])('%s', (field) => {
			it('is required', async () => {
				const post = new UserPostModel(buildPost({ [field]: undefined }));

				await expect(post.validate()).rejects.toMatchObject({ errors: { [field]: { kind: 'required' } } });
			});

			it('rejects 0', async () => {
				const post = new UserPostModel(buildPost({ [field]: 0 }));

				await expect(post.validate()).rejects.toMatchObject({ errors: { [field]: { kind: 'min' } } });
			});

			it('rejects a negative value', async () => {
				const post = new UserPostModel(buildPost({ [field]: -5 }));

				await expect(post.validate()).rejects.toMatchObject({ errors: { [field]: { kind: 'min' } } });
			});

			it('accepts the minimum of 1', async () => {
				const post = new UserPostModel(buildPost({ [field]: 1 }));

				await expect(post.validate()).resolves.toBeUndefined();
			});

			it('rejects a value that is not a number', async () => {
				const post = new UserPostModel(buildPost({ [field]: 'wide' }));

				await expect(post.validate()).rejects.toMatchObject({ errors: { [field]: { kind: 'Number' } } });
			});
		});

		it('keeps the stored dimensions as given', () => {
			const post = new UserPostModel(buildPost({ imageWidth: 1920, imageHeight: 1080 }));

			expect([post.imageWidth, post.imageHeight]).toEqual([1920, 1080]);
		});
	});

	describe('likes', () => {
		it('starts with no likes', () => {
			const post = new UserPostModel(buildPost());

			expect(post.likes).toHaveLength(0);
		});
	});
});
