import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { addUserPost } from '../../services/userPostService';
import { addStory } from '../../services/storyService';
import { resizeImage } from '../../utils/images';

import CreatePopup from './CreatePopup';

jest.mock('../../services/userPostService');
jest.mock('../../services/storyService');
jest.mock('../../utils/images', () => ({
	...jest.requireActual('../../utils/images'),
	resizeImage: jest.fn(),
}));

const chosenFile = new File(['(image)'], 'new.png', { type: 'image/png' });
const resizedFile = new File(['(resized)'], 'new.jpg', { type: 'image/jpeg' });
const savedPost = { _id: 'post1', caption: 'Sunset' };
const savedStory = { _id: 'story1' };

const renderCreatePopup = ({ initialMode, onPostAdded = jest.fn(), onStoryAdded = jest.fn(), onClose = jest.fn(), endSession = jest.fn() } = {}) => {
	const rendered = render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', endSession }}>
			<CreatePopup initialMode={initialMode} onClose={onClose} onPostAdded={onPostAdded} onStoryAdded={onStoryAdded} />
		</LoggedInUserContext.Provider>,
	);

	return { ...rendered, onPostAdded, onStoryAdded, onClose, endSession };
};

const chooseImage = () => {
	userEvent.upload(document.querySelector('.popup-body input[type="file"]'), chosenFile);
};

const getTab = (name) => screen.getByRole('tab', { name });

