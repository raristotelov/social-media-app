import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DeletePostConfirm from './DeletePostConfirm';

const renderConfirm = (props = {}) => render(<DeletePostConfirm onDeleteClick={jest.fn()} onCancelClick={jest.fn()} {...props} />);

describe('DeletePostConfirm', () => {
	it('warns that the post and its comments will be permanently deleted', () => {
		renderConfirm();

		expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
	});

	it('shows Delete and Cancel buttons', () => {
		renderConfirm();

		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('calls onDeleteClick and not onCancelClick when Delete is clicked', () => {
		const onDeleteClick = jest.fn();
		const onCancelClick = jest.fn();
		renderConfirm({ onDeleteClick, onCancelClick });

		userEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect(onDeleteClick).toHaveBeenCalledTimes(1);
		expect(onCancelClick).not.toHaveBeenCalled();
	});

	it('calls onCancelClick and not onDeleteClick when Cancel is clicked', () => {
		const onDeleteClick = jest.fn();
		const onCancelClick = jest.fn();
		renderConfirm({ onDeleteClick, onCancelClick });

		userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(onCancelClick).toHaveBeenCalledTimes(1);
		expect(onDeleteClick).not.toHaveBeenCalled();
	});

	it('shows no error message by default', () => {
		const { container } = renderConfirm();

		expect(container.querySelector('.form-error')).not.toBeInTheDocument();
	});

	it('shows the error message when one is given', () => {
		renderConfirm({ errorMessage: 'Could not delete the post' });

		expect(screen.getByText('Could not delete the post')).toBeInTheDocument();
	});

	it('disables Delete but keeps Cancel enabled while deleting', () => {
		renderConfirm({ isDeleting: true });

		expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
	});

	it('enables Delete when not deleting', () => {
		renderConfirm({ isDeleting: false });

		expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
	});
});
