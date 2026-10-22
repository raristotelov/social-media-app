import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { deleteStory, getStoryViewers, getUserStories, markStoryViewed } from '../../services/storyService';

import ToastProvider from '../ToastProvider/ToastProvider';

import StoryViewer from './StoryViewer';

jest.mock('../../services/storyService');

const LOAD_ERROR_TOAST = "Couldn't load stories. Try again.";
const DELETE_ERROR_TOAST = "Couldn't delete your story. Try again.";

const minutesAgoIso = (minutes) => new Date(Date.now() - minutes * 60 * 1000 - 1000).toISOString();

const buildStory = (id, overrides = {}) => ({
	_id: id,
	imageUrl: `https://example.com/${id}.jpg`,
	imageWidth: 1080,
	imageHeight: 1920,
	createdAt: minutesAgoIso(5),
	...overrides,
});

const buildStoriesByUser = () => ({
	me: [buildStory('m1', { viewersCount: 3 }), buildStory('m2')],
	alice: [buildStory('a1', { isWatched: true }), buildStory('a2', { isWatched: false }), buildStory('a3', { isWatched: false })],
	bob: [buildStory('b1', { isWatched: true }), buildStory('b2', { isWatched: false })],
});

const buildQueue = () => [
	{ user: { _id: 'me', username: 'me' }, isOwn: true, isWatched: true },
	{ user: { _id: 'alice', username: 'alice', profilePicture: { imageUrl: 'https://example.com/alice.jpg' } }, isOwn: false, isWatched: false },
	{ user: { _id: 'bob', username: 'bob' }, isOwn: false, isWatched: false },
];

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

let storiesByUser;

const renderViewer = ({ queue = buildQueue(), startIndex = 1, onClose = jest.fn(), endSession = jest.fn() } = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: { _id: 'me' }, endSession }}>
			<ToastProvider>
				<MemoryRouter>
					<StoryViewer queue={queue} startIndex={startIndex} onClose={onClose} />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onClose, endSession };
};

const openViewer = async (options) => {
	const rendered = renderViewer(options);

	await screen.findByAltText(/^Story by/);

	return rendered;
};

const getViewer = () => screen.getByRole('dialog', { name: 'Story viewer' });
const getPhoto = () => screen.getByAltText(/^Story by/);
const getPhotoName = () => getPhoto().getAttribute('src').split('/').pop().replace('.jpg', '');
const loadPhoto = () => fireEvent.load(getPhoto());
const finishSegment = () => fireEvent.animationEnd(document.querySelector('.story-viewer-segment-fill-active'));
const tapNext = () => userEvent.click(document.querySelector('.story-viewer-zone-next'));
const tapPrevious = () => userEvent.click(document.querySelector('.story-viewer-zone-previous'));
const getToastText = () => document.querySelector('.toast-region').textContent;
const closeOverlay = () => userEvent.click(document.querySelector('.popup-close'));

