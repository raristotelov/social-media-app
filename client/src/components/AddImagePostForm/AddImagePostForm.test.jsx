import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RequestError } from '../../services/requester';

import AddImagePostForm from './AddImagePostForm';

const renderAddImagePostForm = (submitHandler, onCancelClick, mode) =>
	render(<AddImagePostForm submitHandler={submitHandler} onCancelClick={onCancelClick} mode={mode} />);

const buildImage = (name = 'photo.png', type = 'image/png') => new File(['(image)'], name, { type });

const chooseImage = (container, image = buildImage()) => {
	userEvent.upload(container.querySelector('input[type="file"]'), image);

	return image;
};

const buildDeferred = () => {
	const deferred = {};

	deferred.promise = new Promise((resolve, reject) => {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});

	return deferred;
};

const buildRequestError = ({ code = 'INTERNAL_ERROR', fields, status = 500 } = {}) => new RequestError({ code, fields, status, message: 'failed' });

describe('AddImagePostForm', () => {
	beforeEach(() => {
		global.URL.createObjectURL = jest.fn(() => 'blob:preview');
		global.URL.revokeObjectURL = jest.fn();
	});

	it('shows "Please choose a picture" and does not submit when no picture is chosen', () => {
		const submitHandler = jest.fn();
		renderAddImagePostForm(submitHandler, jest.fn());

		userEvent.click(screen.getByRole('button', { name: 'Share' }));

		expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
		expect(submitHandler).not.toHaveBeenCalled();
	});

	it('renders the image input with the 90px icon and 20px label the form asks for', () => {
		const { container } = renderAddImagePostForm(jest.fn(), jest.fn());
		const icon = container.querySelector('label svg');

		expect(icon).toHaveAttribute('width', '90px');
		expect(icon).toHaveAttribute('height', '90px');
		expect(screen.getByText('Choose a Picture')).toHaveStyle({ fontSize: '20px' });
	});

	it('calls onCancelClick when the Cancel button is clicked', () => {
		const onCancelClick = jest.fn();
		renderAddImagePostForm(jest.fn(), onCancelClick);

		userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onCancelClick).toHaveBeenCalledTimes(1);
	});

	it('updates the caption as the user types', () => {
		renderAddImagePostForm(jest.fn(), jest.fn());

		const captionInput = screen.getByPlaceholderText('Write a caption...');
		userEvent.type(captionInput, 'A lovely sunset');

		expect(captionInput).toHaveValue('A lovely sunset');
	});

	it('limits the caption input to 1000 characters', () => {
		renderAddImagePostForm(jest.fn(), jest.fn());

		expect(screen.getByPlaceholderText('Write a caption...')).toHaveAttribute('maxlength', '1000');
	});

	describe('the Share button', () => {
		it('is labelled Share, not Submit, in the default mode', () => {
			renderAddImagePostForm(jest.fn(), jest.fn());

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
		});

		it('is labelled Share in post mode', () => {
			renderAddImagePostForm(jest.fn(), jest.fn(), 'post');

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
		});

		it('is labelled Share in story mode', () => {
			renderAddImagePostForm(jest.fn(), jest.fn(), 'story');

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
		});
	});

	describe('post mode', () => {
		it('shows the caption field by default', () => {
			renderAddImagePostForm(jest.fn(), jest.fn());

			expect(screen.getByPlaceholderText('Write a caption...')).toBeInTheDocument();
		});

		it('shows the caption field when the mode is post', () => {
			renderAddImagePostForm(jest.fn(), jest.fn(), 'post');

			expect(screen.getByPlaceholderText('Write a caption...')).toBeInTheDocument();
		});

		it('does not put a blurred copy behind the preview', () => {
			const { container } = renderAddImagePostForm(jest.fn(), jest.fn(), 'post');

			chooseImage(container);

			expect(container.querySelector('.preview-backdrop')).not.toBeInTheDocument();
		});
	});

	describe('story mode', () => {
		it('has no caption field', () => {
			renderAddImagePostForm(jest.fn(), jest.fn(), 'story');

			expect(screen.queryByPlaceholderText('Write a caption...')).not.toBeInTheDocument();
		});

		it('puts a blurred copy of the picture behind the preview once one is chosen', () => {
			const { container } = renderAddImagePostForm(jest.fn(), jest.fn(), 'story');

			chooseImage(container);

			expect(container.querySelector('.preview-backdrop img')).toHaveAttribute('src', 'blob:preview');
		});

		it('hands the chosen picture to the handler', async () => {
			const submitHandler = jest.fn().mockResolvedValue(undefined);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn(), 'story');
			const image = chooseImage(container);

			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(submitHandler).toHaveBeenCalledWith(image, ''));
		});

		it('asks for a picture and sends nothing when none is chosen', () => {
			const submitHandler = jest.fn();
			renderAddImagePostForm(submitHandler, jest.fn(), 'story');

			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
			expect(submitHandler).not.toHaveBeenCalled();
		});

		it('shows the fallback message when the handler fails', async () => {
			const { container } = renderAddImagePostForm(jest.fn().mockRejectedValue(buildRequestError()), jest.fn(), 'story');

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
		});
	});

	describe('switching mode', () => {
		it('keeps the chosen picture and the typed caption when the mode changes', () => {
			const { container, rerender } = renderAddImagePostForm(jest.fn(), jest.fn(), 'post');

			chooseImage(container);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');

			rerender(<AddImagePostForm submitHandler={jest.fn()} onCancelClick={jest.fn()} mode='story' />);

			expect(container.querySelector('.preview-wrapper img[alt="preview"]')).toHaveAttribute('src', 'blob:preview');

			rerender(<AddImagePostForm submitHandler={jest.fn()} onCancelClick={jest.fn()} mode='post' />);

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Sunset');
			expect(container.querySelector('.preview-wrapper img[alt="preview"]')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('submitting', () => {
		it('passes the chosen picture and caption to the handler', async () => {
			const submitHandler = jest.fn().mockResolvedValue(undefined);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());
			const image = chooseImage(container);

			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(submitHandler).toHaveBeenCalledWith(image, 'Sunset'));
		});

		it('enables Share before anything is sent', () => {
			renderAddImagePostForm(jest.fn(), jest.fn());

			expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
		});

		it('disables Share while the request is in flight', async () => {
			const request = buildDeferred();
			const { container } = renderAddImagePostForm(jest.fn().mockReturnValue(request.promise), jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('keeps Cancel enabled while the request is in flight', async () => {
			const request = buildDeferred();
			const { container } = renderAddImagePostForm(jest.fn().mockReturnValue(request.promise), jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('sends one request when Share is double-clicked', async () => {
			const request = buildDeferred();
			const submitHandler = jest.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(container);
			userEvent.dblClick(screen.getByRole('button', { name: 'Share' }));

			expect(submitHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice while the first is in flight (e.g. Enter key)', async () => {
			const request = buildDeferred();
			const submitHandler = jest.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(container);
			fireEvent.submit(container.querySelector('form'));
			fireEvent.submit(container.querySelector('form'));

			expect(submitHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice synchronously before React re-renders, and allows a new submit once it settles', async () => {
			const request = buildDeferred();
			const submitHandler = jest.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());
			const form = container.querySelector('form');

			chooseImage(container);
			act(() => {
				form.requestSubmit();
				form.requestSubmit();
			});

			expect(submitHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());

			act(() => {
				form.requestSubmit();
			});

			expect(submitHandler).toHaveBeenCalledTimes(2);

			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('allows submitting again after a failed request', async () => {
			const submitHandler = jest.fn().mockRejectedValueOnce(buildRequestError()).mockResolvedValueOnce(undefined);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Share' }));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());

			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(submitHandler).toHaveBeenCalledTimes(2));
		});

		it('does not send a request when no picture is chosen, and keeps Share enabled', () => {
			const submitHandler = jest.fn();
			renderAddImagePostForm(submitHandler, jest.fn());

			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(submitHandler).not.toHaveBeenCalled();
			expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
		});
	});

	describe('choosing a file', () => {
		it('shows the type message under the picture for a file that is not JPEG, PNG or WebP', () => {
			const { container } = renderAddImagePostForm(jest.fn(), jest.fn());

			chooseImage(container, buildImage('notes.txt', 'text/plain'));

			expect(screen.getByText('Choose a JPEG, PNG or WebP image')).toBeInTheDocument();
		});

		it('shows the size message under the picture for a file over 10 MB', () => {
			const { container } = renderAddImagePostForm(jest.fn(), jest.fn());
			const hugeImage = buildImage('huge.jpg', 'image/jpeg');

			Object.defineProperty(hugeImage, 'size', { value: 10 * 1024 * 1024 + 1 });
			chooseImage(container, hugeImage);

			expect(screen.getByText('This image is over 10 MB')).toBeInTheDocument();
		});

		it('sends nothing for a rejected file, even when Share is clicked', () => {
			const submitHandler = jest.fn();
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(container, buildImage('notes.txt', 'text/plain'));
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(submitHandler).not.toHaveBeenCalled();
		});

		it('clears the message once a valid picture is chosen', () => {
			const { container } = renderAddImagePostForm(jest.fn(), jest.fn());

			chooseImage(container, buildImage('notes.txt', 'text/plain'));
			chooseImage(container, buildImage());

			expect(screen.queryByText('Choose a JPEG, PNG or WebP image')).not.toBeInTheDocument();
		});
	});

	describe('server errors', () => {
		const submitWithError = async (error) => {
			const submitHandler = jest.fn().mockRejectedValue(error);
			const view = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(view.container);
			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());

			return view;
		};

		it('shows IMAGE_TYPE_INVALID under the picture and no form message', async () => {
			await submitWithError(buildRequestError({ code: 'IMAGE_TYPE_INVALID', fields: { image: 'IMAGE_TYPE_INVALID' }, status: 400 }));

			expect(screen.getByText('Choose a JPEG, PNG or WebP image')).toBeInTheDocument();
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('shows IMAGE_TOO_LARGE under the picture and no form message', async () => {
			await submitWithError(buildRequestError({ code: 'IMAGE_TOO_LARGE', fields: { image: 'IMAGE_TOO_LARGE' }, status: 413 }));

			expect(screen.getByText('This image is over 10 MB')).toBeInTheDocument();
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('shows CAPTION_TOO_LONG under the caption field and no form message', async () => {
			await submitWithError(buildRequestError({ code: 'CAPTION_TOO_LONG', fields: { caption: 'CAPTION_TOO_LONG' }, status: 400 }));

			expect(screen.getByText('Caption must be at most 1000 characters')).toHaveClass('field-error');
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('marks the caption field as invalid when CAPTION_TOO_LONG comes back', async () => {
			await submitWithError(buildRequestError({ code: 'CAPTION_TOO_LONG', fields: { caption: 'CAPTION_TOO_LONG' }, status: 400 }));

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveAttribute('aria-invalid', 'true');
		});

		it('clears the caption message when the caption is edited', async () => {
			await submitWithError(buildRequestError({ code: 'CAPTION_TOO_LONG', fields: { caption: 'CAPTION_TOO_LONG' }, status: 400 }));

			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'x');

			expect(screen.queryByText('Caption must be at most 1000 characters')).not.toBeInTheDocument();
		});

		it('shows no picture error when only the caption is rejected', async () => {
			const { container } = await submitWithError(
				buildRequestError({ code: 'CAPTION_TOO_LONG', fields: { caption: 'CAPTION_TOO_LONG' }, status: 400 }),
			);

			expect(container.querySelector('.add-image-post-image-wrapper')).not.toHaveClass('has-error');
		});

		it('marks the picture wrapper as having an error', async () => {
			const { container } = await submitWithError(
				buildRequestError({ code: 'IMAGE_TOO_LARGE', fields: { image: 'IMAGE_TOO_LARGE' }, status: 413 }),
			);

			expect(container.querySelector('.add-image-post-image-wrapper')).toHaveClass('has-error');
		});

		it('shows the fallback as the form message for an unexpected server error', async () => {
			await submitWithError(buildRequestError());

			expect(screen.getByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
		});

		it('shows the fallback as the form message when the network fails', async () => {
			await submitWithError(buildRequestError({ status: 0 }));

			expect(screen.getByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
		});

		it('keeps the form on screen, with the chosen caption, after a failure', async () => {
			const submitHandler = jest.fn().mockRejectedValue(buildRequestError());
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(container);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(screen.getByRole('button', { name: 'Share' }));
			await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Sunset');
		});

		it('shows no message for an expired session, which the page handles', async () => {
			await submitWithError(buildRequestError({ code: 'UNAUTHENTICATED', status: 401 }));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('clears the form message when a new picture is chosen', async () => {
			const { container } = await submitWithError(buildRequestError());

			chooseImage(container, buildImage('other.png'));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('clears the previous error when submitting again', async () => {
			const request = buildDeferred();
			const submitHandler = jest.fn().mockRejectedValueOnce(buildRequestError()).mockReturnValueOnce(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Share' }));
			await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

			userEvent.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});
	});
});
