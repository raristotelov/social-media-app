const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const migration = require('../migrations/20261103000000-add-account-type');

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_TIMEOUT_MS = 30 * 1000;

jest.setTimeout(TEST_TIMEOUT_MS);

describe('the add-account-type migration against a real database', () => {
	let mongoServer;
	let users;

	const insert = (email, extra = {}) => users.insertOne({ email, username: email.split('@')[0], password: 'hashed-password', ...extra });

	const accountTypeOf = async (email) => (await users.findOne({ email })).accountType;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();

		await mongoose.connect(mongoServer.getUri());

		users = mongoose.connection.db.collection('users');
	}, SERVER_START_TIMEOUT_MS);

	afterAll(async () => {
		await mongoose.disconnect();
		await mongoServer?.stop();
	});

	beforeEach(async () => {
		await users.deleteMany({});
	});

	describe('up', () => {
		it('should mark a persona email as a persona', async () => {
			await insert('creator.anna@demo.invalid');

			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('creator.anna@demo.invalid')).toBe('persona');
		});

		it('should mark a visitor email as a demo account', async () => {
			await insert('john_demo_2@visitor.demo.invalid');

			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('john_demo_2@visitor.demo.invalid')).toBe('demo');
		});

		it('should mark every other existing user as a regular user', async () => {
			await insert('jane@example.com');
			await insert('old.timer@gmail.com');

			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('jane@example.com')).toBe('user');
			expect(await accountTypeOf('old.timer@gmail.com')).toBe('user');
		});

		it('should not mistake a visitor email for a persona email', async () => {
			await insert('someone@visitor.demo.invalid');

			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('someone@visitor.demo.invalid')).not.toBe('persona');
		});

		it.each(['almost@demo.invalid.example.com', 'almost@notdemo.invalid', 'almost@demo-invalid', 'visitor.demo.invalid@example.com'])(
			'should treat %s as a regular user',
			async (email) => {
				await insert(email);

				await migration.up(mongoose.connection.db);

				expect(await accountTypeOf(email)).toBe('user');
			},
		);

		it('should handle all three kinds in one run', async () => {
			await insert('p@demo.invalid');
			await insert('v@visitor.demo.invalid');
			await insert('u@example.com');

			await migration.up(mongoose.connection.db);

			expect(await users.countDocuments({ accountType: 'persona' })).toBe(1);
			expect(await users.countDocuments({ accountType: 'demo' })).toBe(1);
			expect(await users.countDocuments({ accountType: 'user' })).toBe(1);
		});

		it('should leave an account type that is already set alone when the email is an ordinary one', async () => {
			await insert('custom@example.com', { accountType: 'persona' });

			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('custom@example.com')).toBe('persona');
		});

		it('should not touch any other field or remove any user', async () => {
			await insert('jane@example.com', { bio: 'a bio', theme: 'dark' });

			await migration.up(mongoose.connection.db);

			const user = await users.findOne({ email: 'jane@example.com' });

			expect(await users.countDocuments()).toBe(1);
			expect(user).toMatchObject({ username: 'jane', password: 'hashed-password', bio: 'a bio', theme: 'dark' });
		});

		it('should give the same result when run twice', async () => {
			await insert('p@demo.invalid');
			await insert('v@visitor.demo.invalid');
			await insert('u@example.com');

			await migration.up(mongoose.connection.db);
			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('p@demo.invalid')).toBe('persona');
			expect(await accountTypeOf('v@visitor.demo.invalid')).toBe('demo');
			expect(await accountTypeOf('u@example.com')).toBe('user');
		});

		it('should run on an empty collection without failing', async () => {
			await expect(migration.up(mongoose.connection.db)).resolves.toBeUndefined();
		});
	});

	describe('down', () => {
		it('should remove the account type from every user', async () => {
			await insert('p@demo.invalid');
			await insert('v@visitor.demo.invalid');
			await insert('u@example.com');
			await migration.up(mongoose.connection.db);

			await migration.down(mongoose.connection.db);

			expect(await users.countDocuments({ accountType: { $exists: true } })).toBe(0);
		});

		it('should keep every user and their other fields', async () => {
			await insert('u@example.com', { bio: 'a bio' });
			await migration.up(mongoose.connection.db);

			await migration.down(mongoose.connection.db);

			const user = await users.findOne({ email: 'u@example.com' });

			expect(await users.countDocuments()).toBe(1);
			expect(user.bio).toBe('a bio');
		});

		it('should run on an empty collection without failing', async () => {
			await expect(migration.down(mongoose.connection.db)).resolves.toBeUndefined();
		});

		it('should leave the data as it was before up, so the migration can be run again', async () => {
			await insert('p@demo.invalid');
			await insert('u@example.com');
			await migration.up(mongoose.connection.db);
			await migration.down(mongoose.connection.db);
			await migration.up(mongoose.connection.db);

			expect(await accountTypeOf('p@demo.invalid')).toBe('persona');
			expect(await accountTypeOf('u@example.com')).toBe('user');
		});
	});
});
