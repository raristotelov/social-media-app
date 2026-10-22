import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RequestError } from '../../services/requester';

import AddImagePostForm from './AddImagePostForm';

const renderAddImagePostForm = (addImagePostHandler, onCancelClick) =>
	render(<AddImagePostForm addImagePostHandler={addImagePostHandler} onCancelClick={onCancelClick} />);

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
		const addImagePostHandler = jest.fn();
		renderAddImagePostForm(addImagePostHandler, jest.fn());

		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
		expect(addImagePostHandler).not.toHaveBeenCalled();
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

	describe('submitting', () => {
		it('passes the chosen picture and caption to the handler', async () => {
			const addImagePostHandler = jest.fn().mockResolvedValue(undefined);
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());
			const image = chooseImage(container);

			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(addImagePostHandler).toHaveBeenCalledWith(image, 'Sunset'));
		});

		it('enables Submit before anything is sent', () => {
			renderAddImagePostForm(jest.fn(), jest.fn());

			expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
		});

		it('disables Submit while the request is in flight', async () => {
			const request = buildDeferred();
			const { container } = renderAddImagePostForm(jest.fn().mockReturnValue(request.promise), jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('keeps Cancel enabled while the request is in flight', async () => {
			const request = buildDeferred();
			const { container } = renderAddImagePostForm(jest.fn().mockReturnValue(request.promise), jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('sends one request when Submit is double-clicked', async () => {
			const request = buildDeferred();
			const addImagePostHandler = jest.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(container);
			userEvent.dblClick(screen.getByRole('button', { name: 'Submit' }));

			expect(addImagePostHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice while the first is in flight (e.g. Enter key)', async () => {
			const request = buildDeferred();
			const addImagePostHandler = jest.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(container);
			fireEvent.submit(container.querySelector('form'));
			fireEvent.submit(container.querySelector('form'));

			expect(addImagePostHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice synchronously before React re-renders, and allows a new submit once it settles', async () => {
			const request = buildDeferred();
			const addImagePostHandler = jest.fn().mockReturnValue(request.promise);
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());
			const form = container.querySelector('form');

			chooseImage(container);
			act(() => {
				form.requestSubmit();
				form.requestSubmit();
			});

			expect(addImagePostHandler).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());

			act(() => {
				form.requestSubmit();
			});

			expect(addImagePostHandler).toHaveBeenCalledTimes(2);

			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('allows submitting again after a failed request', async () => {
			const addImagePostHandler = jest.fn().mockRejectedValueOnce(buildRequestError()).mockResolvedValueOnce(undefined);
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());

			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(addImagePostHandler).toHaveBeenCalledTimes(2));
		});

		it('does not send a request when no picture is chosen, and keeps Submit enabled', () => {
			const addImagePostHandler = jest.fn();
			renderAddImagePostForm(addImagePostHandler, jest.fn());

			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(addImagePostHandler).not.toHaveBeenCalled();
			expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
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

		it('sends nothing for a rejected file, even when Submit is clicked', () => {
			const addImagePostHandler = jest.fn();
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(container, buildImage('notes.txt', 'text/plain'));
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(addImagePostHandler).not.toHaveBeenCalled();
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
			const addImagePostHandler = jest.fn().mockRejectedValue(error);
			const view = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(view.container);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());

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
			const addImagePostHandler = jest.fn().mockRejectedValue(buildRequestError());
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(container);
			userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Sunset');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));
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
			const addImagePostHandler = jest.fn().mockRejectedValueOnce(buildRequestError()).mockReturnValueOnce(request.promise);
			const { container } = renderAddImagePostForm(addImagePostHandler, jest.fn());

			chooseImage(container);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));
			await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(screen.queryByRole('alert')).not.toBeInTheDocument();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});
	});
});
