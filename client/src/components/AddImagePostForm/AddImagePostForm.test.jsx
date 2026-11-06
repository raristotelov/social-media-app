import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RequestError } from '../../services/requester';

import AddImagePostForm from './AddImagePostForm';

const renderAddImagePostForm = (submitHandler, onCancelClick, mode) =>
	render(<AddImagePostForm submitHandler={submitHandler} onCancelClick={onCancelClick} mode={mode} />);

const buildImage = (name = 'photo.png', type = 'image/png') => new File(['(image)'], name, { type });

let user;

const chooseImage = async (container, image = buildImage()) => {
	await user.upload(container.querySelector('input[type="file"]'), image);

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
		user = userEvent.setup({ applyAccept: false });
		globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
		globalThis.URL.revokeObjectURL = vi.fn();
	});

	it('shows "Please choose a picture" and does not submit when no picture is chosen', async () => {
		const submitHandler = vi.fn();
		renderAddImagePostForm(submitHandler, vi.fn());

		await user.click(screen.getByRole('button', { name: 'Share' }));

		expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
		expect(submitHandler).not.toHaveBeenCalled();
	});

	it('renders the image input with the 90px icon and 20px label the form asks for', () => {
		const { container } = renderAddImagePostForm(vi.fn(), vi.fn());
		const icon = container.querySelector('label svg');

		expect(icon).toHaveAttribute('width', '90px');
		expect(icon).toHaveAttribute('height', '90px');
		expect(screen.getByText('Choose a Picture')).toHaveStyle({ fontSize: '20px' });
	});

	it('calls onCancelClick when the Cancel button is clicked', async () => {
		const onCancelClick = vi.fn();
		renderAddImagePostForm(vi.fn(), onCancelClick);

		await user.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onCancelClick).toHaveBeenCalledTimes(1);
	});

	it('updates the caption as the user types', async () => {
		renderAddImagePostForm(vi.fn(), vi.fn());

		const captionInput = screen.getByPlaceholderText('Write a caption...');
		await user.type(captionInput, 'A lovely sunset');

		expect(captionInput).toHaveValue('A lovely sunset');
	});

	it('limits the caption input to 1000 characters', () => {
		renderAddImagePostForm(vi.fn(), vi.fn());

		expect(screen.getByPlaceholderText('Write a caption...')).toHaveAttribute('maxlength', '1000');
	});

	describe('the Share button', () => {
		it('is labelled Share, not Submit, in the default mode', () => {
			renderAddImagePostForm(vi.fn(), vi.fn());

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
		});

		it('is labelled Share in post mode', () => {
			renderAddImagePostForm(vi.fn(), vi.fn(), 'post');

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
		});

		it('is labelled Share in story mode', () => {
			renderAddImagePostForm(vi.fn(), vi.fn(), 'story');

			expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
		});
	});

	describe('post mode', () => {
		it('shows the caption field by default', () => {
			renderAddImagePostForm(vi.fn(), vi.fn());

			expect(screen.getByPlaceholderText('Write a caption...')).toBeInTheDocument();
		});

		it('shows the caption field when the mode is post', () => {
			renderAddImagePostForm(vi.fn(), vi.fn(), 'post');

			expect(screen.getByPlaceholderText('Write a caption...')).toBeInTheDocument();
		});

		it('does not put a blurred copy behind the preview', async () => {
			const { container } = renderAddImagePostForm(vi.fn(), vi.fn(), 'post');

			await chooseImage(container);

			expect(container.querySelector('.preview-backdrop')).not.toBeInTheDocument();
		});
	});

	describe('story mode', () => {
		it('has no caption field', () => {
			renderAddImagePostForm(vi.fn(), vi.fn(), 'story');

			expect(screen.queryByPlaceholderText('Write a caption...')).not.toBeInTheDocument();
		});

		it('puts a blurred copy of the picture behind the preview once one is chosen', async () => {
			const { container } = renderAddImagePostForm(vi.fn(), vi.fn(), 'story');

			await chooseImage(container);

			expect(container.querySelector('.preview-backdrop img')).toHaveAttribute('src', 'blob:preview');
		});

		it('hands the chosen picture to the handler', async () => {
			const submitHandler = vi.fn().mockResolvedValue(undefined);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn(), 'story');
			const image = await chooseImage(container);

			await user.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(submitHandler).toHaveBeenCalledWith(image, ''));
		});

		it('asks for a picture and sends nothing when none is chosen', async () => {
			const submitHandler = vi.fn();
			renderAddImagePostForm(submitHandler, vi.fn(), 'story');

			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
			expect(submitHandler).not.toHaveBeenCalled();
		});

		it('shows the fallback message when the handler fails', async () => {
			const { container } = renderAddImagePostForm(vi.fn().mockRejectedValue(buildRequestError()), vi.fn(), 'story');

			await chooseImage(container);
			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't upload the picture. Try again.");
		});
	});

	describe('switching mode', () => {
		it('keeps the chosen picture and the typed caption when the mode changes', async () => {
			const { container, rerender } = renderAddImagePostForm(vi.fn(), vi.fn(), 'post');

			await chooseImage(container);
			await user.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');

			rerender(<AddImagePostForm submitHandler={vi.fn()} onCancelClick={vi.fn()} mode='story' />);

			expect(container.querySelector('.preview-wrapper img[alt="preview"]')).toHaveAttribute('src', 'blob:preview');

			rerender(<AddImagePostForm submitHandler={vi.fn()} onCancelClick={vi.fn()} mode='post' />);

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Sunset');
			expect(container.querySelector('.preview-wrapper img[alt="preview"]')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('submitting', () => {
		it('passes the chosen picture and caption to the handler', async () => {
			const submitHandler = vi.fn().mockResolvedValue(undefined);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());
			const image = await chooseImage(container);

			await user.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			await user.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(submitHandler).toHaveBeenCalledWith(image, 'Sunset'));
		});

		it('enables Share before anything is sent', () => {
			renderAddImagePostForm(vi.fn(), vi.fn());

			expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
		});

		it('disables Share while the request is in flight', async () => {
			const request = buildDeferred();
			const { container } = renderAddImagePostForm(vi.fn().mockReturnValue(request.promise), vi.fn());

			await chooseImage(container);
			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('keeps Cancel enabled while the request is in flight', async () => {
			const request = buildDeferred();
			const { container } = renderAddImagePostForm(vi.fn().mockReturnValue(request.promise), vi.fn());

			await chooseImage(container);
			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('sends one request when Share is double-clicked', async () => {
			const request = buildDeferred();
			const submitHandler = vi.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(container);
			await user.dblClick(screen.getByRole('button', { name: 'Share' }));

			expect(submitHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice while the first is in flight (e.g. Enter key)', async () => {
			const request = buildDeferred();
			const submitHandler = vi.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(container);
			fireEvent.submit(container.querySelector('form'));
			fireEvent.submit(container.querySelector('form'));

			expect(submitHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice synchronously before React re-renders, and allows a new submit once it settles', async () => {
			const request = buildDeferred();
			const submitHandler = vi.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());
			const form = container.querySelector('form');

			await chooseImage(container);
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
			const submitHandler = vi.fn().mockRejectedValueOnce(buildRequestError()).mockResolvedValueOnce(undefined);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(container);
			await user.click(screen.getByRole('button', { name: 'Share' }));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());

			await user.click(screen.getByRole('button', { name: 'Share' }));

			await waitFor(() => expect(submitHandler).toHaveBeenCalledTimes(2));
		});

		it('does not send a request when no picture is chosen, and keeps Share enabled', async () => {
			const submitHandler = vi.fn();
			renderAddImagePostForm(submitHandler, vi.fn());

			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(submitHandler).not.toHaveBeenCalled();
			expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
		});
	});

	describe('choosing a file', () => {
		it('shows the type message under the picture for a file that is not JPEG, PNG or WebP', async () => {
			const { container } = renderAddImagePostForm(vi.fn(), vi.fn());

			await chooseImage(container, buildImage('notes.txt', 'text/plain'));

			expect(screen.getByText('Choose a JPEG, PNG or WebP image')).toBeInTheDocument();
		});

		it('shows the size message under the picture for a file over 10 MB', async () => {
			const { container } = renderAddImagePostForm(vi.fn(), vi.fn());
			const hugeImage = buildImage('huge.jpg', 'image/jpeg');

			Object.defineProperty(hugeImage, 'size', { value: 10 * 1024 * 1024 + 1 });
			await chooseImage(container, hugeImage);

			expect(screen.getByText('This image is over 10 MB')).toBeInTheDocument();
		});

		it('sends nothing for a rejected file, even when Share is clicked', async () => {
			const submitHandler = vi.fn();
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(container, buildImage('notes.txt', 'text/plain'));
			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(submitHandler).not.toHaveBeenCalled();
		});

		it('clears the message once a valid picture is chosen', async () => {
			const { container } = renderAddImagePostForm(vi.fn(), vi.fn());

			await chooseImage(container, buildImage('notes.txt', 'text/plain'));
			await chooseImage(container, buildImage());

			expect(screen.queryByText('Choose a JPEG, PNG or WebP image')).not.toBeInTheDocument();
		});
	});

	describe('server errors', () => {
		const submitWithError = async (error) => {
			const submitHandler = vi.fn().mockRejectedValue(error);
			const view = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(view.container);
			await user.click(screen.getByRole('button', { name: 'Share' }));

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

			await user.type(screen.getByPlaceholderText('Write a caption...'), 'x');

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
			const submitHandler = vi.fn().mockRejectedValue(buildRequestError());
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(container);
			await user.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			await user.click(screen.getByRole('button', { name: 'Share' }));
			await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

			expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('Sunset');
		});

		it('shows no message for an expired session, which the page handles', async () => {
			await submitWithError(buildRequestError({ code: 'UNAUTHENTICATED', status: 401 }));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('clears the form message when a new picture is chosen', async () => {
			const { container } = await submitWithError(buildRequestError());

			await chooseImage(container, buildImage('other.png'));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		});

		it('clears the previous error when submitting again', async () => {
			const request = buildDeferred();
			const submitHandler = vi.fn().mockRejectedValueOnce(buildRequestError()).mockReturnValueOnce(request.promise);
			const { container } = renderAddImagePostForm(submitHandler, vi.fn());

			await chooseImage(container);
			await user.click(screen.getByRole('button', { name: 'Share' }));
			await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

			await user.click(screen.getByRole('button', { name: 'Share' }));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
		});
	});
});
