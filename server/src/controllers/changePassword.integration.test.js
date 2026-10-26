const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const JWT = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const UserModel = require('../models/userModel');
const constants = require('../config/constants');
const { ERROR_CODES } = require('../config/errorCodes');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;
const JWT_SECRET = 'change-password-integration-test-secret';
const OLD_PASSWORD = 'oldPassword1';
const NEW_PASSWORD = 'newPassword1';

jest.setTimeout(TEST_TIMEOUT_MS);

describe('PATCH /users/password against a real database', () => {
	let mongoServer;
	let server;
	let baseUrl;
	let originalJwtSecret;
	let user;
	let otherUser;

	const authHeaders = (target) => ({
		'X-Authorization': JWT.sign({ userId: String(target._id), username: target.username }, JWT_SECRET),
		'Content-Type': 'application/json',
	});

	const patchPassword = (payload, headers = authHeaders(user)) =>
		fetch(`${baseUrl}/users/password`, { method: 'PATCH', headers, body: JSON.stringify(payload) });

	const login = (password) =>
		fetch(`${baseUrl}/users/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'owner@example.com', password }),
		});

	const storedHashOf = async (target) => (await UserModel.findById(target._id).select({ password: 1 })).password;

	beforeAll(async () => {
		originalJwtSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = JWT_SECRET;

		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());
		await UserModel.init();

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
		await UserModel.deleteMany({});

		const hashedOldPassword = await bcrypt.hash(OLD_PASSWORD, constants.SALT_ROUNDS);

		user = await UserModel.create({ email: 'owner@example.com', username: 'owner', password: hashedOldPassword });
		otherUser = await UserModel.create({ email: 'other@example.com', username: 'other', password: hashedOldPassword });
	});

	it('stores a bcrypt hash of the new password, never the plaintext', async () => {
		const response = await patchPassword({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
		const storedHash = await storedHashOf(user);

		expect(response.status).toBe(204);
		expect(storedHash).not.toBe(NEW_PASSWORD);
		expect(storedHash).toMatch(/^\$2[aby]\$/);
		await expect(bcrypt.compare(NEW_PASSWORD, storedHash)).resolves.toBe(true);
	});

	it('returns an empty body, without the password or its hash', async () => {
		const response = await patchPassword({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
		const text = await response.text();

		expect(text).toBe('');
	});

	it('stops the old password working and lets the new one log in', async () => {
		await patchPassword({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });

		expect((await login(OLD_PASSWORD)).status).toBe(401);
		expect((await login(NEW_PASSWORD)).status).toBe(200);
	});

	it('answers 400 CURRENT_PASSWORD_WRONG for a wrong current password and leaves the stored hash untouched', async () => {
		const hashBefore = await storedHashOf(user);

		const response = await patchPassword({ currentPassword: 'wrongPassword1', newPassword: NEW_PASSWORD });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ fields: { currentPassword: ERROR_CODES.CURRENT_PASSWORD_WRONG } });
		expect(await storedHashOf(user)).toBe(hashBefore);
	});

	it('answers 400 PASSWORD_UNCHANGED when the new password equals the current one and leaves the stored hash untouched', async () => {
		const hashBefore = await storedHashOf(user);

		const response = await patchPassword({ currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ fields: { newPassword: ERROR_CODES.PASSWORD_UNCHANGED } });
		expect(await storedHashOf(user)).toBe(hashBefore);
	});

	it('changes only the token user, ignoring a user id in the body', async () => {
		const otherHashBefore = await storedHashOf(otherUser);

		await patchPassword({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, userId: String(otherUser._id) });

		expect(await storedHashOf(otherUser)).toBe(otherHashBefore);
		await expect(bcrypt.compare(NEW_PASSWORD, await storedHashOf(user))).resolves.toBe(true);
	});

	it('answers 401 without a token and changes nothing', async () => {
		const hashBefore = await storedHashOf(user);

		const response = await patchPassword({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, { 'Content-Type': 'application/json' });

		expect(response.status).toBe(401);
		expect(await storedHashOf(user)).toBe(hashBefore);
	});
});
