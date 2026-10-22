import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { addStory, getStoryTray, getUserStories, markStoryViewed } from '../../services/storyService';
import { resizeImage } from '../../utils/images';

import ToastProvider from '../ToastProvider/ToastProvider';

import StoriesTray from './StoriesTray';

jest.mock('../../services/storyService');
jest.mock('../../services/userPostService');
jest.mock('../../utils/images', () => ({
	...jest.requireActual('../../utils/images'),
	resizeImage: jest.fn(),
}));

const loggedInUser = { _id: 'me', username: 'me', profilePicture: { imageUrl: 'https://example.com/me.jpg' } };

const trayEntry = (id, overrides = {}) => ({
	user: { _id: id, username: id, profilePicture: { imageUrl: `https://example.com/${id}.jpg` } },
	isOwn: false,
	isWatched: false,
	latestStoryAt: '2026-10-22T10:00:00.000Z',
	...overrides,
});

const ownEntry = trayEntry('me', { isOwn: true, isWatched: true });

const buildStory = (id, overrides = {}) => ({
	_id: id,
	imageUrl: `https://example.com/${id}.jpg`,
	imageWidth: 1080,
	imageHeight: 1920,
	createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
	...overrides,
});

const renderTray = ({ endSession = jest.fn() } = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, endSession }}>
			<ToastProvider>
				<MemoryRouter>
					<StoriesTray />
				</MemoryRouter>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, endSession };
};

const getCircleLabels = () => Array.from(document.querySelectorAll('.story-circle-label')).map((label) => label.textContent);

const getCircleButton = (label) => screen.getByText(label).closest('button');

