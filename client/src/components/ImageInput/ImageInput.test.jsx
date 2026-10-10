import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ImageInput from './ImageInput';

const initialPicture = 'https://example.com/current.jpg';

const renderImageInput = (props = {}) => {
	const onChange = jest.fn();
	const utils = render(<ImageInput onChange={onChange} {...props} />);

	return { ...utils, onChange, fileInput: utils.container.querySelector('input[type="file"]') };
};

const buildFile = (name = 'new.png') => new File(['(image)'], name, { type: 'image/png' });

describe('ImageInput', () => {
	let openPickerSpy;

	beforeEach(() => {
		global.URL.createObjectURL = jest.fn(() => 'blob:preview');
		global.URL.revokeObjectURL = jest.fn();
		openPickerSpy = jest.spyOn(HTMLInputElement.prototype, 'click');
	});

	afterEach(() => {
		openPickerSpy.mockRestore();
	});

	describe('choosing a picture', () => {
		it('calls onChange with the chosen file', () => {
			const { onChange, fileInput } = renderImageInput();
			const file = buildFile();

			userEvent.upload(fileInput, file);

			expect(onChange).toHaveBeenCalledWith(file);
		});

		it('ignores a cancelled file dialog and keeps the current picture', () => {
			const { onChange, fileInput } = renderImageInput({ initialValue: initialPicture });

			fireEvent.change(fileInput, { target: { files: [] } });

			expect(onChange).not.toHaveBeenCalled();
			expect(screen.getByAltText('preview')).toHaveAttribute('src', initialPicture);
		});
	});

	describe('with a picture present', () => {
		it('shows the current picture as the preview', () => {
			renderImageInput({ initialValue: initialPicture });

			expect(screen.getByAltText('preview')).toHaveAttribute('src', initialPicture);
		});

		it('opens the file picker when the picture is clicked', () => {
			renderImageInput({ initialValue: initialPicture });
			openPickerSpy.mockClear();

			userEvent.click(screen.getByAltText('preview'));

			expect(openPickerSpy).toHaveBeenCalledTimes(1);
		});

		it('opens the file picker when Change is clicked', () => {
			renderImageInput({ initialValue: initialPicture });
			openPickerSpy.mockClear();

			userEvent.click(screen.getByRole('button', { name: 'Change' }));

			expect(openPickerSpy).toHaveBeenCalledTimes(1);
		});

		it('shows the new file as the preview after choosing a replacement', () => {
			const { fileInput } = renderImageInput({ initialValue: initialPicture });

			userEvent.upload(fileInput, buildFile());

			expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('remove button', () => {
		it('is not rendered when onRemove is not given', () => {
			renderImageInput({ initialValue: initialPicture });

			expect(screen.queryByRole('button', { name: 'Remove picture' })).not.toBeInTheDocument();
		});

		it('is rendered inside a visible preview when onRemove is given and a picture is present', () => {
			renderImageInput({ initialValue: initialPicture, onRemove: jest.fn() });

			const removeButton = screen.getByRole('button', { name: 'Remove picture' });

			expect(removeButton.closest('.preview-wrapper')).not.toHaveClass('hidden');
		});

		it('sits inside a hidden preview when no picture is present', () => {
			renderImageInput({ onRemove: jest.fn() });

			expect(screen.getByRole('button', { name: 'Remove picture' }).closest('.preview-wrapper')).toHaveClass('hidden');
		});

		it('calls onRemove, and not onChange, when clicked', () => {
			const onRemove = jest.fn();
			const { onChange } = renderImageInput({ initialValue: initialPicture, onRemove });

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(onRemove).toHaveBeenCalledTimes(1);
			expect(onChange).not.toHaveBeenCalled();
		});

		it('does not open the file picker when clicked', () => {
			renderImageInput({ initialValue: initialPicture, onRemove: jest.fn() });
			openPickerSpy.mockClear();

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(openPickerSpy).not.toHaveBeenCalled();
		});

		it('hides the preview and shows the empty input after removal', () => {
			const { container } = renderImageInput({ initialValue: initialPicture, onRemove: jest.fn() });

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(container.querySelector('.preview-wrapper')).toHaveClass('hidden');
			expect(container.querySelector('.image-input-wrapper')).not.toHaveClass('hidden');
		});

		it('hides the preview and shows the empty input after removing a freshly chosen file', () => {
			const { container, fileInput } = renderImageInput({ onRemove: jest.fn() });

			userEvent.upload(fileInput, buildFile());
			expect(container.querySelector('.preview-wrapper')).not.toHaveClass('hidden');

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(container.querySelector('.preview-wrapper')).toHaveClass('hidden');
		});

		it('lets a new file be chosen after removal and shows it as the preview', () => {
			const { onChange, fileInput } = renderImageInput({ initialValue: initialPicture, onRemove: jest.fn() });
			const file = buildFile();

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.upload(fileInput, file);

			expect(onChange).toHaveBeenCalledWith(file);
			expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview');
		});
	});
});
