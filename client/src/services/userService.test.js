import { requestFactory } from './requester';
import {
	changePassword,
	demoLogin,
	followUser,
	getCurrentUser,
	getFollowers,
	getFollowing,
	getUsersProfileData,
	login,
	logout,
	signUp,
	unfollowUser,
	updateUserProfileData,
} from './userService';

vi.mock('./requester');

describe('userService', () => {
	describe('signUp', () => {
		it('posts the form data to the sign-up endpoint and resolves with the user', async () => {
			const post = vi.fn().mockResolvedValue({ _id: 'user1' });

			requestFactory.mockReturnValue({ post });

			await expect(signUp({ email: 'a@b.co', username: 'a', password: 'pw' })).resolves.toEqual({ _id: 'user1' });
			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/sign-up$/), { email: 'a@b.co', username: 'a', password: 'pw' });
		});
	});

	describe('login', () => {
		it('posts the credentials to the login endpoint and resolves with the user', async () => {
			const post = vi.fn().mockResolvedValue({ _id: 'user1' });

			requestFactory.mockReturnValue({ post });

			await expect(login({ email: 'a@b.co', password: 'pw' })).resolves.toEqual({ _id: 'user1' });
			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/login$/), { email: 'a@b.co', password: 'pw' });
		});
	});

	describe('demoLogin', () => {
		let post;

		beforeEach(() => {
			post = vi.fn().mockResolvedValue({ _id: 'visitor1' });
			requestFactory.mockReturnValue({ post });
		});

		it('posts to the demo login endpoint without a body', async () => {
			await demoLogin();

			expect(post).toHaveBeenCalledTimes(1);
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/demo-login$/));
		});

		it('sends no token, because the visitor is not logged in yet', async () => {
			await demoLogin();

			expect(requestFactory).toHaveBeenCalledWith();
		});

		it('resolves with the visitor user from the server', async () => {
			await expect(demoLogin()).resolves.toEqual({ _id: 'visitor1' });
		});

		it('rejects with the request error so the strip can show it', async () => {
			post.mockRejectedValue({ code: 'TOO_MANY_REQUESTS', status: 429 });

			await expect(demoLogin()).rejects.toMatchObject({ status: 429, code: 'TOO_MANY_REQUESTS' });
		});
	});

	describe('logout', () => {
		it('posts to the logout endpoint without a body', async () => {
			const post = vi.fn().mockResolvedValue({});

			requestFactory.mockReturnValue({ post });

			await logout();

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/logout$/));
		});

		it('rejects with the request error so the caller can keep the user logged in', async () => {
			requestFactory.mockReturnValue({ post: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }) });

			await expect(logout()).rejects.toMatchObject({ status: 500 });
		});
	});

	describe('getCurrentUser', () => {
		it('gets the me endpoint', async () => {
			const get = vi.fn().mockResolvedValue({ _id: 'user1' });

			requestFactory.mockReturnValue({ get });

			await expect(getCurrentUser()).resolves.toEqual({ _id: 'user1' });
			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/users\/me$/));
		});

		it('resolves with null for a guest', async () => {
			requestFactory.mockReturnValue({ get: vi.fn().mockResolvedValue(null) });

			await expect(getCurrentUser()).resolves.toBeNull();
		});

		it('rejects with the request error for an expired session', async () => {
			requestFactory.mockReturnValue({ get: vi.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 }) });

			await expect(getCurrentUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
		});
	});

	describe('changePassword', () => {
		let patch;

		beforeEach(() => {
			patch = vi.fn().mockResolvedValue({});
			requestFactory.mockReturnValue({ patch });
		});

		it('patches the password endpoint with only the current and new password', async () => {
			await changePassword({ currentPassword: 'oldPassword1', newPassword: 'newPassword1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(patch).toHaveBeenCalledWith(expect.stringMatching(/\/users\/password$/), {
				currentPassword: 'oldPassword1',
				newPassword: 'newPassword1',
			});
		});

		it('rejects with the request error so the form can show it', async () => {
			patch.mockRejectedValue({ code: 'CURRENT_PASSWORD_WRONG', status: 400 });

			await expect(changePassword({ currentPassword: 'a', newPassword: 'b' })).rejects.toMatchObject({ status: 400 });
		});
	});

	describe('getUsersProfileData', () => {
		let get;

		beforeEach(() => {
			get = vi.fn().mockResolvedValue([]);
			requestFactory.mockReturnValue({ get });
		});

		it('encodes the search word so characters like & and # reach the server', async () => {
			await getUsersProfileData({ searchWord: 'a&b#c' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/users\?searchWord=a%26b%23c$/));
		});

		it('builds the requester without a token', async () => {
			await getUsersProfileData({ userIds: ['user1'] });

			expect(requestFactory).toHaveBeenCalledWith();
		});
	});

	describe.each([
		['getFollowers', getFollowers, 'followers'],
		['getFollowing', getFollowing, 'following'],
	])('%s', (_name, getList, path) => {
		let get;

		beforeEach(() => {
			get = vi.fn().mockResolvedValue([]);
			requestFactory.mockReturnValue({ get });
		});

		it(`requests the ${path} endpoint of the user`, async () => {
			await getList({ userId: 'user1' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/users/user1/${path}$`)));
		});

		it('builds the requester without a token, the cookie lets the server put the logged-in user first', async () => {
			await getList({ userId: 'user1' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(get).toHaveBeenCalledTimes(1);
		});

		it('resolves with the rows from the server', async () => {
			const rows = [{ _id: 'user2', username: 'janedoe', followersCount: 1 }];

			get.mockResolvedValue(rows);

			await expect(getList({ userId: 'user1' })).resolves.toBe(rows);
		});

		it('rejects when the request fails', async () => {
			get.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			await expect(getList({ userId: 'user1' })).rejects.toMatchObject({ status: 500 });
		});
	});

	describe('followUser and unfollowUser', () => {
		it('posts to the follow endpoint', async () => {
			const post = vi.fn().mockResolvedValue({ user: {} });

			requestFactory.mockReturnValue({ post });

			await followUser({ userId: 'user1', userIdToFollow: 'user2' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/user1\/follow\/user2$/));
		});

		it('posts to the unfollow endpoint', async () => {
			const post = vi.fn().mockResolvedValue({ user: {} });

			requestFactory.mockReturnValue({ post });

			await unfollowUser({ userId: 'user1', userIdToUnfollow: 'user2' });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/users\/user1\/unfollow\/user2$/));
		});
	});

	describe('updateUserProfileData', () => {
		const picture = new File(['(image)'], 'me.jpg', { type: 'image/jpeg' });
		let patch;

		beforeEach(() => {
			patch = vi.fn().mockResolvedValue({ user: {} });
			requestFactory.mockReturnValue({ patch });
		});

		it('patches the update endpoint of the user', async () => {
			await updateUserProfileData({ userId: 'user1', updatedProfileData: { bio: 'Hi' } });

			expect(requestFactory).toHaveBeenCalledWith();
			expect(patch).toHaveBeenCalledWith(expect.stringMatching(/\/users\/update\/user1$/), expect.anything());
		});

		describe('when a new profile picture file is given', () => {
			it('sends multipart form data with the file under the "profilePicture" field', async () => {
				await updateUserProfileData({ userId: 'user1', updatedProfileData: { profilePicture: picture } });

				const body = patch.mock.calls[0][1];

				expect(body).toBeInstanceOf(FormData);
				expect(body.get('profilePicture')).toBeInstanceOf(File);
				expect(body.get('profilePicture').name).toBe('me.jpg');
			});

			it('sends the other changed values as text fields next to the file', async () => {
				await updateUserProfileData({
					userId: 'user1',
					updatedProfileData: { profilePicture: picture, username: 'newname', bio: '' },
				});

				const body = patch.mock.calls[0][1];

				expect(body.get('username')).toBe('newname');
				expect(body.get('bio')).toBe('');
			});
		});

		describe('when the picture is removed', () => {
			it('keeps sending JSON-able data, not form data', async () => {
				await updateUserProfileData({ userId: 'user1', updatedProfileData: { profilePicture: null } });

				expect(patch.mock.calls[0][1]).toEqual({ profilePicture: null });
			});

			it('keeps null as null next to other values', async () => {
				await updateUserProfileData({
					userId: 'user1',
					updatedProfileData: { profilePicture: null, bio: 'Hi' },
				});

				expect(patch.mock.calls[0][1]).toEqual({ profilePicture: null, bio: 'Hi' });
			});
		});

		describe('when no picture is involved', () => {
			it('sends the plain object unchanged', async () => {
				const updatedProfileData = { username: 'newname', bio: 'Hi' };

				await updateUserProfileData({ userId: 'user1', updatedProfileData });

				expect(patch.mock.calls[0][1]).toBe(updatedProfileData);
			});
		});

		it('resolves with the server response', async () => {
			await expect(updateUserProfileData({ userId: 'user1', updatedProfileData: {} })).resolves.toEqual({ user: {} });
		});
	});
});
