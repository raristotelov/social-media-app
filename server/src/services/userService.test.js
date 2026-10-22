jest.mock('../models/userModel');
jest.mock('../models/userPostModel');
jest.mock('./commentService');
jest.mock('./imageStorageService');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const bcrypt = require('bcrypt');
const JWT = require('jsonwebtoken');

const UserModel = require('../models/userModel');
const UserPostModel = require('../models/userPostModel');
const imageStorageService = require('./imageStorageService');
const commentService = require('./commentService');
const constants = require('../config/constants');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');
const {
	login,
	signUp,
	updateUserProfileData,
	followUser,
	unfollowUser,
	getUsersProfileDataByUserIds,
	getUsersProfileDataBySearchWord,
	getFollowers,
	getFollowing,
} = require('./userService');

describe('userService', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('login', () => {
		it('rejects with a 401 when no user matches the given email', async () => {
			UserModel.findOne = jest.fn().mockResolvedValue(null);

			await expect(login({ email: 'nobody@example.com', password: 'irrelevant' })).rejects.toMatchObject({
				statusCode: 401,
				code: ERROR_CODES.WRONG_CREDENTIALS,
				message: 'Wrong email or password',
			});
		});

		it.each([
			['a non-string email', { email: { $ne: null }, password: 'irrelevant' }],
			['a non-string password', { email: 'realuser@example.com', password: { $ne: null } }],
			['a missing email', { password: 'irrelevant' }],
			['a missing password', { email: 'realuser@example.com' }],
		])('rejects %s with WRONG_CREDENTIALS without querying the database', async (_name, credentials) => {
			UserModel.findOne = jest.fn();

			await expect(login(credentials)).rejects.toMatchObject({
				statusCode: 401,
				code: ERROR_CODES.WRONG_CREDENTIALS,
			});

			expect(UserModel.findOne).not.toHaveBeenCalled();
			expect(bcrypt.compare).not.toHaveBeenCalled();
		});

		it('rejects with a 401 when bcrypt.compare resolves false (regression: password check must not be skipped)', async () => {
			UserModel.findOne = jest.fn().mockResolvedValue({ _id: 'user1', username: 'realuser', password: 'hashedPassword' });
			bcrypt.compare.mockResolvedValue(false);

			await expect(login({ email: 'realuser@example.com', password: 'wrongPassword' })).rejects.toMatchObject({
				statusCode: 401,
				code: ERROR_CODES.WRONG_CREDENTIALS,
				message: 'Wrong email or password',
			});

			expect(bcrypt.compare).toHaveBeenCalledWith('wrongPassword', 'hashedPassword');
		});

		it('uses the identical message for an unknown email and a wrong password, so it does not leak which field was wrong', async () => {
			UserModel.findOne = jest.fn().mockResolvedValueOnce(null);

			let unknownEmailError;

			try {
				await login({ email: 'nobody@example.com', password: 'irrelevant' });
			} catch (error) {
				unknownEmailError = error;
			}

			UserModel.findOne = jest.fn().mockResolvedValueOnce({ _id: 'user1', username: 'realuser', password: 'hashedPassword' });
			bcrypt.compare.mockResolvedValueOnce(false);

			let wrongPasswordError;

			try {
				await login({ email: 'realuser@example.com', password: 'wrongPassword' });
			} catch (error) {
				wrongPasswordError = error;
			}

			expect(unknownEmailError.message).toBe(wrongPasswordError.message);
			expect(unknownEmailError.statusCode).toBe(wrongPasswordError.statusCode);
			expect(unknownEmailError.code).toBe(wrongPasswordError.code);
			expect(unknownEmailError.fields).toBeUndefined();
			expect(wrongPasswordError.fields).toBeUndefined();
		});

		it('resolves with a signed JWT when the email and password are both correct', async () => {
			const dbUser = { _id: 'user1', username: 'realuser', password: 'hashedPassword' };

			UserModel.findOne = jest.fn().mockResolvedValue(dbUser);
			bcrypt.compare.mockResolvedValue(true);
			JWT.sign.mockReturnValue('signed.jwt.token');

			const result = await login({ email: 'realuser@example.com', password: 'correctPassword' });

			expect(bcrypt.compare).toHaveBeenCalledWith('correctPassword', 'hashedPassword');
			expect(JWT.sign).toHaveBeenCalledWith({ userId: 'user1', username: 'realuser' }, process.env.JWT_SECRET, {
				expiresIn: constants.JWT_EXPIRY,
			});
			expect(result).toBe('signed.jwt.token');
		});

		it('wraps an unexpected error (e.g. a database failure) in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			UserModel.findOne = jest.fn().mockRejectedValue(dbError);

			await expect(login({ email: 'realuser@example.com', password: 'irrelevant' })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not log in',
				cause: dbError,
			});
		});
	});

	describe('signUp', () => {
		const buildUserModelMock = (saveImplementation) => {
			UserModel.mockImplementation(function UserModelMock(data) {
				Object.assign(this, data);
				this._id = 'mockUserId';
				this.save = saveImplementation;
			});
		};

		beforeEach(() => {
			bcrypt.hash.mockResolvedValue('hashedPassword123');
		});

		it('throws a 400 when the password is shorter than MIN_PASSWORD_LENGTH', async () => {
			await expect(signUp({ email: 'a@b.com', username: 'newuser', password: 'short' })).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.PASSWORD_TOO_SHORT,
				fields: { password: ERROR_CODES.PASSWORD_TOO_SHORT },
			});

			expect(bcrypt.hash).not.toHaveBeenCalled();
		});

		it.each([[undefined], [null], [''], [12345678], [{ value: 'x' }]])(
			'throws a 400 PASSWORD_REQUIRED for a missing or non-string password (%p)',
			async (password) => {
				await expect(signUp({ email: 'a@b.com', username: 'newuser', password })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.PASSWORD_REQUIRED,
					fields: { password: ERROR_CODES.PASSWORD_REQUIRED },
				});

				expect(bcrypt.hash).not.toHaveBeenCalled();
			},
		);

		it('throws a 400 when the password exceeds MAX_PASSWORD_BYTES measured in bytes, not characters', async () => {
			// Each 'é' (é) is 1 character but 2 bytes in UTF-8: 40 chars -> 80 bytes.
			const multiByteOverLimitPassword = 'é'.repeat(40);

			expect(multiByteOverLimitPassword.length).toBe(40);
			expect(Buffer.byteLength(multiByteOverLimitPassword, 'utf8')).toBe(80);

			await expect(signUp({ email: 'a@b.com', username: 'newuser', password: multiByteOverLimitPassword })).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.PASSWORD_TOO_LONG,
				fields: { password: ERROR_CODES.PASSWORD_TOO_LONG },
			});

			expect(bcrypt.hash).not.toHaveBeenCalled();
		});

		it('returns a signed JWT so the client can log the new user straight in', async () => {
			buildUserModelMock(jest.fn().mockResolvedValue(undefined));
			JWT.sign.mockReturnValue('signed.jwt.token');

			const result = await signUp({ email: 'a@b.com', username: 'newuser', password: 'validPassword1' });

			expect(result).toBe('signed.jwt.token');
			expect(JWT.sign).toHaveBeenCalledWith({ userId: 'mockUserId', username: 'newuser' }, process.env.JWT_SECRET, {
				expiresIn: constants.JWT_EXPIRY,
			});
		});

		it('hashes the password before saving, so the raw value is never stored', async () => {
			buildUserModelMock(jest.fn().mockResolvedValue(undefined));

			await signUp({ email: 'a@b.com', username: 'newuser', password: 'validPassword1' });

			expect(bcrypt.hash).toHaveBeenCalledWith('validPassword1', constants.SALT_ROUNDS);
			expect(UserModel).toHaveBeenCalledWith(expect.objectContaining({ password: 'hashedPassword123' }));
			expect(UserModel).not.toHaveBeenCalledWith(expect.objectContaining({ password: 'validPassword1' }));
		});

		it('rethrows an AppError from the try block unchanged (e.g. the password length validation error)', async () => {
			let thrown;

			try {
				await signUp({ email: 'a@b.com', username: 'newuser', password: 'short' });
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(AppError);
			expect(thrown.statusCode).toBe(400);
			expect(thrown.code).toBe(ERROR_CODES.PASSWORD_TOO_SHORT);
		});

		it('converts a Mongoose ValidationError into a 400 with fields keyed by the failing path', async () => {
			const validationError = new Error('User validation failed');

			validationError.name = 'ValidationError';
			validationError.errors = {
				email: { kind: 'regexp', message: 'Please provide a valid email address' },
				username: { kind: 'required', message: 'Path `username` is required.' },
			};

			buildUserModelMock(jest.fn().mockRejectedValue(validationError));

			await expect(signUp({ email: 'bad-email', username: '', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.EMAIL_INVALID,
				fields: {
					email: ERROR_CODES.EMAIL_INVALID,
					username: ERROR_CODES.USERNAME_REQUIRED,
				},
			});
		});

		it('maps a required email to EMAIL_REQUIRED', async () => {
			const validationError = new Error('User validation failed');

			validationError.name = 'ValidationError';
			validationError.errors = { email: { kind: 'required', message: 'Path `email` is required.' } };

			buildUserModelMock(jest.fn().mockRejectedValue(validationError));

			await expect(signUp({ email: '', username: 'newuser', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 400,
				fields: { email: ERROR_CODES.EMAIL_REQUIRED },
			});
		});

		it('treats a ValidationError with an unmapped path or kind as an unexpected 500', async () => {
			const validationError = new Error('User validation failed');

			validationError.name = 'ValidationError';
			validationError.errors = { theme: { kind: 'enum', message: 'bad theme' } };

			buildUserModelMock(jest.fn().mockRejectedValue(validationError));

			await expect(signUp({ email: 'a@b.com', username: 'newuser', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 500,
				cause: validationError,
			});
		});

		it('converts a Mongo duplicate-key error on email into a 409 with fields.email', async () => {
			const duplicateKeyError = new Error('E11000 duplicate key error');

			duplicateKeyError.code = 11000;
			duplicateKeyError.keyPattern = { email: 1 };

			buildUserModelMock(jest.fn().mockRejectedValue(duplicateKeyError));

			await expect(signUp({ email: 'taken@example.com', username: 'newuser', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 409,
				code: ERROR_CODES.EMAIL_TAKEN,
				fields: { email: ERROR_CODES.EMAIL_TAKEN },
			});
		});

		it('treats a duplicate-key error on an unknown key as an unexpected 500', async () => {
			const duplicateKeyError = new Error('E11000 duplicate key error');

			duplicateKeyError.code = 11000;
			duplicateKeyError.keyPattern = { somethingElse: 1 };

			buildUserModelMock(jest.fn().mockRejectedValue(duplicateKeyError));

			await expect(signUp({ email: 'a@b.com', username: 'newuser', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 500,
				cause: duplicateKeyError,
			});
		});

		it('converts a Mongo duplicate-key error on username into a 409 with fields.username', async () => {
			const duplicateKeyError = new Error('E11000 duplicate key error');

			duplicateKeyError.code = 11000;
			duplicateKeyError.keyPattern = { username: 1 };

			buildUserModelMock(jest.fn().mockRejectedValue(duplicateKeyError));

			await expect(signUp({ email: 'a@b.com', username: 'takenname', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 409,
				code: ERROR_CODES.USERNAME_TAKEN,
				fields: { username: ERROR_CODES.USERNAME_TAKEN },
			});
		});

		it('wraps an unexpected save error in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			buildUserModelMock(jest.fn().mockRejectedValue(dbError));

			await expect(signUp({ email: 'a@b.com', username: 'newuser', password: 'validPassword1' })).rejects.toMatchObject({
				statusCode: 500,
				message: 'Could not sign up',
				cause: dbError,
			});
		});
	});

	describe('updateUserProfileData', () => {
		const USER_ID = '64b7f0a1c2d3e4f5a6b7c8a1';
		const existingPicture = { imageIdentifier: 'old-picture-id', imageUrl: 'https://example.com/old.jpg' };

		const givenUserWithPicture = (profilePicture) => {
			UserModel.findOne = jest.fn().mockResolvedValue({ _id: USER_ID, profilePicture });
		};

		const givenUpdateResolves = (user = { _id: USER_ID, username: 'realuser' }) => {
			UserModel.findOneAndUpdate = jest.fn().mockResolvedValue(user);
		};

		const givenUpdateRejects = (error) => {
			UserModel.findOneAndUpdate = jest.fn().mockRejectedValue(error);
		};

		const buildDuplicateUsernameError = () => {
			const duplicateKeyError = new Error('E11000 duplicate key error');

			duplicateKeyError.code = 11000;
			duplicateKeyError.keyPattern = { username: 1 };

			return duplicateKeyError;
		};

		let consoleErrorSpy;

		beforeEach(() => {
			JWT.sign.mockReturnValue('signed.jwt.token');
			imageStorageService.deleteImage.mockResolvedValue({ result: 'ok' });
			consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		describe('removing the profile picture (profilePicture: null)', () => {
			it('unsets the profile picture on the user and destroys the Cloudinary asset', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(imageStorageService.deleteImage).toHaveBeenCalledWith('old-picture-id');
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { $unset: { profilePicture: 1 } }, expect.any(Object));
			});

			it('updates the user first, then destroys the Cloudinary asset', async () => {
				const callOrder = [];

				givenUserWithPicture(existingPicture);
				imageStorageService.deleteImage.mockImplementation(async () => callOrder.push('cloudinary'));
				UserModel.findOneAndUpdate = jest.fn().mockImplementation(async () => {
					callOrder.push('user');

					return { _id: USER_ID };
				});

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(callOrder).toEqual(['user', 'cloudinary']);
			});

			it('leaves the picture untouched and does not call deleteImage when the update fails (duplicate username)', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateRejects(buildDuplicateUsernameError());

				await expect(updateUserProfileData(USER_ID, { username: 'taken', profilePicture: null })).rejects.toMatchObject({
					statusCode: 409,
					code: ERROR_CODES.USERNAME_TAKEN,
					fields: { username: ERROR_CODES.USERNAME_TAKEN },
				});

				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});

			it('leaves the picture untouched when the update fails with an unexpected error, and wraps it in a 500', async () => {
				const dbError = new Error('connection lost');

				givenUserWithPicture(existingPicture);
				givenUpdateRejects(dbError);

				await expect(updateUserProfileData(USER_ID, { profilePicture: null })).rejects.toMatchObject({
					statusCode: 500,
					message: 'Could not update user profile',
					cause: dbError,
				});

				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});

			it('returns the updated user without a profile picture', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves({ _id: USER_ID, username: 'realuser', profilePicture: null });

				const result = await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(result.user).toEqual({ _id: USER_ID, username: 'realuser' });
				expect(result.user.profilePicture).toBeUndefined();
			});

			it('does not create a new UserImage document', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(UserPostModel).not.toHaveBeenCalled();
			});

			it('destroys nothing when the user has no picture, but still updates the user', async () => {
				givenUserWithPicture(null);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
			});

			it('still resolves with the updated user and logs the error when the post-save Cloudinary destroy fails', async () => {
				const destroyError = new AppError('Could not delete image old-picture-id', 502);

				givenUserWithPicture(existingPicture);
				givenUpdateResolves({ _id: USER_ID, username: 'realuser' });
				imageStorageService.deleteImage.mockRejectedValue(destroyError);

				const result = await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(result.user).toEqual({ _id: USER_ID, username: 'realuser' });
				expect(result.jwt).toBe('signed.jwt.token');
				expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
				expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('old-picture-id'), destroyError);
			});

			it('does not log anything when the destroy succeeds', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(consoleErrorSpy).not.toHaveBeenCalled();
			});
		});

		describe('replacing the profile picture', () => {
			const profilePictureFile = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: 'me.jpg' };
			const uploadedImage = { imageIdentifier: 'new-picture-id', imageUrl: 'https://example.com/new.jpg' };

			const embeddedPicture = { imageUrl: uploadedImage.imageUrl, imageIdentifier: uploadedImage.imageIdentifier };

			beforeEach(() => {
				imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
				imageStorageService.discardUploadedImage.mockResolvedValue(undefined);
			});

			it('uploads the received file under the profile picture field', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(imageStorageService.uploadImage).toHaveBeenCalledWith({ file: profilePictureFile, fieldName: 'profilePicture' });
			});

			it('points the user at the new image and destroys the previous asset, creating no post record', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(imageStorageService.deleteImage).toHaveBeenCalledWith('old-picture-id');
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { profilePicture: embeddedPicture }, expect.any(Object));
				expect(UserPostModel).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});

			it('applies other profile fields sent together with the new picture', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { bio: 'New bio' }, profilePictureFile);

				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
					{ _id: USER_ID },
					{ bio: 'New bio', profilePicture: embeddedPicture },
					expect.any(Object),
				);
			});

			it('returns the updated user data with a fresh token', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves({ _id: USER_ID, username: 'realuser' });

				const result = await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(result).toEqual({ user: { _id: USER_ID, username: 'realuser' }, jwt: 'signed.jwt.token' });
			});

			it('uploads the new image and updates the user first, then destroys the previous asset', async () => {
				const callOrder = [];

				imageStorageService.uploadImage.mockImplementation(async () => {
					callOrder.push('upload');

					return uploadedImage;
				});
				givenUserWithPicture(existingPicture);
				imageStorageService.deleteImage.mockImplementation(async () => callOrder.push('cloudinary'));
				UserModel.findOneAndUpdate = jest.fn().mockImplementation(async () => {
					callOrder.push('user');

					return { _id: USER_ID };
				});

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(callOrder).toEqual(['upload', 'user', 'cloudinary']);
			});

			it('does not discard the new image when everything succeeds', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
			});

			it('propagates an upload rejection (e.g. wrong type) and changes nothing', async () => {
				const typeError = new AppError('profilePicture: IMAGE_TYPE_INVALID', 400, {
					code: ERROR_CODES.IMAGE_TYPE_INVALID,
					fields: { profilePicture: ERROR_CODES.IMAGE_TYPE_INVALID },
				});

				givenUserWithPicture(existingPicture);
				givenUpdateResolves();
				imageStorageService.uploadImage.mockRejectedValue(typeError);

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.IMAGE_TYPE_INVALID,
					fields: { profilePicture: ERROR_CODES.IMAGE_TYPE_INVALID },
				});

				expect(UserPostModel).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
			});

			it('propagates a Cloudinary upload failure as a 502 and leaves the old picture untouched', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();
				imageStorageService.uploadImage.mockRejectedValue(new AppError('Could not upload image', 502));

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({ statusCode: 502 });

				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
			});

			it('destroys the new image and leaves the old picture untouched when the update fails (duplicate username)', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateRejects(buildDuplicateUsernameError());

				await expect(updateUserProfileData(USER_ID, { username: 'taken' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 409,
					code: ERROR_CODES.USERNAME_TAKEN,
					fields: { username: ERROR_CODES.USERNAME_TAKEN },
				});

				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledTimes(1);
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('maps a validation failure to a 400 with fields, destroying the new image and leaving the old picture untouched', async () => {
				const validationError = new Error('User validation failed');

				validationError.name = 'ValidationError';
				validationError.errors = { bio: { kind: 'maxlength', message: 'Bio is too long' } };

				givenUserWithPicture(existingPicture);
				givenUpdateRejects(validationError);

				await expect(updateUserProfileData(USER_ID, { bio: 'x' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.BIO_TOO_LONG,
					fields: { bio: ERROR_CODES.BIO_TOO_LONG },
				});

				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('wraps an unexpected update failure in a 500, destroying the new image and leaving the old picture untouched', async () => {
				const dbError = new Error('connection lost');

				givenUserWithPicture(existingPicture);
				givenUpdateRejects(dbError);

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({
					statusCode: 500,
					cause: dbError,
				});

				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('still resolves with the updated user and logs the error when the post-save destroy of the old picture fails', async () => {
				const destroyError = new AppError('Could not delete image old-picture-id', 502);

				givenUserWithPicture(existingPicture);
				givenUpdateResolves({ _id: USER_ID, username: 'realuser' });
				imageStorageService.deleteImage.mockRejectedValue(destroyError);

				const result = await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(result.user).toEqual({ _id: USER_ID, username: 'realuser' });
				expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('old-picture-id'), destroyError);
				expect(UserPostModel.deleteOne).not.toHaveBeenCalledWith({ _id: 'newPicture1' });
				expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
			});

			it('destroys nothing when the user had no previous picture', async () => {
				givenUserWithPicture(null);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});
		});

		describe('a profilePicture value in the body', () => {
			const rejectedValues = [
				['a Cloudinary-style object', { imageIdentifier: 'someone-elses-image', imageUrl: 'https://example.com/other.jpg' }],
				['a string id', 'someone-elses-image'],
				['an empty string', ''],
				['undefined', undefined],
				['a number', 0],
			];

			it.each(rejectedValues)('rejects %s with a 400 BAD_REQUEST before touching anything', async (_name, value) => {
				UserModel.findOne = jest.fn();
				UserModel.findOneAndUpdate = jest.fn();

				await expect(updateUserProfileData(USER_ID, { profilePicture: value })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.BAD_REQUEST,
				});

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
				expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('rejects a non-null profilePicture even when a file is also uploaded, so it cannot override the stored upload', async () => {
				UserModel.findOneAndUpdate = jest.fn();

				await expect(
					updateUserProfileData(USER_ID, { profilePicture: 'someone-elses-image' }, { buffer: Buffer.from([0xff, 0xd8, 0xff]) }),
				).rejects.toMatchObject({ statusCode: 400, code: ERROR_CODES.BAD_REQUEST });

				expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
			});
		});

		describe('updates that do not touch the profile picture', () => {
			it('makes no lookup and does not destroy or upload any picture when profilePicture is absent', async () => {
				UserModel.findOne = jest.fn();
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { bio: 'New bio' });

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
				expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { bio: 'New bio' }, expect.any(Object));
			});

			it('rejects a password change with a 400 before touching the picture', async () => {
				UserModel.findOne = jest.fn();

				await expect(updateUserProfileData(USER_ID, { password: 'x', profilePicture: null })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.PASSWORD_NOT_EDITABLE,
					fields: { password: ERROR_CODES.PASSWORD_NOT_EDITABLE },
				});

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});
		});

		describe('the allowed profile fields', () => {
			const profilePictureFile = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: 'me.jpg' };
			const disallowedFields = [
				['followers', ['64b7f0a1c2d3e4f5a6b7c8b2']],
				['following', ['64b7f0a1c2d3e4f5a6b7c8b2']],
				['posts', ['64b7f0a1c2d3e4f5a6b7c8b3']],
				['_id', '64b7f0a1c2d3e4f5a6b7c8b4'],
				['an arbitrary key', 'anything'],
			];
			const allowedFields = [
				['email', 'new@example.com'],
				['username', 'newname'],
				['bio', 'New bio'],
				['theme', 'dark'],
			];

			it.each(disallowedFields)('rejects %s with a 400 BAD_REQUEST and neither reads, writes nor uploads', async (name, value) => {
				const field = name === 'an arbitrary key' ? 'isAdmin' : name;

				UserModel.findOne = jest.fn();
				UserModel.findOneAndUpdate = jest.fn();

				await expect(updateUserProfileData(USER_ID, { bio: 'New bio', [field]: value }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.BAD_REQUEST,
				});

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
				expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
				expect(UserPostModel).not.toHaveBeenCalled();
			});

			it.each(allowedFields)('still accepts %s and passes it to the update without a lookup', async (field, value) => {
				UserModel.findOne = jest.fn();
				givenUpdateResolves();

				await expect(updateUserProfileData(USER_ID, { [field]: value })).resolves.toMatchObject({ jwt: 'signed.jwt.token' });

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { [field]: value }, expect.any(Object));
			});

			it('still accepts profilePicture: null, looking the user up first, and passes it to the update', async () => {
				givenUserWithPicture(null);
				givenUpdateResolves();

				await expect(updateUserProfileData(USER_ID, { profilePicture: null })).resolves.toMatchObject({ jwt: 'signed.jwt.token' });

				expect(UserModel.findOne).toHaveBeenCalledTimes(1);
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { $unset: { profilePicture: 1 } }, expect.any(Object));
			});

			it('still rejects password with PASSWORD_NOT_EDITABLE, ahead of the disallowed-field check', async () => {
				UserModel.findOne = jest.fn();

				await expect(updateUserProfileData(USER_ID, { password: 'x', followers: [] })).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.PASSWORD_NOT_EDITABLE,
					fields: { password: ERROR_CODES.PASSWORD_NOT_EDITABLE },
				});

				expect(UserModel.findOne).not.toHaveBeenCalled();
			});

			it('rejects a disallowed field ahead of the non-null profilePicture check', async () => {
				await expect(updateUserProfileData(USER_ID, { followers: [], profilePicture: 'x' })).rejects.toMatchObject({
					statusCode: 400,
					message: 'Only profile fields can be updated',
				});
			});
		});

		describe('a user that cannot be found', () => {
			const profilePictureFile = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: 'me.jpg' };

			const expectNothingWritten = () => {
				expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
				expect(UserPostModel).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			};

			beforeEach(() => {
				UserModel.findOneAndUpdate = jest.fn();
			});

			it.each([
				['a malformed id', 'user1'],
				['an empty id', ''],
				['an undefined id', undefined],
			])('rejects %s with a 404 USER_NOT_FOUND before any lookup or upload', async (_name, userId) => {
				UserModel.findOne = jest.fn();

				await expect(updateUserProfileData(userId, { bio: 'x' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.USER_NOT_FOUND,
				});

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expectNothingWritten();
			});

			it('rejects a well-formed id with no matching user with a 404 USER_NOT_FOUND, without uploading', async () => {
				UserModel.findOne = jest.fn().mockResolvedValue(null);

				await expect(updateUserProfileData(USER_ID, { bio: 'x' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.USER_NOT_FOUND,
				});

				expectNothingWritten();
			});

			it('rejects a picture removal for a missing user with a 404 without destroying anything', async () => {
				UserModel.findOne = jest.fn().mockResolvedValue(null);

				await expect(updateUserProfileData(USER_ID, { profilePicture: null })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.USER_NOT_FOUND,
				});

				expectNothingWritten();
			});

			it('answers 404 and discards the uploaded image when the user vanishes between the lookup and the update', async () => {
				imageStorageService.uploadImage.mockResolvedValue({ imageIdentifier: 'new-picture-id', imageUrl: 'https://example.com/new.jpg' });
				imageStorageService.discardUploadedImage.mockResolvedValue(undefined);
				givenUserWithPicture(existingPicture);
				givenUpdateResolves(null);

				await expect(updateUserProfileData(USER_ID, { bio: 'x' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.USER_NOT_FOUND,
				});

				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalledWith('old-picture-id');
			});

			it('answers 404 for a plain update of a nonexistent user (update returns null), without a lookup or any rollback', async () => {
				UserModel.findOne = jest.fn();
				givenUpdateResolves(null);

				await expect(updateUserProfileData(USER_ID, { bio: 'x' })).rejects.toMatchObject({
					statusCode: 404,
					code: ERROR_CODES.USER_NOT_FOUND,
				});

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
				expect(imageStorageService.uploadImage).not.toHaveBeenCalled();
				expect(imageStorageService.discardUploadedImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});
		});
	});

	describe.each([
		['followUser', followUser, '$addToSet', 'following', 'followers'],
		['unfollowUser', unfollowUser, '$pull', 'following', 'followers'],
	])('%s', (_name, action, operator, ownList, otherList) => {
		const USER_ID = '64b7f0a1c2d3e4f5a6b7c8a1';
		const TARGET_ID = '64b7f0a1c2d3e4f5a6b7c8a2';

		const givenCount = (count) => {
			UserModel.countDocuments = jest.fn().mockResolvedValue(count);
		};

		const givenUpdatesResolve = (user = { _id: USER_ID, username: 'realuser' }) => {
			UserModel.findOneAndUpdate = jest.fn().mockResolvedValue(user);
			UserModel.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
		};

		const expectNothingModified = () => {
			expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
			expect(UserModel.updateOne).not.toHaveBeenCalled();
		};

		beforeEach(() => {
			JWT.sign.mockReturnValue('signed.jwt.token');
			UserModel.findOneAndUpdate = jest.fn();
			UserModel.updateOne = jest.fn();
		});

		it('updates both users and returns the logged-in user data when both exist', async () => {
			givenCount(2);
			givenUpdatesResolve();

			const result = await action(USER_ID, TARGET_ID);

			expect(UserModel.countDocuments).toHaveBeenCalledWith({ _id: { $in: [USER_ID, TARGET_ID] } });
			expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { [operator]: { [ownList]: TARGET_ID } }, { new: true });
			expect(UserModel.updateOne).toHaveBeenCalledWith({ _id: TARGET_ID }, { [operator]: { [otherList]: USER_ID } }, { new: true });
			expect(result).toEqual({ user: { _id: USER_ID, username: 'realuser' }, jwt: 'signed.jwt.token' });
		});

		it.each([
			['the acting user or the target is missing', 1],
			['neither user exists', 0],
		])('rejects with a 404 USER_NOT_FOUND and modifies nothing when %s', async (_case, existingCount) => {
			givenCount(existingCount);

			await expect(action(USER_ID, TARGET_ID)).rejects.toMatchObject({ statusCode: 404, code: ERROR_CODES.USER_NOT_FOUND });

			expectNothingModified();
		});

		it.each([
			['the acting user id is malformed', 'user1', TARGET_ID],
			['the target id is malformed', USER_ID, 'not-an-id'],
		])('rejects with a 404 USER_NOT_FOUND without querying when %s', async (_case, userId, targetId) => {
			UserModel.countDocuments = jest.fn();

			await expect(action(userId, targetId)).rejects.toMatchObject({ statusCode: 404, code: ERROR_CODES.USER_NOT_FOUND });

			expect(UserModel.countDocuments).not.toHaveBeenCalled();
			expectNothingModified();
		});

		it('rethrows the 404 as is instead of wrapping it into a 500', async () => {
			givenCount(0);

			await expect(action(USER_ID, TARGET_ID)).rejects.toMatchObject({ statusCode: 404 });
		});

		it('wraps an unexpected database failure into a 500', async () => {
			const dbError = new Error('connection lost');

			UserModel.countDocuments = jest.fn().mockRejectedValue(dbError);

			await expect(action(USER_ID, TARGET_ID)).rejects.toMatchObject({ statusCode: 500, cause: dbError });

			expectNothingModified();
		});
	});

	describe('following and unfollowing oneself', () => {
		const USER_ID = '64b7f0a1c2d3e4f5a6b7c8a1';

		beforeEach(() => {
			JWT.sign.mockReturnValue('signed.jwt.token');
			UserModel.countDocuments = jest.fn().mockResolvedValue(1);
			UserModel.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: USER_ID, username: 'realuser' });
			UserModel.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 0 });
		});

		it('rejects following oneself with a 400 BAD_REQUEST without touching the database', async () => {
			await expect(followUser(USER_ID, USER_ID)).rejects.toMatchObject({ statusCode: 400, code: ERROR_CODES.BAD_REQUEST });

			expect(UserModel.countDocuments).not.toHaveBeenCalled();
			expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
			expect(UserModel.updateOne).not.toHaveBeenCalled();
		});

		it('lets unfollowing oneself through, requiring only one existing user', async () => {
			await expect(unfollowUser(USER_ID, USER_ID)).resolves.toMatchObject({ jwt: 'signed.jwt.token' });

			expect(UserModel.countDocuments).toHaveBeenCalledWith({ _id: { $in: [USER_ID] } });
		});
	});

	describe('getUsersProfileDataByUserIds', () => {
		const VALID_ID = '64b7f0a1c2d3e4f5a6b7c8d1';

		const givenFindResolves = (users) => {
			const populate = jest.fn().mockResolvedValue(users);

			UserModel.find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ populate }) });
		};

		it('rejects with a 404 USER_NOT_FOUND when no user has that id', async () => {
			givenFindResolves([]);

			await expect(getUsersProfileDataByUserIds({ userIds: [VALID_ID] })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.USER_NOT_FOUND,
			});
		});

		it('rejects with a 404 USER_NOT_FOUND for a malformed id without querying the database', async () => {
			UserModel.find = jest.fn();

			await expect(getUsersProfileDataByUserIds({ userIds: ['not-an-object-id'] })).rejects.toMatchObject({
				statusCode: 404,
				code: ERROR_CODES.USER_NOT_FOUND,
			});

			expect(UserModel.find).not.toHaveBeenCalled();
		});

		it('wraps an unexpected database failure in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			UserModel.find = jest.fn().mockImplementation(() => {
				throw dbError;
			});

			await expect(getUsersProfileDataByUserIds({ userIds: [VALID_ID] })).rejects.toMatchObject({
				statusCode: 500,
				cause: dbError,
			});
		});

		describe('resolving profiles', () => {
			const OWNER_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
			const OTHER_ID = '64b7f0a1c2d3e4f5a6b7c8e2';

			const buildUser = ({ _id, email = `${_id}@example.com`, posts = [], following = [] }) => {
				const data = { _id, username: `user-${_id}`, email, posts, following, followers: [] };

				return { _id, posts, toObject: () => ({ ...data }) };
			};

			const givenLookup = ({ users, commentCounts = {}, previewComments = {} }) => {
				UserModel.find = jest.fn().mockReturnValue({
					select: jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(users) }),
				});
				commentService.getCommentCountsForPosts.mockResolvedValue(commentCounts);
				commentService.getPreviewCommentsForPosts.mockResolvedValue(previewComments);
			};

			describe('email visibility', () => {
				it('strips the email from the profile when the requester is a guest', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID] });

					expect(profile).not.toHaveProperty('email');
				});

				it('strips the email from the profile when the requester is another user', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: OTHER_ID });

					expect(profile).not.toHaveProperty('email');
				});

				it('keeps the email when the requester is the profile owner', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID, email: 'owner@example.com' })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: OWNER_ID });

					expect(profile.email).toBe('owner@example.com');
				});

				it('keeps the email when the requester id is an object that stringifies to the owner id', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID, email: 'owner@example.com' })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: { toString: () => OWNER_ID } });

					expect(profile.email).toBe('owner@example.com');
				});

				it("keeps the email only on the requester's own profile when several profiles are requested", async () => {
					givenLookup({
						users: [buildUser({ _id: OWNER_ID, email: 'owner@example.com' }), buildUser({ _id: OTHER_ID, email: 'other@example.com' })],
					});

					const profiles = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID, OTHER_ID], requesterId: OWNER_ID });

					expect(profiles.map((profile) => profile.email)).toEqual(['owner@example.com', undefined]);
				});
			});

			describe('profile post comment counts', () => {
				it('adds a commentsCount to each profile post, defaulting to 0', async () => {
					givenLookup({
						users: [buildUser({ _id: OWNER_ID, posts: [{ _id: 'post1' }, { _id: 'post2' }] })],
						commentCounts: { post1: 3 },
					});

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID] });

					expect(profile.posts).toEqual([
						{ _id: 'post1', commentsCount: 3, previewComments: [] },
						{ _id: 'post2', commentsCount: 0, previewComments: [] },
					]);
				});

				it('asks for the comment counts of all profile posts in one call', async () => {
					givenLookup({
						users: [buildUser({ _id: OWNER_ID, posts: [{ _id: 'post1' }] }), buildUser({ _id: OTHER_ID, posts: [{ _id: 'post2' }] })],
					});

					await getUsersProfileDataByUserIds({ userIds: [OWNER_ID, OTHER_ID] });

					expect(commentService.getCommentCountsForPosts).toHaveBeenCalledWith(['post1', 'post2']);
				});
			});

			describe('profile posts', () => {
				it('puts the newest post first, whatever order the user stores them in', async () => {
					givenLookup({
						users: [
							buildUser({
								_id: OWNER_ID,
								posts: [
									{ _id: 'oldest', createdAt: '2024-01-01T00:00:00.000Z' },
									{ _id: 'newest', createdAt: '2024-03-01T00:00:00.000Z' },
									{ _id: 'middle', createdAt: '2024-02-01T00:00:00.000Z' },
								],
							}),
						],
					});

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID] });

					expect(profile.posts.map((post) => post._id)).toEqual(['newest', 'middle', 'oldest']);
				});

				it('orders posts stored as Date values newest first as well', async () => {
					givenLookup({
						users: [
							buildUser({
								_id: OWNER_ID,
								posts: [
									{ _id: 'older', createdAt: new Date('2024-01-01T00:00:00.000Z') },
									{ _id: 'newer', createdAt: new Date('2024-02-01T00:00:00.000Z') },
								],
							}),
						],
					});

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID] });

					expect(profile.posts.map((post) => post._id)).toEqual(['newer', 'older']);
				});

				it('sorts the posts of each requested profile on its own', async () => {
					givenLookup({
						users: [
							buildUser({
								_id: OWNER_ID,
								posts: [
									{ _id: 'a-old', createdAt: '2024-01-01T00:00:00.000Z' },
									{ _id: 'a-new', createdAt: '2024-02-01T00:00:00.000Z' },
								],
							}),
							buildUser({
								_id: OTHER_ID,
								posts: [
									{ _id: 'b-old', createdAt: '2024-03-01T00:00:00.000Z' },
									{ _id: 'b-new', createdAt: '2024-04-01T00:00:00.000Z' },
								],
							}),
						],
					});

					const profiles = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID, OTHER_ID] });

					expect(profiles.map((profile) => profile.posts.map((post) => post._id))).toEqual([
						['a-new', 'a-old'],
						['b-new', 'b-old'],
					]);
				});

				it('returns an empty list for a profile without posts', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID] });

					expect(profile.posts).toEqual([]);
				});

				it('adds the preview comments of each post, defaulting to an empty list', async () => {
					const preview = [{ _id: 'c1' }, { _id: 'c2' }];

					givenLookup({
						users: [
							buildUser({
								_id: OWNER_ID,
								posts: [
									{ _id: 'post2', createdAt: '2024-02-01T00:00:00.000Z' },
									{ _id: 'post1', createdAt: '2024-01-01T00:00:00.000Z' },
								],
							}),
						],
						previewComments: { post2: preview },
					});

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID] });

					expect(profile.posts.map((post) => post.previewComments)).toEqual([preview, []]);
				});

				it('asks for the preview comments of all profile posts in one call', async () => {
					givenLookup({
						users: [buildUser({ _id: OWNER_ID, posts: [{ _id: 'post1' }] }), buildUser({ _id: OTHER_ID, posts: [{ _id: 'post2' }] })],
					});

					await getUsersProfileDataByUserIds({ userIds: [OWNER_ID, OTHER_ID] });

					expect(commentService.getPreviewCommentsForPosts).toHaveBeenCalledTimes(1);
					expect(commentService.getPreviewCommentsForPosts).toHaveBeenCalledWith(['post1', 'post2']);
				});
			});

			describe('the response no longer carries the feed', () => {
				it('has no followedUsersPosts on a profile', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID, following: [OTHER_ID] })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: OWNER_ID });

					expect(profile).not.toHaveProperty('followedUsersPosts');
				});

				it('keeps the list of followed users, which the profile still needs', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID, following: [OTHER_ID] })] });

					const [profile] = await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: OWNER_ID });

					expect(profile.following).toEqual([OTHER_ID]);
				});

				it('does not load the posts of the followed users', async () => {
					UserPostModel.find = jest.fn();
					givenLookup({ users: [buildUser({ _id: OWNER_ID, following: [OTHER_ID] })] });

					await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: OWNER_ID });

					expect(UserPostModel.find).not.toHaveBeenCalled();
				});

				it('queries the users once, without a second lookup for followed users', async () => {
					givenLookup({ users: [buildUser({ _id: OWNER_ID, following: [OTHER_ID] })] });

					await getUsersProfileDataByUserIds({ userIds: [OWNER_ID], requesterId: OWNER_ID });

					expect(UserModel.find).toHaveBeenCalledTimes(1);
				});
			});
		});
	});

	describe('getUsersProfileDataBySearchWord', () => {
		const givenSearchResolves = (users) => {
			UserModel.aggregate = jest.fn().mockResolvedValue(users);
		};

		const getMatchStage = () => UserModel.aggregate.mock.calls[0][0].find((stage) => stage.$match).$match;

		const getProjectStage = () => UserModel.aggregate.mock.calls[0][0].find((stage) => stage.$project).$project;

		it('matches usernames starting with the search word, case-insensitively', async () => {
			givenSearchResolves([]);

			await getUsersProfileDataBySearchWord({ searchWord: 'jan' });

			expect(getMatchStage()).toEqual({ username: { $regex: '^jan', $options: 'i' } });
		});

		it.each([
			['a dot', 'j.n', '^j\\.n'],
			['a star', 'j*', '^j\\*'],
			['a plus and a question mark', 'a+b?', '^a\\+b\\?'],
			['parentheses and brackets', '(a)[b]', '^\\(a\\)\\[b\\]'],
			['a caret and a dollar sign', '^a$', '^\\^a\\$'],
			['braces and a pipe', 'a{2}|b', '^a\\{2\\}\\|b'],
			['a backslash', 'a\\b', '^a\\\\b'],
		])('escapes %s so the search word is matched literally', async (_name, searchWord, expectedPattern) => {
			givenSearchResolves([]);

			await getUsersProfileDataBySearchWord({ searchWord });

			expect(getMatchStage()).toEqual({ username: { $regex: expectedPattern, $options: 'i' } });
		});

		it('counts followers with $size so the follower count can be shown without the followers array', async () => {
			givenSearchResolves([]);

			await getUsersProfileDataBySearchWord({ searchWord: 'jan' });

			expect(getProjectStage().followersCount).toEqual({ $size: { $ifNull: ['$followers', []] } });
			expect(getProjectStage()).not.toHaveProperty('followers');
		});

		it('projects only the id, username, profile picture url and follower count', async () => {
			givenSearchResolves([]);

			await getUsersProfileDataBySearchWord({ searchWord: 'jan' });

			expect(Object.keys(getProjectStage()).sort()).toEqual(['_id', 'followersCount', 'profilePicture.imageUrl', 'username']);
		});

		it('does not project email, password, posts or bio', async () => {
			givenSearchResolves([]);

			await getUsersProfileDataBySearchWord({ searchWord: 'jan' });

			['email', 'password', 'posts', 'bio'].forEach((field) => expect(getProjectStage()).not.toHaveProperty(field));
		});

		it('returns the rows found', async () => {
			const users = [{ _id: 'user1', username: 'janedoe', followersCount: 2 }];

			givenSearchResolves(users);

			await expect(getUsersProfileDataBySearchWord({ searchWord: 'jan' })).resolves.toBe(users);
		});

		it('wraps an unexpected database failure in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			UserModel.aggregate = jest.fn().mockImplementation(() => {
				throw dbError;
			});

			await expect(getUsersProfileDataBySearchWord({ searchWord: 'jan' })).rejects.toMatchObject({
				statusCode: 500,
				cause: dbError,
			});
		});
	});

	describe.each([
		['getFollowers', getFollowers, 'followers'],
		['getFollowing', getFollowing, 'following'],
	])('%s', (_name, getList, listField) => {
		const PROFILE_ID = '64b7f0a1c2d3e4f5a6b7c8d1';
		const FIRST_ID = '64b7f0a1c2d3e4f5a6b7c8e1';
		const SECOND_ID = '64b7f0a1c2d3e4f5a6b7c8e2';
		const THIRD_ID = '64b7f0a1c2d3e4f5a6b7c8e3';

		const buildRow = (_id, overrides = {}) => ({ _id, username: `user-${_id}`, followersCount: 0, ...overrides });

		const givenProfileWithList = (listedUserIds, rows) => {
			const select = jest.fn().mockResolvedValue({ _id: PROFILE_ID, [listField]: listedUserIds });

			UserModel.findById = jest.fn().mockReturnValue({ select });
			UserModel.aggregate = jest.fn().mockResolvedValue(rows);

			return select;
		};

		it('reads only the requested list field of the profile', async () => {
			const select = givenProfileWithList([], []);

			await getList({ userId: PROFILE_ID });

			expect(UserModel.findById).toHaveBeenCalledWith(PROFILE_ID);
			expect(select).toHaveBeenCalledWith({ [listField]: 1 });
		});

		it('matches the listed users and projects slim rows with a $size follower count', async () => {
			givenProfileWithList([FIRST_ID, SECOND_ID], []);

			await getList({ userId: PROFILE_ID });

			const [pipeline] = UserModel.aggregate.mock.calls[0];
			const project = pipeline.find((stage) => stage.$project).$project;

			expect(pipeline.find((stage) => stage.$match).$match).toEqual({ _id: { $in: [FIRST_ID, SECOND_ID] } });
			expect(Object.keys(project).sort()).toEqual(['_id', 'followersCount', 'profilePicture.imageUrl', 'username']);
			expect(project.followersCount).toEqual({ $size: { $ifNull: ['$followers', []] } });
		});

		it('returns the rows as given by the projection, without email', async () => {
			const rows = [buildRow(FIRST_ID, { followersCount: 3, profilePicture: { imageUrl: 'https://example.com/one.jpg' } })];

			givenProfileWithList([FIRST_ID], rows);

			const result = await getList({ userId: PROFILE_ID });

			expect(result).toEqual(rows);
			expect(result[0]).not.toHaveProperty('email');
		});

		it('keeps the stored list order even when the database returns the rows in another order', async () => {
			givenProfileWithList([THIRD_ID, FIRST_ID, SECOND_ID], [buildRow(FIRST_ID), buildRow(SECOND_ID), buildRow(THIRD_ID)]);

			const result = await getList({ userId: PROFILE_ID });

			expect(result.map((row) => row._id)).toEqual([THIRD_ID, FIRST_ID, SECOND_ID]);
		});

		it('moves the requester to the top when they are in the list', async () => {
			givenProfileWithList([FIRST_ID, SECOND_ID, THIRD_ID], [buildRow(FIRST_ID), buildRow(SECOND_ID), buildRow(THIRD_ID)]);

			const result = await getList({ userId: PROFILE_ID, requesterId: SECOND_ID });

			expect(result.map((row) => row._id)).toEqual([SECOND_ID, FIRST_ID, THIRD_ID]);
		});

		it('keeps the stored order when the requester is not in the list', async () => {
			givenProfileWithList([FIRST_ID, SECOND_ID], [buildRow(FIRST_ID), buildRow(SECOND_ID)]);

			const result = await getList({ userId: PROFILE_ID, requesterId: THIRD_ID });

			expect(result.map((row) => row._id)).toEqual([FIRST_ID, SECOND_ID]);
		});

		it('treats an object requester id that stringifies to a listed id as that user', async () => {
			givenProfileWithList([FIRST_ID, SECOND_ID], [buildRow(FIRST_ID), buildRow(SECOND_ID)]);

			const result = await getList({ userId: PROFILE_ID, requesterId: { toString: () => SECOND_ID } });

			expect(result[0]._id).toBe(SECOND_ID);
		});

		it('returns an empty list for a profile with nobody in the list', async () => {
			givenProfileWithList([], []);

			await expect(getList({ userId: PROFILE_ID })).resolves.toEqual([]);
		});

		it('skips listed users that no longer exist', async () => {
			givenProfileWithList([FIRST_ID, SECOND_ID], [buildRow(SECOND_ID)]);

			const result = await getList({ userId: PROFILE_ID });

			expect(result.map((row) => row._id)).toEqual([SECOND_ID]);
		});

		it('rejects a malformed id with a 404 USER_NOT_FOUND without querying', async () => {
			UserModel.findById = jest.fn();
			UserModel.aggregate = jest.fn();

			await expect(getList({ userId: 'not-an-object-id' })).rejects.toMatchObject({ statusCode: 404, code: ERROR_CODES.USER_NOT_FOUND });

			expect(UserModel.findById).not.toHaveBeenCalled();
			expect(UserModel.aggregate).not.toHaveBeenCalled();
		});

		it('rejects an unknown id with a 404 USER_NOT_FOUND, not a 500', async () => {
			UserModel.findById = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
			UserModel.aggregate = jest.fn();

			await expect(getList({ userId: PROFILE_ID })).rejects.toMatchObject({ statusCode: 404, code: ERROR_CODES.USER_NOT_FOUND });

			expect(UserModel.aggregate).not.toHaveBeenCalled();
		});

		it('wraps a failing profile lookup in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			UserModel.findById = jest.fn().mockReturnValue({ select: jest.fn().mockRejectedValue(dbError) });

			await expect(getList({ userId: PROFILE_ID })).rejects.toMatchObject({ statusCode: 500, cause: dbError });
		});

		it('wraps a failing rows query in a 500 AppError', async () => {
			const dbError = new Error('connection lost');

			givenProfileWithList([FIRST_ID], []);
			UserModel.aggregate = jest.fn().mockRejectedValue(dbError);

			await expect(getList({ userId: PROFILE_ID })).rejects.toMatchObject({ statusCode: 500, cause: dbError });
		});
	});
});
