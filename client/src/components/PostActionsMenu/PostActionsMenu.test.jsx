import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { dragDown, fireTransitionEnd, installBottomSheetEnvironment, restoreBottomSheetEnvironment } from '../../testUtils/bottomSheet';

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

	describe('as a bottom sheet', () => {
		const getSheet = (container) => container.querySelector('.post-actions-menu');
		const getHandle = (container) => container.querySelector('.bottom-sheet-handle');

		beforeEach(() => {
			installBottomSheetEnvironment();
		});

		afterEach(() => {
			restoreBottomSheetEnvironment();
		});

		it('renders the drag handle inside the menu', () => {
			const { container } = renderMenu();

			expect(getSheet(container)).toContainElement(getHandle(container));
		});

		it('slides out and then calls onClose when the handle is dragged down past 25%', () => {
			const onClose = jest.fn();
			const { container } = renderMenu({ onClose });

			dragDown(getHandle(container), 120);

			expect(onClose).not.toHaveBeenCalled();

			fireTransitionEnd(getSheet(container));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('springs back and stays open on a short drag', () => {
			const onClose = jest.fn();
			const { container } = renderMenu({ onClose });

			dragDown(getHandle(container), 40);
			fireTransitionEnd(getSheet(container));

			expect(getSheet(container).style.transform).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('does not start a drag from an option', () => {
			const onClose = jest.fn();
			const { container } = renderMenu({ onClose });

			dragDown(screen.getByRole('button', { name: 'Delete' }), 300);
			fireTransitionEnd(getSheet(container));

			expect(getSheet(container).style.transform).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('does not call onEditClick or onDeleteClick when closed by a drag', () => {
			const onEditClick = jest.fn();
			const onDeleteClick = jest.fn();
			const { container } = renderMenu({ onEditClick, onDeleteClick });

			dragDown(getHandle(container), 120);
			fireTransitionEnd(getSheet(container));

			expect(onEditClick).not.toHaveBeenCalled();
			expect(onDeleteClick).not.toHaveBeenCalled();
		});

		it('does not drag on a screen of 600px or wider', () => {
			installBottomSheetEnvironment({ isMobile: false });
			const onClose = jest.fn();
			const { container } = renderMenu({ onClose });

			dragDown(getHandle(container), 300);
			fireTransitionEnd(getSheet(container));

			expect(onClose).not.toHaveBeenCalled();
		});
	});
});