describe('StoryViewer', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		storiesByUser = buildStoriesByUser();
		getUserStories.mockImplementation(({ userId }) => Promise.resolve({ user: { _id: userId }, stories: storiesByUser[userId] }));
		markStoryViewed.mockResolvedValue({});
		getStoryViewers.mockResolvedValue([]);
		deleteStory.mockResolvedValue({});
	});

	describe('opening', () => {
		it('is a modal dialog named "Story viewer"', async () => {
			await openViewer();

			expect(getViewer()).toHaveAttribute('aria-modal', 'true');
		});

		it("requests the stories of the user it starts on, with the token, and nobody else's", async () => {
			await openViewer({ startIndex: 1 });

			expect(getUserStories).toHaveBeenCalledTimes(1);
			expect(getUserStories).toHaveBeenCalledWith({ userId: 'alice', jwtToken: 'token123' });
		});

		it('shows a spinner and no photo while the stories load', () => {
			getUserStories.mockReturnValue(new Promise(() => {}));

			renderViewer();

			expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
			expect(screen.queryByAltText(/^Story by/)).not.toBeInTheDocument();
		});

		it("opens on the user's first unwatched story", async () => {
			await openViewer({ startIndex: 1 });

			expect(getPhotoName()).toBe('a2');
		});

		it('opens on the first story when every story is watched', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: true }), buildStory('a2', { isWatched: true })];

			await openViewer({ startIndex: 1 });

			expect(getPhotoName()).toBe('a1');
		});

		it('opens on the first story when none are watched', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false }), buildStory('a2', { isWatched: false })];

			await openViewer({ startIndex: 1 });

			expect(getPhotoName()).toBe('a1');
		});

		it('opens your own stories on the first one', async () => {
			await openViewer({ startIndex: 0 });

			expect(getPhotoName()).toBe('m1');
		});

		it('shows one progress segment per story', async () => {
			await openViewer({ startIndex: 1 });

			expect(document.querySelectorAll('.story-viewer-segment')).toHaveLength(3);
		});

		it('fills the segments of earlier stories completely and animates the current one', async () => {
			await openViewer({ startIndex: 1 });

			expect(document.querySelectorAll('.story-viewer-segment-fill-complete')).toHaveLength(1);
			expect(document.querySelectorAll('.story-viewer-segment-fill-active')).toHaveLength(1);
			expect(document.querySelectorAll('.story-viewer-segment-fill')).toHaveLength(2);
		});

		it('shows the poster username and profile picture', async () => {
			await openViewer({ startIndex: 1 });

			expect(screen.getByText('alice')).toBeInTheDocument();
			expect(document.querySelector('.story-viewer-avatar')).toHaveAttribute('src', 'https://example.com/alice.jpg');
		});

		it('shows no reply input', async () => {
			await openViewer({ startIndex: 1 });

			expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
		});
	});

	describe('the time label', () => {
		it.each([
			['a few seconds old', 0.1, '1m'],
			['5 minutes old', 5, '5m'],
			['59 minutes old', 59, '59m'],
			['an hour old', 60, '1h'],
			['3 hours old', 3 * 60 + 10, '3h'],
			['23 hours old', 23 * 60 + 10, '23h'],
		])('shows a story that is %s as "%s"', async (name, minutes, expected) => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false, createdAt: minutesAgoIso(minutes) })];

			await openViewer({ startIndex: 1 });

			expect(document.querySelector('.story-viewer-age')).toHaveTextContent(expected);
		});

		it('follows the story that is showing', async () => {
			storiesByUser.alice = [
				buildStory('a1', { isWatched: false, createdAt: minutesAgoIso(10) }),
				buildStory('a2', { isWatched: false, createdAt: minutesAgoIso(130) }),
			];

			await openViewer({ startIndex: 1 });
			tapNext();

			expect(document.querySelector('.story-viewer-age')).toHaveTextContent('2h');
		});
	});

	describe('the 5 second timer', () => {
		it('is paused until the photo has loaded', async () => {
			await openViewer({ startIndex: 1 });

			expect(getViewer()).toHaveClass('story-viewer-paused');
		});

		it('starts when the photo has loaded', async () => {
			await openViewer({ startIndex: 1 });

			loadPhoto();

			expect(getViewer()).not.toHaveClass('story-viewer-paused');
		});

		it('fills the progress segment over 5 seconds', async () => {
			await openViewer({ startIndex: 1 });

			expect(document.querySelector('.story-viewer-segment-fill-active')).toHaveStyle({ animationDuration: '5000ms' });
		});

		it('moves to the next story when the segment has filled', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();

			finishSegment();

			expect(getPhotoName()).toBe('a3');
		});

		it('waits for the next photo to load before running the next 5 seconds', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();

			finishSegment();

			expect(getViewer()).toHaveClass('story-viewer-paused');
		});

		it('stays paused after going back until the remounted photo has loaded', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();
			expect(getViewer()).not.toHaveClass('story-viewer-paused');

			tapPrevious();

			expect(getPhotoName()).toBe('a1');
			expect(getViewer()).toHaveClass('story-viewer-paused');

			loadPhoto();

			expect(getViewer()).not.toHaveClass('story-viewer-paused');
		});

		it.each([
			['forward to the next story', () => tapNext()],
			['back to the previous story', () => tapPrevious()],
		])('starts playback when the photo loads straight after moving %s', async (name, move) => {
			await openViewer({ startIndex: 1 });
			loadPhoto();

			move();
			loadPhoto();

			await waitFor(() => expect(getViewer()).not.toHaveClass('story-viewer-paused'));
		});

		it('starts playback when the first photo of the next user loads straight after the move', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];
			await openViewer({ startIndex: 1 });
			loadPhoto();

			finishSegment();
			await screen.findByAltText('Story by bob');
			loadPhoto();

			expect(getViewer()).not.toHaveClass('story-viewer-paused');
		});

		it('stays paused when returning to a story whose photo had loaded before, until it loads again', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();
			tapNext();
			loadPhoto();

			tapPrevious();

			expect(getPhotoName()).toBe('a2');
			expect(getViewer()).toHaveClass('story-viewer-paused');
		});

		it('restarts the fill for the new story', async () => {
			await openViewer({ startIndex: 1 });
			const firstFill = document.querySelector('.story-viewer-segment-fill-active');

			finishSegment();

			expect(document.querySelector('.story-viewer-segment-fill-active')).not.toBe(firstFill);
			expect(document.querySelectorAll('.story-viewer-segment-fill-complete')).toHaveLength(2);
		});

		it('continues to the next user in the tray after the last story of a user', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];

			await openViewer({ startIndex: 1 });
			finishSegment();

			expect(await screen.findByAltText('Story by bob')).toBeInTheDocument();
			expect(getUserStories).toHaveBeenCalledWith({ userId: 'bob', jwtToken: 'token123' });
		});

		it('starts the next user on their first unwatched story, not their first story', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];

			await openViewer({ startIndex: 1 });
			finishSegment();

			await screen.findByAltText('Story by bob');
			expect(getPhotoName()).toBe('b2');
		});

		it('starts the next user on their first story when they are all watched', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];
			storiesByUser.bob = [buildStory('b1', { isWatched: true }), buildStory('b2', { isWatched: true })];

			await openViewer({ startIndex: 1 });
			finishSegment();

			await screen.findByAltText('Story by bob');
			expect(getPhotoName()).toBe('b1');
		});

		it('closes after the last story of the last user', async () => {
			const { onClose } = await openViewer({ startIndex: 2 });

			finishSegment();

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not close before the last story of the last user', async () => {
			const { onClose } = await openViewer({ startIndex: 1 });

			finishSegment();

			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('tapping', () => {
		it('goes forward when the right side is tapped', async () => {
			await openViewer({ startIndex: 1 });

			tapNext();

			expect(getPhotoName()).toBe('a3');
		});

		it('moves exactly one story for one tap', async () => {
			storiesByUser.alice = [
				buildStory('a1', { isWatched: false }),
				buildStory('a2', { isWatched: false }),
				buildStory('a3', { isWatched: false }),
				buildStory('a4', { isWatched: false }),
			];

			await openViewer({ startIndex: 1 });
			tapNext();

			expect(getPhotoName()).toBe('a2');
		});

		it('goes back when the left side is tapped', async () => {
			await openViewer({ startIndex: 1 });

			tapPrevious();

			expect(getPhotoName()).toBe('a1');
		});

		it('goes to the next user from the last story of a user', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];

			await openViewer({ startIndex: 1 });
			tapNext();

			expect(await screen.findByAltText('Story by bob')).toBeInTheDocument();
		});

		it("goes to the previous user's last story from a user's first story", async () => {
			await openViewer({ startIndex: 2 });
			tapPrevious();
			expect(getPhotoName()).toBe('b1');

			tapPrevious();

			await waitFor(() => expect(screen.getByAltText('Story by alice')).toBeInTheDocument());
			expect(getPhotoName()).toBe('a3');
		});

		it("goes to the previous user's last story even when that user's stories were loaded before", async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false }), buildStory('a2', { isWatched: false })];

			await openViewer({ startIndex: 1 });
			tapNext();
			tapNext();
			await screen.findByAltText('Story by bob');
			tapPrevious();
			tapPrevious();

			await screen.findByAltText('Story by alice');
			expect(getPhotoName()).toBe('a2');
		});

		it('does nothing on the very first story', async () => {
			const { onClose } = await openViewer({ startIndex: 0 });

			tapPrevious();

			expect(getPhotoName()).toBe('m1');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('closes after the last story when the right side is tapped', async () => {
			const { onClose } = await openViewer({ startIndex: 2 });

			tapNext();

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not move a story that is still loading its user', () => {
			getUserStories.mockReturnValue(new Promise(() => {}));
			const { onClose } = renderViewer({ startIndex: 1 });

			tapNext();
			tapPrevious();

			expect(onClose).not.toHaveBeenCalled();
			expect(getUserStories).toHaveBeenCalledTimes(1);
		});

		it('moves with a keyboard activation of the side buttons', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.click(document.querySelector('.story-viewer-zone-next'));
			expect(getPhotoName()).toBe('a3');

			fireEvent.click(document.querySelector('.story-viewer-zone-previous'));
			expect(getPhotoName()).toBe('a2');
		});

		it('does not move twice for one mouse click (pointer release already navigated)', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.click(document.querySelector('.story-viewer-zone-next'), { detail: 1 });

			expect(getPhotoName()).toBe('a2');
		});
	});

	describe('holding', () => {
		let nowSpy;
		let currentTime;

		beforeEach(() => {
			currentTime = 1_000_000;
			nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
		});

		afterEach(() => {
			nowSpy.mockRestore();
		});

		it('pauses while the finger is down', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();

			fireEvent.pointerDown(document.querySelector('.story-viewer-zone-next'));

			expect(getViewer()).toHaveClass('story-viewer-paused');
		});

		it('resumes when the finger is lifted, without moving to another story', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();
			const zone = document.querySelector('.story-viewer-zone-next');

			fireEvent.pointerDown(zone);
			currentTime += 600;
			fireEvent.pointerUp(zone);

			expect(getViewer()).not.toHaveClass('story-viewer-paused');
			expect(getPhotoName()).toBe('a2');
		});

		it('does not go back when a hold on the left side is released', async () => {
			await openViewer({ startIndex: 1 });
			const zone = document.querySelector('.story-viewer-zone-previous');

			fireEvent.pointerDown(zone);
			currentTime += 600;
			fireEvent.pointerUp(zone);

			expect(getPhotoName()).toBe('a2');
		});

		it('treats a quick press as a tap', async () => {
			await openViewer({ startIndex: 1 });
			const zone = document.querySelector('.story-viewer-zone-next');

			fireEvent.pointerDown(zone);
			currentTime += 100;
			fireEvent.pointerUp(zone);

			expect(getPhotoName()).toBe('a3');
		});

		it('resumes without moving when the finger slides off the side', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();
			const zone = document.querySelector('.story-viewer-zone-next');

			fireEvent.pointerDown(zone);
			fireEvent.pointerLeave(zone);
			fireEvent.pointerUp(zone);

			expect(getViewer()).not.toHaveClass('story-viewer-paused');
			expect(getPhotoName()).toBe('a2');
		});

		it('resumes without moving when the press is cancelled', async () => {
			await openViewer({ startIndex: 1 });
			loadPhoto();
			const zone = document.querySelector('.story-viewer-zone-next');

			fireEvent.pointerDown(zone);
			fireEvent.pointerCancel(zone);

			expect(getViewer()).not.toHaveClass('story-viewer-paused');
			expect(getPhotoName()).toBe('a2');
		});
	});

	describe('the keyboard and desktop arrows', () => {
		it('goes forward on the right arrow key', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.keyDown(document, { key: 'ArrowRight' });

			expect(getPhotoName()).toBe('a3');
		});

		it('goes back on the left arrow key', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.keyDown(document, { key: 'ArrowLeft' });

			expect(getPhotoName()).toBe('a1');
		});

		it('closes on Escape', async () => {
			const { onClose } = await openViewer({ startIndex: 1 });

			fireEvent.keyDown(document, { key: 'Escape' });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('has a next arrow that goes forward', async () => {
			await openViewer({ startIndex: 1 });

			userEvent.click(document.querySelector('.story-viewer-arrow-next'));

			expect(getPhotoName()).toBe('a3');
		});

		it('has a previous arrow that goes back', async () => {
			await openViewer({ startIndex: 1 });

			userEvent.click(document.querySelector('.story-viewer-arrow-previous'));

			expect(getPhotoName()).toBe('a1');
		});

		it('has no previous arrow on the very first story', async () => {
			await openViewer({ startIndex: 0 });

			expect(document.querySelector('.story-viewer-arrow-previous')).not.toBeInTheDocument();
		});

		it('has a previous arrow on a first story of a later user', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];

			await openViewer({ startIndex: 1 });

			expect(document.querySelector('.story-viewer-arrow-previous')).toBeInTheDocument();
		});

		it('always has a next arrow, which closes after the very last story', async () => {
			const { onClose } = await openViewer({ startIndex: 2 });

			userEvent.click(document.querySelector('.story-viewer-arrow-next'));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes from the close button', async () => {
			const { onClose } = await openViewer({ startIndex: 1 });

			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	describe('how the photo is laid out', () => {
		it('lets a photo within 0.02 of 9:16 fill the frame, with no blurred copy', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false, imageWidth: 1080, imageHeight: 1920 })];

			await openViewer({ startIndex: 1 });

			expect(getPhoto()).toHaveClass('story-viewer-photo-cover');
			expect(document.querySelector('.story-viewer-media-blur')).not.toBeInTheDocument();
		});

		it('shows any other photo whole, over a blurred copy of the same photo', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false, imageWidth: 1920, imageHeight: 1080 })];

			await openViewer({ startIndex: 1 });

			expect(getPhoto()).not.toHaveClass('story-viewer-photo-cover');
			expect(document.querySelector('.story-viewer-media-blur')).toHaveAttribute('src', 'https://example.com/a1.jpg');
			expect(document.querySelector('.story-viewer-media-blur')).toHaveAttribute('aria-hidden', 'true');
		});

		it('treats a square photo as an "other" photo', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false, imageWidth: 1000, imageHeight: 1000 })];

			await openViewer({ startIndex: 1 });

			expect(document.querySelector('.story-viewer-media-blur')).toBeInTheDocument();
		});
	});

	describe('a photo that fails to load', () => {
		it('is skipped straight away', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.error(getPhoto());

			expect(getPhotoName()).toBe('a3');
		});

		it('is not recorded as viewed', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.error(getPhoto());

			expect(markStoryViewed).not.toHaveBeenCalled();
		});

		it('goes on to the next user when it was the last story of a user', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];

			await openViewer({ startIndex: 1 });
			fireEvent.error(getPhoto());

			expect(await screen.findByAltText('Story by bob')).toBeInTheDocument();
		});

		it('closes the viewer when it was the very last story', async () => {
			const { onClose } = await openViewer({ startIndex: 2 });

			fireEvent.error(getPhoto());

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('still lets the next story be recorded when it loads', async () => {
			await openViewer({ startIndex: 1 });

			fireEvent.error(getPhoto());
			loadPhoto();

			expect(markStoryViewed).toHaveBeenCalledTimes(1);
			expect(markStoryViewed).toHaveBeenCalledWith({ storyId: 'a3', jwtToken: 'token123' });
		});
	});

	describe('recording a view', () => {
		it('does not record before the photo has loaded', async () => {
			await openViewer({ startIndex: 1 });

			expect(markStoryViewed).not.toHaveBeenCalled();
		});

		it('records the story once its photo has loaded on screen', async () => {
			await openViewer({ startIndex: 1 });

			loadPhoto();

			expect(markStoryViewed).toHaveBeenCalledTimes(1);
			expect(markStoryViewed).toHaveBeenCalledWith({ storyId: 'a2', jwtToken: 'token123' });
		});

		it('records a story that was tapped past before 5 seconds, as long as its photo had loaded', async () => {
			await openViewer({ startIndex: 1 });

			loadPhoto();
			tapNext();

			expect(markStoryViewed).toHaveBeenCalledWith({ storyId: 'a2', jwtToken: 'token123' });
		});

		it('does not record a story that was tapped past before its photo loaded', async () => {
			await openViewer({ startIndex: 1 });

			tapNext();

			expect(markStoryViewed).not.toHaveBeenCalled();
		});

		it('records a story only once, even if its photo loads again', async () => {
			await openViewer({ startIndex: 1 });

			loadPhoto();
			loadPhoto();

			expect(markStoryViewed).toHaveBeenCalledTimes(1);
		});

		it('does not record a story again when you go back to it', async () => {
			await openViewer({ startIndex: 1 });

			loadPhoto();
			tapNext();
			loadPhoto();
			tapPrevious();
			loadPhoto();

			expect(markStoryViewed.mock.calls.filter(([{ storyId }]) => storyId === 'a2')).toHaveLength(1);
			expect(markStoryViewed).toHaveBeenCalledTimes(2);
		});

		it('records each story of a user as it loads', async () => {
			await openViewer({ startIndex: 1 });

			loadPhoto();
			finishSegment();
			loadPhoto();

			expect(markStoryViewed.mock.calls.map(([{ storyId }]) => storyId)).toEqual(['a2', 'a3']);
		});

		it('never records a view of your own story', async () => {
			await openViewer({ startIndex: 0 });

			loadPhoto();

			expect(markStoryViewed).not.toHaveBeenCalled();
		});

		it('fails silently: no toast and the viewer carries on', async () => {
			markStoryViewed.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onClose } = await openViewer({ startIndex: 1 });

			loadPhoto();
			await waitFor(() => expect(markStoryViewed).toHaveBeenCalled());

			expect(getToastText()).toBe('');
			expect(onClose).not.toHaveBeenCalled();
			expect(getPhotoName()).toBe('a2');
		});

		it('fails silently for a story that has expired meanwhile', async () => {
			markStoryViewed.mockRejectedValue({ code: 'STORY_NOT_FOUND', status: 404 });
			const { onClose, endSession } = await openViewer({ startIndex: 1 });

			loadPhoto();
			await waitFor(() => expect(markStoryViewed).toHaveBeenCalled());

			expect(getToastText()).toBe('');
			expect(onClose).not.toHaveBeenCalled();
			expect(endSession).not.toHaveBeenCalled();
		});

		it('ends the session when the token is no longer valid', async () => {
			markStoryViewed.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = await openViewer({ startIndex: 1 });

			loadPhoto();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe('when the stories cannot be loaded', () => {
		it('closes the viewer and shows the load error toast', async () => {
			getUserStories.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			const { onClose } = renderViewer({ startIndex: 1 });

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(getToastText()).toBe(LOAD_ERROR_TOAST);
		});

		it('shows the same toast for a network failure', async () => {
			getUserStories.mockRejectedValue(new Error('network down'));

			const { onClose } = renderViewer({ startIndex: 1 });

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(getToastText()).toBe(LOAD_ERROR_TOAST);
		});

		it('shows the same toast when the user no longer exists', async () => {
			getUserStories.mockRejectedValue({ code: 'USER_NOT_FOUND', status: 404 });

			const { onClose } = renderViewer({ startIndex: 1 });

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(getToastText()).toBe(LOAD_ERROR_TOAST);
		});

		it('ends the session, with no toast, when the token is no longer valid', async () => {
			getUserStories.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { onClose, endSession } = renderViewer({ startIndex: 1 });

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(getToastText()).toBe('');
		});

		it('closes with the toast when the next user fails to load', async () => {
			storiesByUser.alice = [buildStory('a1', { isWatched: false })];
			getUserStories.mockImplementation(({ userId }) =>
				userId === 'bob'
					? Promise.reject({ code: 'INTERNAL_ERROR', status: 500 })
					: Promise.resolve({ user: { _id: userId }, stories: storiesByUser[userId] }),
			);

			const { onClose } = await openViewer({ startIndex: 1 });

			tapNext();

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(getToastText()).toBe(LOAD_ERROR_TOAST);
		});

		it('shows no toast when everything loads', async () => {
			await openViewer({ startIndex: 1 });

			expect(getToastText()).toBe('');
		});
	});

	describe('your own stories: Seen by', () => {
		it('shows the number of viewers of the story that is showing', async () => {
			await openViewer({ startIndex: 0 });

			expect(screen.getByRole('button', { name: 'Seen by 3' })).toBeInTheDocument();
		});

		it('is hidden while the story has no viewers, with the trash icon still there', async () => {
			await openViewer({ startIndex: 0 });

			tapNext();

			expect(screen.queryByRole('button', { name: /Seen by/ })).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete story' })).toBeInTheDocument();
		});

		it('is hidden when the story has no viewers count at all', async () => {
			storiesByUser.me = [buildStory('m1')];

			await openViewer({ startIndex: 0 });

			expect(screen.queryByRole('button', { name: /Seen by/ })).not.toBeInTheDocument();
		});

		it('is shown from one viewer up, next to the trash icon', async () => {
			storiesByUser.me = [buildStory('m1', { viewersCount: 1 })];

			await openViewer({ startIndex: 0 });

			expect(screen.getByRole('button', { name: 'Seen by 1' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete story' })).toBeInTheDocument();
		});

		it('appears and disappears as you move between stories with and without viewers', async () => {
			await openViewer({ startIndex: 0 });

			expect(screen.getByRole('button', { name: 'Seen by 3' })).toBeInTheDocument();
			tapNext();
			expect(screen.queryByRole('button', { name: /Seen by/ })).not.toBeInTheDocument();
			tapPrevious();
			expect(screen.getByRole('button', { name: 'Seen by 3' })).toBeInTheDocument();
		});

		it("is not shown on someone else's story", async () => {
			await openViewer({ startIndex: 1 });

			expect(screen.queryByRole('button', { name: /Seen by/ })).not.toBeInTheDocument();
		});

		it('opens the Viewers list for the story that is showing', async () => {
			getStoryViewers.mockResolvedValue([{ _id: 'v1', username: 'viewer1' }]);
			await openViewer({ startIndex: 0 });

			userEvent.click(screen.getByRole('button', { name: 'Seen by 3' }));

			expect(await screen.findByRole('heading', { name: 'Viewers' })).toBeInTheDocument();
			expect(await screen.findByText('viewer1')).toBeInTheDocument();
			expect(getStoryViewers).toHaveBeenCalledWith(expect.objectContaining({ storyId: 'm1', jwtToken: 'token123' }));
		});

		it('lists the viewers by photo and username only', async () => {
			getStoryViewers.mockResolvedValue([{ _id: 'v1', username: 'viewer1', followersCount: 9 }]);
			await openViewer({ startIndex: 0 });

			userEvent.click(screen.getByRole('button', { name: 'Seen by 3' }));

			await screen.findByText('viewer1');
			expect(document.querySelector('.search-result-followers')).not.toBeInTheDocument();
		});

		it('pauses the story while the list is open', async () => {
			await openViewer({ startIndex: 0 });
			loadPhoto();

			userEvent.click(screen.getByRole('button', { name: 'Seen by 3' }));

			expect(getViewer()).toHaveClass('story-viewer-paused');
		});

		it('resumes from the same point when the list is closed', async () => {
			await openViewer({ startIndex: 0 });
			loadPhoto();
			const fillBefore = document.querySelector('.story-viewer-segment-fill-active');

			userEvent.click(screen.getByRole('button', { name: 'Seen by 3' }));
			await screen.findByRole('heading', { name: 'Viewers' });
			closeOverlay();

			expect(screen.queryByRole('heading', { name: 'Viewers' })).not.toBeInTheDocument();
			expect(getViewer()).not.toHaveClass('story-viewer-paused');
			expect(document.querySelector('.story-viewer-segment-fill-active')).toBe(fillBefore);
			expect(getPhotoName()).toBe('m1');
		});

		it('closes only the list, not the viewer, on Escape', async () => {
			const { onClose } = await openViewer({ startIndex: 0 });

			userEvent.click(screen.getByRole('button', { name: 'Seen by 3' }));
			await screen.findByRole('heading', { name: 'Viewers' });
			fireEvent.keyDown(document, { key: 'Escape' });

			expect(screen.queryByRole('heading', { name: 'Viewers' })).not.toBeInTheDocument();
			expect(onClose).not.toHaveBeenCalled();
		});

		it('ignores the arrow keys while the list is open', async () => {
			await openViewer({ startIndex: 0 });

			userEvent.click(screen.getByRole('button', { name: 'Seen by 3' }));
			await screen.findByRole('heading', { name: 'Viewers' });
			fireEvent.keyDown(document, { key: 'ArrowRight' });

			expect(getPhotoName()).toBe('m1');
		});
	});

	describe('your own stories: delete', () => {
		const openDeleteConfirm = () => userEvent.click(screen.getByRole('button', { name: 'Delete story' }));

		it("shows the trash icon on your own story but not on someone else's", async () => {
			await openViewer({ startIndex: 1 });

			expect(screen.queryByRole('button', { name: 'Delete story' })).not.toBeInTheDocument();
		});

		it('opens the "Delete story" confirmation with Delete and Cancel', async () => {
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();

			expect(screen.getByRole('heading', { name: 'Delete story' })).toBeInTheDocument();
			expect(screen.getByText('This story will be permanently deleted. This cannot be undone.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});

		it('pauses the story while the confirmation is open', async () => {
			await openViewer({ startIndex: 0 });
			loadPhoto();

			openDeleteConfirm();

			expect(getViewer()).toHaveClass('story-viewer-paused');
		});

		it('deletes nothing yet', async () => {
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();

			expect(deleteStory).not.toHaveBeenCalled();
		});

		it('resumes and keeps the story when Cancel is clicked', async () => {
			await openViewer({ startIndex: 0 });
			loadPhoto();

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument();
			expect(getViewer()).not.toHaveClass('story-viewer-paused');
			expect(deleteStory).not.toHaveBeenCalled();
			expect(getPhotoName()).toBe('m1');
		});

		it('resumes when the confirmation is closed with its close button', async () => {
			await openViewer({ startIndex: 0 });
			loadPhoto();

			openDeleteConfirm();
			closeOverlay();

			expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument();
			expect(getViewer()).not.toHaveClass('story-viewer-paused');
		});

		it('deletes the story that is showing, with the token', async () => {
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(deleteStory).toHaveBeenCalledWith({ storyId: 'm1', jwtToken: 'token123' }));
			expect(deleteStory).toHaveBeenCalledTimes(1);
		});

		it('closes the confirmation and moves on to your next story', async () => {
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument());
			expect(getPhotoName()).toBe('m2');
			expect(document.querySelectorAll('.story-viewer-segment')).toHaveLength(1);
		});

		it('moves on to the next user when the last story of yours is deleted', async () => {
			storiesByUser.me = [buildStory('m1', { viewersCount: 0 })];

			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(await screen.findByAltText('Story by alice')).toBeInTheDocument();
		});

		it('closes the viewer when the only story left in the tray is deleted', async () => {
			storiesByUser.me = [buildStory('m1', { viewersCount: 0 })];
			const queue = [buildQueue()[0]];

			const { onClose } = await openViewer({ queue, startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		});

		it('disables Delete while the request is in flight and sends one request', async () => {
			const request = buildDeferred();

			deleteStory.mockReturnValue(request.promise);
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));
			expect(deleteStory).toHaveBeenCalledTimes(1);

			request.resolve({});
			await waitFor(() => expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument());
		});

		it('closes the confirmation, resumes and shows the delete error toast when the request fails', async () => {
			deleteStory.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await openViewer({ startIndex: 0 });
			loadPhoto();

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(getToastText()).toBe(DELETE_ERROR_TOAST));
			expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument();
			expect(getViewer()).not.toHaveClass('story-viewer-paused');
		});

		it('keeps the story and its segments when the request fails', async () => {
			deleteStory.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(getToastText()).toBe(DELETE_ERROR_TOAST));
			expect(getPhotoName()).toBe('m1');
			expect(document.querySelectorAll('.story-viewer-segment')).toHaveLength(2);
		});

		it('shows the same toast for a network failure', async () => {
			deleteStory.mockRejectedValue(new Error('network down'));
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(getToastText()).toBe(DELETE_ERROR_TOAST));
		});

		it('shows the same toast when the story has already expired', async () => {
			deleteStory.mockRejectedValue({ code: 'STORY_NOT_FOUND', status: 404 });
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(getToastText()).toBe(DELETE_ERROR_TOAST));
		});

		it('shows the same toast when the story is not yours', async () => {
			deleteStory.mockRejectedValue({ code: 'STORY_FORBIDDEN', status: 403 });
			await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(getToastText()).toBe(DELETE_ERROR_TOAST));
		});

		it('ends the session, with no toast, when the token is no longer valid', async () => {
			deleteStory.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			userEvent.click(screen.getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(getToastText()).toBe('');
			expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument();
		});

		it('closes only the confirmation, not the viewer, on Escape', async () => {
			const { onClose } = await openViewer({ startIndex: 0 });

			openDeleteConfirm();
			fireEvent.keyDown(document, { key: 'Escape' });

			expect(screen.queryByRole('heading', { name: 'Delete story' })).not.toBeInTheDocument();
			expect(onClose).not.toHaveBeenCalled();
		});
	});
});
