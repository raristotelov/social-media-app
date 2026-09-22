import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AddImagePostForm from './AddImagePostForm';

const renderAddImagePostForm = (addImagePostHandler, onCancelClick) =>
	render(<AddImagePostForm addImagePostHandler={addImagePostHandler} onCancelClick={onCancelClick} />);

describe('AddImagePostForm', () => {
	it('shows "Please choose a picture" and does not submit when no picture is chosen', () => {
		const addImagePostHandler = jest.fn();
		renderAddImagePostForm(addImagePostHandler, jest.fn());

		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(screen.getByText('Please choose a picture')).toBeInTheDocument();
		expect(addImagePostHandler).not.toHaveBeenCalled();
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
});
