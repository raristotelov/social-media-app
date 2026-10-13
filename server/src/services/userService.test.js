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
const constants = require('../config/constants');
const AppError = require('../utils/AppError');
const { ERROR_CODES } = require('../config/errorCodes');
const { login, signUp, updateUserProfileData, getUsersProfileDataByUserIds } = require('./userService');

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
		const USER_ID = 'user1';
		const existingPicture = { _id: 'picture1', imageIdentifier: 'old-picture-id', imageUrl: 'https://example.com/old.jpg' };

		const givenUserWithPicture = (profilePicture) => {
			UserModel.findOne = jest.fn().mockReturnValue({
				populate: jest.fn().mockResolvedValue({ _id: USER_ID, profilePicture }),
			});
		};

		const givenUpdateResolves = (user = { _id: USER_ID, username: 'realuser' }) => {
			UserModel.findOneAndUpdate = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(user) });
		};

		const givenUpdateRejects = (error) => {
			UserModel.findOneAndUpdate = jest.fn().mockReturnValue({ populate: jest.fn().mockRejectedValue(error) });
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
			UserPostModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
			consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		describe('removing the profile picture (profilePicture: null)', () => {
			it('destroys the Cloudinary asset, deletes the UserImage document and unsets the reference', async () => {
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(imageStorageService.deleteImage).toHaveBeenCalledWith('old-picture-id');
				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'picture1' });
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { profilePicture: null }, expect.any(Object));
			});

			it('updates the user first, then destroys the Cloudinary asset, then deletes the document', async () => {
				const callOrder = [];

				givenUserWithPicture(existingPicture);
				imageStorageService.deleteImage.mockImplementation(async () => callOrder.push('cloudinary'));
				UserPostModel.deleteOne.mockImplementation(async () => callOrder.push('document'));
				UserModel.findOneAndUpdate = jest.fn().mockImplementation(() => {
					callOrder.push('user');

					return { populate: jest.fn().mockResolvedValue({ _id: USER_ID }) };
				});

				await updateUserProfileData(USER_ID, { profilePicture: null });

				expect(callOrder).toEqual(['user', 'cloudinary', 'document']);
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

			const buildUserPostModelMock = () => {
				const save = jest.fn().mockResolvedValue(undefined);

				UserPostModel.mockImplementation(function UserPostModelMock(data) {
					Object.assign(this, data);
					this._id = 'newPicture1';
					this.save = save;
				});

				return save;
			};

			beforeEach(() => {
				imageStorageService.uploadImage.mockResolvedValue(uploadedImage);
				imageStorageService.discardUploadedImage.mockResolvedValue(undefined);
			});

			it('uploads the received file under the profile picture field', async () => {
				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(imageStorageService.uploadImage).toHaveBeenCalledWith({ file: profilePictureFile, fieldName: 'profilePicture' });
			});

			it('destroys the previous asset and document, saves the new image and points the user at it', async () => {
				const save = buildUserPostModelMock();

				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(imageStorageService.deleteImage).toHaveBeenCalledWith('old-picture-id');
				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'picture1' });
				expect(UserPostModel).toHaveBeenCalledWith({ ...uploadedImage, userId: USER_ID });
				expect(save).toHaveBeenCalledTimes(1);
				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: USER_ID }, { profilePicture: 'newPicture1' }, expect.any(Object));
			});

			it('applies other profile fields sent together with the new picture', async () => {
				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { bio: 'New bio' }, profilePictureFile);

				expect(UserModel.findOneAndUpdate).toHaveBeenCalledWith(
					{ _id: USER_ID },
					{ bio: 'New bio', profilePicture: 'newPicture1' },
					expect.any(Object),
				);
			});

			it('returns the updated user data with a fresh token', async () => {
				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateResolves({ _id: USER_ID, username: 'realuser' });

				const result = await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(result).toEqual({ user: { _id: USER_ID, username: 'realuser' }, jwt: 'signed.jwt.token' });
			});

			it('saves the new image and updates the user first, then destroys the previous asset and document', async () => {
				const callOrder = [];
				const save = jest.fn().mockImplementation(async () => callOrder.push('save new'));

				UserPostModel.mockImplementation(function UserPostModelMock(data) {
					Object.assign(this, data);
					this._id = 'newPicture1';
					this.save = save;
				});
				givenUserWithPicture(existingPicture);
				imageStorageService.deleteImage.mockImplementation(async () => callOrder.push('cloudinary'));
				UserPostModel.deleteOne.mockImplementation(async (filter) => callOrder.push(`delete ${filter._id}`));
				UserModel.findOneAndUpdate = jest.fn().mockImplementation(() => {
					callOrder.push('user');

					return { populate: jest.fn().mockResolvedValue({ _id: USER_ID }) };
				});

				await updateUserProfileData(USER_ID, {}, profilePictureFile);

				expect(callOrder).toEqual(['save new', 'user', 'cloudinary', 'delete picture1']);
			});

			it('does not discard the new image when everything succeeds', async () => {
				buildUserPostModelMock();
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

				buildUserPostModelMock();
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
				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				imageStorageService.uploadImage.mockRejectedValue(new AppError('Could not upload image', 502));

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({ statusCode: 502 });

				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
				expect(UserPostModel.deleteOne).not.toHaveBeenCalled();
			});

			it('deletes the new document, destroys the new image and leaves the old picture untouched when the update fails (duplicate username)', async () => {
				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateRejects(buildDuplicateUsernameError());

				await expect(updateUserProfileData(USER_ID, { username: 'taken' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 409,
					code: ERROR_CODES.USERNAME_TAKEN,
					fields: { username: ERROR_CODES.USERNAME_TAKEN },
				});

				expect(UserPostModel.deleteOne).toHaveBeenCalledTimes(1);
				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'newPicture1' });
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('maps a validation failure to a 400 with fields, deleting the new document and leaving the old picture untouched', async () => {
				const validationError = new Error('User validation failed');

				validationError.name = 'ValidationError';
				validationError.errors = { bio: { kind: 'maxlength', message: 'Bio is too long' } };

				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateRejects(validationError);

				await expect(updateUserProfileData(USER_ID, { bio: 'x' }, profilePictureFile)).rejects.toMatchObject({
					statusCode: 400,
					code: ERROR_CODES.BIO_TOO_LONG,
					fields: { bio: ERROR_CODES.BIO_TOO_LONG },
				});

				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'newPicture1' });
				expect(UserPostModel.deleteOne).not.toHaveBeenCalledWith({ _id: 'picture1' });
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('wraps an unexpected update failure in a 500, deleting the new document and leaving the old picture untouched', async () => {
				const dbError = new Error('connection lost');

				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateRejects(dbError);

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({
					statusCode: 500,
					cause: dbError,
				});

				expect(UserPostModel.deleteOne).toHaveBeenCalledWith({ _id: 'newPicture1' });
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('deletes nothing from the database but still destroys the new image when saving the new picture record fails', async () => {
				const saveError = new Error('connection lost');

				UserPostModel.mockImplementation(function UserPostModelMock(data) {
					Object.assign(this, data);
					this._id = 'newPicture1';
					this.save = jest.fn().mockRejectedValue(saveError);
				});
				givenUserWithPicture(existingPicture);
				givenUpdateResolves();

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({
					statusCode: 500,
					cause: saveError,
				});

				expect(UserModel.findOneAndUpdate).not.toHaveBeenCalled();
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
			});

			it('still destroys the new image, logs, and answers with the update error when removing the new record fails', async () => {
				const dbError = new Error('connection lost');
				const deleteError = new Error('delete failed');

				buildUserPostModelMock();
				givenUserWithPicture(existingPicture);
				givenUpdateRejects(dbError);
				UserPostModel.deleteOne.mockRejectedValue(deleteError);

				await expect(updateUserProfileData(USER_ID, {}, profilePictureFile)).rejects.toMatchObject({ statusCode: 500, cause: dbError });

				expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('newPicture1'), deleteError);
				expect(imageStorageService.discardUploadedImage).toHaveBeenCalledWith('new-picture-id');
			});

			it('still resolves with the updated user and logs the error when the post-save destroy of the old picture fails', async () => {
				const destroyError = new AppError('Could not delete image old-picture-id', 502);

				buildUserPostModelMock();
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
				buildUserPostModelMock();
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
			it('does not look up or destroy the picture when profilePicture is absent', async () => {
				UserModel.findOne = jest.fn();
				givenUpdateResolves();

				await updateUserProfileData(USER_ID, { bio: 'New bio' });

				expect(UserModel.findOne).not.toHaveBeenCalled();
				expect(imageStorageService.deleteImage).not.toHaveBeenCalled();
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
	});

	describe('getUsersProfileDataByUserIds', () => {
		const VALID_ID = '64b7f0a1c2d3e4f5a6b7c8d1';

		const givenFindResolves = (users) => {
			const populate = jest.fn();

			populate.mockReturnValueOnce({ populate }).mockResolvedValueOnce(users);
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
	});
});
