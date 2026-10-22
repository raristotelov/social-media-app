import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditPostForm from './EditPostForm';

const post = { _id: 'post1', imageUrl: 'https://example.com/1.jpg', caption: 'Original caption' };

const renderEditPostForm = (editPostHandler, onCancelClick, data = post) =>
	render(<EditPostForm post={data} editPostHandler={editPostHandler} onCancelClick={onCancelClick} />);

describe('EditPostForm', () => {
	it('shows the post image and prefills the caption', () => {
		renderEditPostForm(jest.fn(), jest.fn());

		expect(screen.getByAltText('post')).toHaveAttribute('src', post.imageUrl);
		expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue(post.caption);
	});

	it('prefills an empty caption when the post has none', () => {
		renderEditPostForm(jest.fn(), jest.fn(), { ...post, caption: undefined });

		expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue('');
	});

	it('offers no way to replace the image', () => {
		const { container } = renderEditPostForm(jest.fn(), jest.fn());

		expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument();
	});

	it('calls editPostHandler with the new caption when it was changed and Save is clicked', async () => {
		const editPostHandler = jest.fn();
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.clear(screen.getByPlaceholderText('Write a caption...'));
		userEvent.type(screen.getByPlaceholderText('Write a caption...'), 'Brand new caption');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(editPostHandler).toHaveBeenCalledTimes(1));
		expect(editPostHandler).toHaveBeenCalledWith('Brand new caption');
	});

	it('allows saving an emptied caption', async () => {
		const editPostHandler = jest.fn();
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.clear(screen.getByPlaceholderText('Write a caption...'));
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(editPostHandler).toHaveBeenCalledWith(''));
	});

	it('calls onCancelClick and not editPostHandler when Save is clicked without changes', async () => {
		const editPostHandler = jest.fn();
		const onCancelClick = jest.fn();
		renderEditPostForm(editPostHandler, onCancelClick);

		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
		expect(editPostHandler).not.toHaveBeenCalled();
	});

	it('calls onCancelClick and not editPostHandler when Cancel is clicked after typing', () => {
		const editPostHandler = jest.fn();
		const onCancelClick = jest.fn();
		renderEditPostForm(editPostHandler, onCancelClick);

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onCancelClick).toHaveBeenCalledTimes(1);
		expect(editPostHandler).not.toHaveBeenCalled();
	});

	it('shows the copy for the error code as the form message when saving fails', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'POST_FORBIDDEN', status: 403 });
		const { container } = renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		const message = await screen.findByText('You can only change your own posts');
		expect(message).toHaveClass('form-error');
		expect(container.querySelector('.field-error')).not.toBeInTheDocument();
	});

	it('shows POST_NOT_FOUND copy as the form message', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'POST_NOT_FOUND', status: 404 });
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('This post no longer exists')).toBeInTheDocument();
	});

	it('shows CAPTION_INVALID under the caption field', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'CAPTION_INVALID', fields: { caption: 'CAPTION_INVALID' }, status: 400 });
		const { container } = renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		const message = await screen.findByText('Caption must be text');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('limits the caption input to 1000 characters', () => {
		renderEditPostForm(jest.fn(), jest.fn());

		expect(screen.getByPlaceholderText('Write a caption...')).toHaveAttribute('maxlength', '1000');
	});

	it('shows CAPTION_TOO_LONG under the caption field and no form message', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'CAPTION_TOO_LONG', fields: { caption: 'CAPTION_TOO_LONG' }, status: 400 });
		const { container } = renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		const message = await screen.findByText('Caption must be at most 1000 characters');
		expect(message).toHaveClass('field-error');
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('marks the caption field as invalid when CAPTION_TOO_LONG comes back', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'CAPTION_TOO_LONG', fields: { caption: 'CAPTION_TOO_LONG' }, status: 400 });
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await screen.findByText('Caption must be at most 1000 characters');
		expect(screen.getByPlaceholderText('Write a caption...')).toHaveAttribute('aria-invalid', 'true');
	});

	it('shows the edit-caption fallback copy for INTERNAL_ERROR', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText("Couldn't save the caption. Try again.")).toBeInTheDocument();
	});

	it('shows no form error for UNAUTHENTICATED', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
		const { container } = renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(editPostHandler).toHaveBeenCalledTimes(1));
		await screen.findByRole('button', { name: 'Save' });
		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('keeps the form open after a failed save', async () => {
		const onCancelClick = jest.fn();
		const editPostHandler = jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 });
		renderEditPostForm(editPostHandler, onCancelClick);

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await screen.findByText("Couldn't save the caption. Try again.");
		expect(onCancelClick).not.toHaveBeenCalled();
	});
});
