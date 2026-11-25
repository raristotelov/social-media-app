import { act, renderHook, waitFor } from '@testing-library/react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getUserStory } from '../services/storyService';

import useUserStory from './useUserStory';

vi.mock('../services/storyService');

const unwatchedStory = { story: { isWatched: false }, stories: [{ _id: 'story1', isWatched: false }] };
const watchedStory = { story: { isWatched: true }, stories: [{ _id: 'story1', isWatched: true }] };

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const renderUserStory = ({ userId = 'user1', loggedInUser = { _id: 'me' } } = {}) => {
	let currentLoggedInUser = loggedInUser;
	const wrapper = ({ children }) => (
		<LoggedInUserContext.Provider value={{ loggedInUser: currentLoggedInUser }}>{children}</LoggedInUserContext.Provider>
	);
	const rendered = renderHook(({ id }) => useUserStory(id), { wrapper, initialProps: { id: userId } });

	return {
		...rendered,
		setLoggedInUser: (nextLoggedInUser) => {
			currentLoggedInUser = nextLoggedInUser;
		},
	};
};

describe('useUserStory', () => {
	it('has no story before the request finishes', () => {
		getUserStory.mockReturnValue(new Promise(() => {}));

		const { result } = renderUserStory();

		expect(result.current.userStory).toBeNull();
	});

	it('requests the story of that user once', async () => {
		getUserStory.mockResolvedValue(unwatchedStory);

		const { result } = renderUserStory({ userId: 'user1' });

		await waitFor(() => expect(result.current.userStory).not.toBeNull());

		expect(getUserStory).toHaveBeenCalledTimes(1);
		expect(getUserStory).toHaveBeenCalledWith({ userId: 'user1' });
	});

	it('exposes the story and the stories once loaded', async () => {
		getUserStory.mockResolvedValue(unwatchedStory);

		const { result } = renderUserStory();

		await waitFor(() => expect(result.current.userStory).toMatchObject(unwatchedStory));
	});

	it('exposes a user without an active story as a null story', async () => {
		getUserStory.mockResolvedValue({ story: null, stories: [] });

		const { result } = renderUserStory();

		await waitFor(() => expect(result.current.userStory).not.toBeNull());

		expect(result.current.userStory.story).toBeNull();
	});

	it('has no story when the request fails, so no ring shows', async () => {
		const request = buildDeferred();

		getUserStory.mockReturnValue(request.promise);

		const { result } = renderUserStory();

		await act(async () => {
			request.reject({ code: 'INTERNAL_ERROR', status: 500 });
			await request.promise.catch(() => {});
		});

		expect(result.current.userStory).toBeNull();
	});

	it('has no story for a user that cannot be found', async () => {
		getUserStory.mockRejectedValue({ code: 'USER_NOT_FOUND', status: 404 });

		const { result } = renderUserStory();

		await waitFor(() => expect(getUserStory).toHaveBeenCalledTimes(1));

		expect(result.current.userStory).toBeNull();
	});

	describe('replaceStories', () => {
		it('shows the given stories and starts from the first unwatched one', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			const stories = [
				{ _id: 'story1', isWatched: true },
				{ _id: 'story2', isWatched: false },
			];

			act(() => {
				result.current.replaceStories(stories);
			});

			expect(result.current.userStory.stories).toEqual(stories);
			expect(result.current.userStory.story).toEqual(stories[1]);
		});

		it('shows a watched story when every given story is watched', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			act(() => {
				result.current.replaceStories([{ _id: 'story1', isWatched: true }]);
			});

			expect(result.current.userStory.story).toEqual({ _id: 'story1', isWatched: true });
		});

		it('leaves no story when no stories are given', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			act(() => {
				result.current.replaceStories([]);
			});

			expect(result.current.userStory.story).toBeNull();
			expect(result.current.userStory.stories).toEqual([]);
		});

		it('sends no request, so a late view recording cannot bring a red ring back', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			act(() => {
				result.current.replaceStories([{ _id: 'story1', isWatched: true }]);
			});

			expect(getUserStory).toHaveBeenCalledTimes(1);
		});

		it('turns a red story grey in place', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory.story.isWatched).toBe(false));

			act(() => {
				result.current.replaceStories([{ _id: 'story1', isWatched: true }]);
			});

			expect(result.current.userStory.story.isWatched).toBe(true);
		});

		it('keeps the story red when a story whose photo never loaded is still unwatched', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			act(() => {
				result.current.replaceStories([
					{ _id: 'story1', isWatched: true },
					{ _id: 'story2', isWatched: false },
				]);
			});

			expect(result.current.userStory.story).toEqual({ _id: 'story2', isWatched: false });
		});

		it('leaves no story when the last story was deleted, so the ring goes', async () => {
			getUserStory.mockResolvedValue({ story: { isWatched: true }, stories: [{ _id: 'own1', isWatched: true }] });

			const { result } = renderUserStory({ userId: 'me' });

			await waitFor(() => expect(result.current.userStory.stories).toHaveLength(1));

			act(() => {
				result.current.replaceStories([]);
			});

			expect(result.current.userStory.story).toBeNull();
			expect(result.current.userStory.stories).toEqual([]);
		});

		it('gives the replaced stories to the current user', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory({ userId: 'user1' });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			act(() => {
				result.current.replaceStories([{ _id: 'story1', isWatched: true }]);
			});

			expect(result.current.userStory.userId).toBe('user1');
		});

		it('does not show replaced stories on the next profile', async () => {
			getUserStory.mockResolvedValueOnce(unwatchedStory).mockReturnValueOnce(new Promise(() => {}));

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			act(() => {
				result.current.replaceStories([{ _id: 'story1', isWatched: true }]);
			});

			rerender({ id: 'user2' });

			expect(result.current.userStory).toBeNull();
		});

		it('keeps the same function between renders for the same user', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			const firstReplaceStories = result.current.replaceStories;

			rerender({ id: 'user1' });

			expect(result.current.replaceStories).toBe(firstReplaceStories);
		});

		it('does not expose a reload', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result } = renderUserStory();

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			expect(Object.keys(result.current).sort()).toEqual(['replaceStories', 'userStory']);
		});
	});

	describe('when the profile changes', () => {
		it('requests the story of the new user', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			rerender({ id: 'user2' });

			await waitFor(() => expect(getUserStory).toHaveBeenCalledWith({ userId: 'user2' }));
		});

		it('hides the previous user story straight away instead of ringing the new profile with it', async () => {
			const secondRequest = buildDeferred();

			getUserStory.mockResolvedValueOnce(unwatchedStory).mockReturnValueOnce(secondRequest.promise);

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			rerender({ id: 'user2' });

			expect(result.current.userStory).toBeNull();

			await act(async () => {
				secondRequest.resolve(watchedStory);
				await secondRequest.promise;
			});
		});

		it('shows the new user story once it arrives', async () => {
			getUserStory.mockResolvedValueOnce(unwatchedStory).mockResolvedValueOnce(watchedStory);

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			await waitFor(() => expect(result.current.userStory?.story).toEqual({ isWatched: false }));

			rerender({ id: 'user2' });

			await waitFor(() => expect(result.current.userStory?.story).toEqual({ isWatched: true }));
		});

		it('ignores a late answer for the previous user', async () => {
			const firstRequest = buildDeferred();
			const secondRequest = buildDeferred();

			getUserStory.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise);

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			rerender({ id: 'user2' });

			await act(async () => {
				secondRequest.resolve(watchedStory);
				await secondRequest.promise;
			});

			await act(async () => {
				firstRequest.resolve(unwatchedStory);
				await firstRequest.promise;
			});

			expect(result.current.userStory.story).toEqual({ isWatched: true });
		});

		it('does not ring the old profile with the answer for the new one when they arrive out of order', async () => {
			const firstRequest = buildDeferred();
			const secondRequest = buildDeferred();

			getUserStory.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise);

			const { result, rerender } = renderUserStory({ userId: 'user1' });

			rerender({ id: 'user2' });

			await act(async () => {
				firstRequest.resolve(unwatchedStory);
				await firstRequest.promise;
			});

			expect(result.current.userStory).toBeNull();

			await act(async () => {
				secondRequest.resolve(watchedStory);
				await secondRequest.promise;
			});
		});
	});

	describe('when the signed-in user changes', () => {
		it('loads the story again, since the watched state is per viewer', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result, rerender, setLoggedInUser } = renderUserStory({ loggedInUser: { _id: 'me' } });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			setLoggedInUser({ _id: 'someone-else' });
			rerender({ id: 'user1' });

			await waitFor(() => expect(getUserStory).toHaveBeenCalledTimes(2));
		});

		it('loads the story again when a guest signs in', async () => {
			getUserStory.mockResolvedValue({ story: { isWatched: false }, stories: [] });

			const { result, rerender, setLoggedInUser } = renderUserStory({ loggedInUser: null });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			setLoggedInUser({ _id: 'me' });
			rerender({ id: 'user1' });

			await waitFor(() => expect(getUserStory).toHaveBeenCalledTimes(2));
		});

		it('does not load again when the same user object is refreshed', async () => {
			getUserStory.mockResolvedValue(unwatchedStory);

			const { result, rerender, setLoggedInUser } = renderUserStory({ loggedInUser: { _id: 'me', bio: 'a' } });

			await waitFor(() => expect(result.current.userStory).not.toBeNull());

			setLoggedInUser({ _id: 'me', bio: 'b' });
			rerender({ id: 'user1' });

			expect(getUserStory).toHaveBeenCalledTimes(1);
		});
	});

	it('ignores the answer of a request that finished after unmounting', async () => {
		const request = buildDeferred();

		getUserStory.mockReturnValue(request.promise);

		const { result, unmount } = renderUserStory();

		unmount();

		await act(async () => {
			request.resolve(unwatchedStory);
			await request.promise;
		});

		expect(result.current.userStory).toBeNull();
	});
});