describe('CreatePopup', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		global.URL.createObjectURL = jest.fn(() => 'blob:preview');
		global.URL.revokeObjectURL = jest.fn();
		resizeImage.mockResolvedValue(resizedFile);
		addUserPost.mockResolvedValue(savedPost);
		addStory.mockResolvedValue(savedStory);
	});

	describe('the tabs', () => {
		it('offers Post and Story, in that order', () => {
			renderCreatePopup();

			expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Post', 'Story']);
		});

		it('opens on Post by default', () => {
			renderCreatePopup();

			expect(getTab('Post')).toHaveAttribute('aria-selected', 'true');
			expect(getTab('Story')).toHaveAttribute('aria-selected', 'false');
		});

		it('opens on Post when asked to, with a caption field', () => {
			renderCreatePopup({ initialMode: 'post' });

			expect(getTab('Post')).toHaveAttribute('aria-selected', 'true');
			expect(screen.getByPlaceholderText('Write a caption...')).toBeInTheDocument();
		});

		it('opens on Story when asked to, with no caption field', () => {
			renderCreatePopup({ initialMode: 'story' });

			expect(getTab('Story')).toHaveAttribute('aria-selected', 'true');
			expect(getTab('Post')).toHaveAttribute('aria-selected', 'false');
			expect(screen.queryByPlaceholderText('Write a caption...')).not.toBeInTheDocument();
		});

		it('switches from Post to Story', () => {
			renderCreatePopup({ initialMode: 'post' });

			userEvent.click(getTab('Story'));

			expect(getTab('Story')).toHaveAttribute('aria-selected', 'true');
			expect(screen.queryByPlaceholderText('Write a caption...')).not.toBeInTheDocument();
		});

		it('switches from Story to Post', () => {
			renderCreatePopup({ initialMode: 'story' });

			userEvent.click(getTab('Post'));

			expect(getTab('Post')).toHaveAttribute('aria-selected', 'true');
			expect(screen.getByPlaceholderText('Write a caption...')).toBeInTheDocument();
		});

		it('has no popup title, as the tabs take its place', () => {
			renderCreatePopup();

			expect(screen.queryByRole('heading')).not.toBeInTheDocument();
		});
	});

	describe('the Share button', () => {
		it.each([['post'], ['story']])('is labelled Share on the %s tab', (initialMode) => {
			renderCreatePopup({ initialMode });

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
		});
	});

	describe('switching tabs', () => {
		it('keeps the chosen picture', () => {
			renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.click(getTab('Story'));

			expect(document.querySelector('.preview-wrapper img[alt="preview"]')).toHaveAttribute('src', 'blob:preview');
		});

		it('keeps the caption for Post after switching to Story and back', () => {
			renderCreatePopup({ initialMode: 'post' });

			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(getTab('Story'));
			userEvent.click(getTab('Post'));

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Sunset');
		});

		it('keeps the picture chosen on the Story tab when switching to Post', () => {
			renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(getTab('Post'));

			expect(document.querySelector('.preview-wrapper img[alt="preview"]')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('sharing a post', () => {
		it('resizes the picture, sends it with the caption and the token, and tells the page about the saved post', async () => {
			const { onPostAdded } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onPostAdded).toHaveBeenCalledWith(savedPost));
			expect(resizeImage).toHaveBeenCalledWith(chosenFile);
			expect(addUserPost).toHaveBeenCalledWith({ image: resizedFile, caption: 'Sunset' }, 'token123');
		});

		it('closes the popup after the post is saved', async () => {
			const { onClose } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		});

		it('creates no story', async () => {
			const { onClose } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onClose).toHaveBeenCalled());
			expect(addStory).not.toHaveBeenCalled();
		});

		it('uses the caption typed before a trip to the Story tab', async () => {
			const { onPostAdded } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(getTab('Story'));
			userEvent.click(getTab('Post'));
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onPostAdded).toHaveBeenCalled());
			expect(addUserPost).toHaveBeenCalledWith({ image: resizedFile, caption: 'Sunset' }, 'token123');
		});

		it('does not need an onPostAdded handler', async () => {
			const onClose = jest.fn();

			render(
				<LoggedInUserContext.Provider value={{ jwtToken: 'token123', endSession: jest.fn() }}>
					<CreatePopup initialMode='post' onClose={onClose} />
				</LoggedInUserContext.Provider>,
			);

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		});

		it('keeps the popup open and shows the fallback message when the save fails', async () => {
			addUserPost.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onClose, onPostAdded } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
			expect(onClose).not.toHaveBeenCalled();
			expect(onPostAdded).not.toHaveBeenCalled();
		});

		it('sends nothing when the picture cannot be resized', async () => {
			resizeImage.mockRejectedValue(new Error('The source image could not be decoded'));
			renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
			expect(addUserPost).not.toHaveBeenCalled();
		});

		it('ends the session and shows no message when the token is no longer valid', async () => {
			addUserPost.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});
	});

	describe('sharing a story', () => {
		it('resizes the picture, sends only the picture and the token, and tells the page about the saved story', async () => {
			const { onStoryAdded } = renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onStoryAdded).toHaveBeenCalledWith(savedStory));
			expect(resizeImage).toHaveBeenCalledWith(chosenFile);
			expect(addStory).toHaveBeenCalledWith({ image: resizedFile }, 'token123');
		});

		it('closes the popup after the story is saved', async () => {
			const { onClose } = renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		});

		it('creates no post', async () => {
			const { onClose } = renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onClose).toHaveBeenCalled());
			expect(addUserPost).not.toHaveBeenCalled();
		});

		it('sends no caption, even if one was typed on the Post tab first', async () => {
			const { onStoryAdded } = renderCreatePopup({ initialMode: 'post' });

			chooseImage();
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(getTab('Story'));
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(onStoryAdded).toHaveBeenCalled());
			expect(addStory).toHaveBeenCalledWith({ image: resizedFile }, 'token123');
			expect(addUserPost).not.toHaveBeenCalled();
		});

		it('asks for a picture and sends nothing when none is chosen', () => {
			renderCreatePopup({ initialMode: 'story' });

			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
			expect(addStory).not.toHaveBeenCalled();
		});

		it('keeps the popup open and shows the fallback message when the save fails', async () => {
			addStory.mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
			const { onClose, onStoryAdded } = renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
			expect(onClose).not.toHaveBeenCalled();
			expect(onStoryAdded).not.toHaveBeenCalled();
		});

		it('shows the size message under the picture when the server answers IMAGE_TOO_LARGE', async () => {
			addStory.mockRejectedValue({ code: 'IMAGE_TOO_LARGE', fields: { image: 'IMAGE_TOO_LARGE' }, status: 413 });
			renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByText('This image is over 10 MB')).toHaveClass('field-error');
		});

		it('ends the session and shows no message when the token is no longer valid', async () => {
			addStory.mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { endSession } = renderCreatePopup({ initialMode: 'story' });

			chooseImage();
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});
	});

	describe('closing', () => {
		it('closes from Cancel', () => {
			const { onClose } = renderCreatePopup();

			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes from the close button', () => {
			const { onClose } = renderCreatePopup();

			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes on Escape', () => {
			const { onClose } = renderCreatePopup();

			userEvent.keyboard('{Escape}');

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
