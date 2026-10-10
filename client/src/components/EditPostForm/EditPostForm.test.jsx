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

	it('shows the server error message in the form when saving fails', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({ error: 'You can only change your own posts' });
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('You can only change your own posts')).toBeInTheDocument();
	});

	it('shows a generic message when the failure carries no server message', async () => {
		const editPostHandler = jest.fn().mockRejectedValue({});
		renderEditPostForm(editPostHandler, jest.fn());

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
	});

	it('keeps the form open after a failed save', async () => {
		const onCancelClick = jest.fn();
		const editPostHandler = jest.fn().mockRejectedValue({});
		renderEditPostForm(editPostHandler, onCancelClick);

		userEvent.type(screen.getByPlaceholderText('Write a caption...'), ' extra');
		userEvent.click(screen.getByRole('button', { name: 'Save' }));

		await screen.findByText('Something went wrong. Please try again.');
		expect(onCancelClick).not.toHaveBeenCalled();
	});
});
