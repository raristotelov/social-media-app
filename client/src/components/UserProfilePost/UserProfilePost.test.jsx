import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import UserProfilePost from './UserProfilePost';

const post = { _id: 'post1', imageIdentifier: 'img1', imageUrl: 'https://example.com/1.jpg', caption: 'Hello' };

const renderPost = (props = {}) => render(<UserProfilePost post={post} onEditClick={jest.fn()} onDeleteClick={jest.fn()} {...props} />);

describe('UserProfilePost', () => {
	it('renders the post image', () => {
		renderPost();

		expect(screen.getByAltText('user-post')).toHaveAttribute('src', post.imageUrl);
	});

	it('shows no actions button by default', () => {
		renderPost();

		expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
	});

	it('shows no actions button when showActions is false', () => {
		renderPost({ showActions: false });

		expect(screen.queryByRole('button', { name: 'Post actions' })).not.toBeInTheDocument();
	});

	it('shows the actions button when showActions is true', () => {
		renderPost({ showActions: true });

		expect(screen.getByRole('button', { name: 'Post actions' })).toBeInTheDocument();
	});

	it('keeps the menu closed until the actions button is clicked', () => {
		renderPost({ showActions: true });

		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
	});

	it('opens a menu with Edit and Delete when the actions button is clicked', () => {
		renderPost({ showActions: true });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));

		expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
	});

	it('reflects whether the menu is open in aria-expanded', () => {
		renderPost({ showActions: true });

		const actionsButton = screen.getByRole('button', { name: 'Post actions' });

		expect(actionsButton).toHaveAttribute('aria-expanded', 'false');

		userEvent.click(actionsButton);

		expect(actionsButton).toHaveAttribute('aria-expanded', 'true');
	});

	it('closes the menu when the actions button is clicked again', () => {
		renderPost({ showActions: true });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));
		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));

		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});

	it('calls onEditClick with the post and closes the menu when Edit is clicked', () => {
		const onEditClick = jest.fn();
		renderPost({ showActions: true, onEditClick });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));
		userEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(onEditClick).toHaveBeenCalledWith(post);
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});

	it('calls onDeleteClick with the post and closes the menu when Delete is clicked', () => {
		const onDeleteClick = jest.fn();
		renderPost({ showActions: true, onDeleteClick });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));
		userEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect(onDeleteClick).toHaveBeenCalledWith(post);
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
	});

	it('closes the menu when the mouse is pressed outside the post', () => {
		renderPost({ showActions: true });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));
		fireEvent.mouseDown(document.body);

		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});

	it('closes the menu when Escape is pressed', () => {
		renderPost({ showActions: true });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));
		fireEvent.keyDown(document, { key: 'Escape' });

		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});

	it('keeps the menu open when another key is pressed', () => {
		renderPost({ showActions: true });

		userEvent.click(screen.getByRole('button', { name: 'Post actions' }));
		fireEvent.keyDown(document, { key: 'Enter' });

		expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
	});
});
