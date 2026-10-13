import { requestFactory } from './requester';
import { updateUserProfileData } from './userService';

jest.mock('./requester');

describe('userService', () => {
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
