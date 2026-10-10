import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PostActionsMenu from './PostActionsMenu';

const renderMenu = (props = {}) => render(<PostActionsMenu onEditClick={jest.fn()} onDeleteClick={jest.fn()} onClose={jest.fn()} {...props} />);

describe('PostActionsMenu', () => {
	it('offers Edit and Delete', () => {
		renderMenu();

		expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
	});

	it('calls onEditClick when Edit is clicked', () => {
		const onEditClick = jest.fn();
		renderMenu({ onEditClick });

		userEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(onEditClick).toHaveBeenCalledTimes(1);
	});

	it('calls onDeleteClick when Delete is clicked', () => {
		const onDeleteClick = jest.fn();
		renderMenu({ onDeleteClick });

		userEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect(onDeleteClick).toHaveBeenCalledTimes(1);
	});

	it('does not call onClose when an option is clicked', () => {
		const onClose = jest.fn();
		renderMenu({ onClose });

		userEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(onClose).not.toHaveBeenCalled();
	});

	it('calls onClose when the area outside the menu is pressed', () => {
		const onClose = jest.fn();
		const { container } = renderMenu({ onClose });

		fireEvent.mouseDown(container.firstChild);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('does not call onClose when the menu itself is pressed', () => {
		const onClose = jest.fn();
		renderMenu({ onClose });

		fireEvent.mouseDown(screen.getByRole('button', { name: 'Edit' }));

		expect(onClose).not.toHaveBeenCalled();
	});
});