describe('StoriesTray', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		global.URL.createObjectURL = jest.fn(() => 'blob:preview');
		global.URL.revokeObjectURL = jest.fn();
		getStoryTray.mockResolvedValue([]);
		markStoryViewed.mockResolvedValue({});
		getUserStories.mockImplementation(({ userId }) =>
			Promise.resolve({
				user: { _id: userId, username: userId },
				stories: [buildStory(`${userId}-1`, userId === 'me' ? { viewersCount: 0 } : { isWatched: false })],
			}),
		);
	});

	describe('loading', () => {
		it('shows an empty card, no circles, while the tray loads', () => {
			getStoryTray.mockReturnValue(new Promise(() => {}));

			renderTray();

			expect(screen.getByRole('region', { name: 'Stories' })).toBeEmptyDOMElement();
		});

		it('requests the tray with the token', async () => {
			renderTray();

			await screen.findByText('Your story');

			expect(getStoryTray).toHaveBeenCalledWith({ jwtToken: 'token123' });
		});

		it('stays empty, with no error, when the tray fails to load', async () => {
			getStoryTray.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });

			renderTray();
			await waitFor(() => expect(getStoryTray).toHaveBeenCalled());

			expect(screen.getByRole('region', { name: 'Stories' })).toBeEmptyDOMElement();
			expect(document.querySelector('.toast-region')).toBeEmptyDOMElement();
		});

		it('ends the session when the token is no longer valid', async () => {
			getStoryTray.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });

			const { endSession } = renderTray();

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
		});
	});

	describe('the circles', () => {
		it('always shows your own circle first, labelled "Your story", even when nobody has a story', async () => {
			renderTray();

			await screen.findByText('Your story');

			expect(getCircleLabels()).toEqual(['Your story']);
		});

		it('shows only the people the server listed, after your own circle, in the server order', async () => {
			getStoryTray.mockResolvedValue([trayEntry('carol'), ownEntry, trayEntry('alice', { isWatched: true }), trayEntry('bob')]);

			renderTray();
			await screen.findByText('alice');

			expect(getCircleLabels()).toEqual(['Your story', 'carol', 'alice', 'bob']);
		});

		it('shows your own circle with your profile picture', async () => {
			renderTray();

			await screen.findByText('Your story');

			expect(getCircleButton('Your story').querySelector('img')).toHaveAttribute('src', 'https://example.com/me.jpg');
		});

		it('gives your own circle the grey ring, even when you have a story', async () => {
			getStoryTray.mockResolvedValue([ownEntry]);

			renderTray();
			await screen.findByText('Your story');

			expect(getCircleButton('Your story').querySelector('.story-circle-ring')).not.toHaveClass('story-circle-ring-unwatched');
		});

		it('gives a user with unwatched stories the red ring', async () => {
			getStoryTray.mockResolvedValue([trayEntry('alice', { isWatched: false })]);

			renderTray();
			await screen.findByText('alice');

			expect(getCircleButton('alice').querySelector('.story-circle-ring')).toHaveClass('story-circle-ring-unwatched');
		});

		it('gives a user whose stories are all watched the grey ring', async () => {
			getStoryTray.mockResolvedValue([trayEntry('alice', { isWatched: true })]);

			renderTray();
			await screen.findByText('alice');

			expect(getCircleButton('alice').querySelector('.story-circle-ring')).not.toHaveClass('story-circle-ring-unwatched');
		});

		it("shows each user's profile picture", async () => {
			getStoryTray.mockResolvedValue([trayEntry('alice')]);

			renderTray();
			await screen.findByText('alice');

			expect(getCircleButton('alice').querySelector('img')).toHaveAttribute('src', 'https://example.com/alice.jpg');
		});
	});

	describe('your own circle without a story', () => {
		it('is one button that opens Create on the Story tab', async () => {
			renderTray();

			userEvent.click(await screen.findByRole('button', { name: 'Add to your story' }));

			expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
			expect(screen.queryByPlaceholderText('Write a caption...')).not.toBeInTheDocument();
		});

		it('has no separate plus button', async () => {
			renderTray();

			await screen.findByText('Your story');

			expect(screen.getAllByRole('button', { name: 'Add to your story' })).toHaveLength(1);
		});

		it('opens no viewer', async () => {
			renderTray();

			userEvent.click(await screen.findByRole('button', { name: 'Add to your story' }));

			expect(screen.queryByRole('dialog', { name: 'Story viewer' })).not.toBeInTheDocument();
			expect(getUserStories).not.toHaveBeenCalled();
		});
	});

	describe('your own circle with a story', () => {
		beforeEach(() => {
			getStoryTray.mockResolvedValue([ownEntry, trayEntry('alice')]);
		});

		it('opens your story in the viewer when the picture is tapped', async () => {
			renderTray();

			userEvent.click(await screen.findByRole('button', { name: 'View your story' }));

			expect(await screen.findByRole('dialog', { name: 'Story viewer' })).toBeInTheDocument();
			expect(getUserStories).toHaveBeenCalledWith({ userId: 'me', jwtToken: 'token123' });
		});

		it('opens Create on the Story tab, not the viewer, when the plus is tapped', async () => {
			renderTray();

			userEvent.click(await screen.findByRole('button', { name: 'Add to your story' }));

			expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
			expect(screen.queryByRole('dialog', { name: 'Story viewer' })).not.toBeInTheDocument();
		});

		it('does not open Create when the picture is tapped', async () => {
			renderTray();

			userEvent.click(await screen.findByRole('button', { name: 'View your story' }));

			expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
		});
	});

	describe('opening other people', () => {
		it("opens that user's stories in the viewer", async () => {
			getStoryTray.mockResolvedValue([trayEntry('alice'), trayEntry('bob')]);

			renderTray();
			userEvent.click(await screen.findByRole('button', { name: "View bob's story" }));

			expect(await screen.findByLabelText('Story viewer')).toBeInTheDocument();
			await waitFor(() => expect(getUserStories).toHaveBeenCalledWith({ userId: 'bob', jwtToken: 'token123' }));
			expect(getUserStories).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'alice' }));
		});

		it('opens the right user when your own circle also has a story', async () => {
			getStoryTray.mockResolvedValue([ownEntry, trayEntry('alice'), trayEntry('bob')]);

			renderTray();
			userEvent.click(await screen.findByRole('button', { name: "View bob's story" }));

			const viewer = await screen.findByRole('dialog', { name: 'Story viewer' });

			expect(await within(viewer).findByText('bob')).toBeInTheDocument();
		});

		it('continues from the opened user to the next one in the tray, own circle included in the queue', async () => {
			getStoryTray.mockResolvedValue([ownEntry, trayEntry('alice'), trayEntry('bob')]);

			renderTray();
			userEvent.click(await screen.findByRole('button', { name: "View alice's story" }));

			const viewer = await screen.findByRole('dialog', { name: 'Story viewer' });

			await within(viewer).findByAltText('Story by alice');
			userEvent.click(within(viewer).getAllByRole('button', { name: 'Next story' })[0]);

			expect(await within(viewer).findByAltText('Story by bob')).toBeInTheDocument();
		});
	});

	describe('after the viewer closes', () => {
		it('removes the viewer', async () => {
			getStoryTray.mockResolvedValue([trayEntry('alice')]);

			renderTray();
			userEvent.click(await screen.findByRole('button', { name: "View alice's story" }));
			await screen.findByRole('dialog', { name: 'Story viewer' });

			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByRole('dialog', { name: 'Story viewer' })).not.toBeInTheDocument();
		});

		it('loads the tray again, so the rings reflect what was watched', async () => {
			getStoryTray
				.mockResolvedValueOnce([trayEntry('alice', { isWatched: false })])
				.mockResolvedValueOnce([trayEntry('alice', { isWatched: true })]);

			renderTray();
			userEvent.click(await screen.findByRole('button', { name: "View alice's story" }));
			await screen.findByRole('dialog', { name: 'Story viewer' });
			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			await waitFor(() => expect(getStoryTray).toHaveBeenCalledTimes(2));
			await waitFor(() => expect(getCircleButton('alice').querySelector('.story-circle-ring')).not.toHaveClass('story-circle-ring-unwatched'));
		});
	});

	describe('sharing a story', () => {
		it('reloads the tray and closes the popup, so the new story shows in your circle', async () => {
			const resized = new File(['(resized)'], 'new.jpg', { type: 'image/jpeg' });

			resizeImage.mockResolvedValue(resized);
			addStory.mockResolvedValue({ _id: 'story1' });
			getStoryTray.mockResolvedValueOnce([]).mockResolvedValueOnce([ownEntry]);

			renderTray();
			userEvent.click(await screen.findByRole('button', { name: 'Add to your story' }));
			userEvent.upload(document.querySelector('.popup-body input[type="file"]'), new File(['(image)'], 'new.png', { type: 'image/png' }));
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByRole('button', { name: 'View your story' })).toBeInTheDocument();
			expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
			expect(addStory).toHaveBeenCalledWith({ image: resized }, 'token123');
		});
	});

	describe('closing the Create popup', () => {
		it('removes it without reloading the tray', async () => {
			renderTray();

			userEvent.click(await screen.findByRole('button', { name: 'Add to your story' }));
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
			expect(getStoryTray).toHaveBeenCalledTimes(1);
		});
	});
});
