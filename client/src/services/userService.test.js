import { requestFactory } from './requester';
import { getUsersProfileData, getFollowers, getFollowing, updateUserProfileData } from './userService';

jest.mock('./requester');

describe('userService', () => {
	describe('getUsersProfileData', () => {
		let get;

		beforeEach(() => {
			get = jest.fn().mockResolvedValue([]);
			requestFactory.mockReturnValue({ get });
		});

		it('encodes the search word so characters like & and # reach the server', async () => {
			await getUsersProfileData({ searchWord: 'a&b#c' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/users\?searchWord=a%26b%23c$/));
		});
	});

	describe.each([
		['getFollowers', getFollowers, 'followers'],
		['getFollowing', getFollowing, 'following'],
	])('%s', (_name, getList, path) => {
		let get;

		beforeEach(() => {
			get = jest.fn().mockResolvedValue([]);
			requestFactory.mockReturnValue({ get });
		});

		it(`requests the ${path} endpoint of the user`, async () => {
			await getList({ userId: 'user1', jwtToken: 'token123' });

			expect(get).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/users/user1/${path}$`)));
		});

		it('sends the token so the server can put the logged-in user first', async () => {
			await getList({ userId: 'user1', jwtToken: 'token123' });

			expect(requestFactory).toHaveBeenCalledWith('token123');
		});

		it('works without a token for a guest', async () => {
			await getList({ userId: 'user1' });

			expect(requestFactory).toHaveBeenCalledWith(undefined);
			expect(get).toHaveBeenCalledTimes(1);
		});

		it('resolves with the rows from the server', async () => {
			const rows = [{ _id: 'user2', username: 'janedoe', followersCount: 1 }];

			get.mockResolvedValue(rows);

			await expect(getList({ userId: 'user1', jwtToken: 'token123' })).resolves.toBe(rows);
		});

		it('rejects when the request fails', async () => {
			get.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			await expect(getList({ userId: 'user1' })).rejects.toMatchObject({ status: 500 });
		});
	});

	describe('updateUserProfileData', () => {
		const picture = new File(['(image)'], 'me.jpg', { type: 'image/jpeg' });
		let patch;

		beforeEach(() => {
			patch = jest.fn().mockResolvedValue({ user: {}, jwt: 'jwt' });
			requestFactory.mockReturnValue({ patch });
		});

		it('patches the update endpoint of the user with the token', async () => {
			await updateUserProfileData({ userId: 'user1', jwtToken: 'token123', updatedProfileData: { bio: 'Hi' } });

			expect(requestFactory).toHaveBeenCalledWith('token123');
			expect(patch).toHaveBeenCalledWith(expect.stringMatching(/\/users\/update\/user1$/), expect.anything());
		});

		describe('when a new profile picture file is given', () => {
			it('sends multipart form data with the file under the "profilePicture" field', async () => {
				await updateUserProfileData({ userId: 'user1', jwtToken: 'token123', updatedProfileData: { profilePicture: picture } });

				const body = patch.mock.calls[0][1];

				expect(body).toBeInstanceOf(FormData);
				expect(body.get('profilePicture')).toBeInstanceOf(File);
				expect(body.get('profilePicture').name).toBe('me.jpg');
			});

			it('sends the other changed values as text fields next to the file', async () => {
				await updateUserProfileData({
					userId: 'user1',
					jwtToken: 'token123',
					updatedProfileData: { profilePicture: picture, username: 'newname', bio: '' },
				});

				const body = patch.mock.calls[0][1];

				expect(body.get('username')).toBe('newname');
				expect(body.get('bio')).toBe('');
			});
		});

		describe('when the picture is removed', () => {
			it('keeps sending JSON-able data, not form data', async () => {
				await updateUserProfileData({ userId: 'user1', jwtToken: 'token123', updatedProfileData: { profilePicture: null } });

				expect(patch.mock.calls[0][1]).toEqual({ profilePicture: null });
			});

			it('keeps null as null next to other values', async () => {
				await updateUserProfileData({
					userId: 'user1',
					jwtToken: 'token123',
					updatedProfileData: { profilePicture: null, bio: 'Hi' },
				});

				expect(patch.mock.calls[0][1]).toEqual({ profilePicture: null, bio: 'Hi' });
			});
		});

		describe('when no picture is involved', () => {
			it('sends the plain object unchanged', async () => {
				const updatedProfileData = { username: 'newname', bio: 'Hi' };

				await updateUserProfileData({ userId: 'user1', jwtToken: 'token123', updatedProfileData });

				expect(patch.mock.calls[0][1]).toBe(updatedProfileData);
			});
		});

		it('resolves with the server response', async () => {
			await expect(updateUserProfileData({ userId: 'user1', jwtToken: 'token123', updatedProfileData: {} })).resolves.toEqual({
				user: {},
				jwt: 'jwt',
			});
		});
	});
});
