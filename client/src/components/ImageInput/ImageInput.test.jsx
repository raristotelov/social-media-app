import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ImageInput from './ImageInput';

const initialPicture = 'https://example.com/current.jpg';

const renderImageInput = (props = {}) => {
	const onChange = vi.fn();
	const utils = render(<ImageInput onChange={onChange} {...props} />);

	return { ...utils, onChange, fileInput: utils.container.querySelector('input[type="file"]') };
};

const buildFile = (name = 'new.png') => new File(['(image)'], name, { type: 'image/png' });

const MAX_BYTES = 10 * 1024 * 1024;

const buildFileOfSize = (size, { name = 'photo.jpg', type = 'image/jpeg' } = {}) => {
	const file = new File(['(image)'], name, { type });

	Object.defineProperty(file, 'size', { value: size });

	return file;
};

describe('ImageInput', () => {
	let openPickerSpy;
	let user;

	beforeEach(() => {
		user = userEvent.setup({ applyAccept: false });
		globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
		globalThis.URL.revokeObjectURL = vi.fn();
		openPickerSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
	});

	afterEach(() => {
		openPickerSpy.mockRestore();
	});

	describe('choosing a picture', () => {
		it('calls onChange with the chosen file', async () => {
			const { onChange, fileInput } = renderImageInput();
			const file = buildFile();

			await user.upload(fileInput, file);

			expect(onChange).toHaveBeenCalledWith(file);
		});

		it('ignores a cancelled file dialog and keeps the current picture', () => {
			const { onChange, fileInput } = renderImageInput({ initialValue: initialPicture });

			fireEvent.change(fileInput, { target: { files: [] } });

			expect(onChange).not.toHaveBeenCalled();
			expect(screen.getByAltText('preview')).toHaveAttribute('src', initialPicture);
		});
	});

	describe('file type', () => {
		it('only offers JPEG, PNG and WebP in the file picker', () => {
			const { fileInput } = renderImageInput();

			expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
		});

		it.each([
			['image/jpeg', 'photo.jpg'],
			['image/png', 'photo.png'],
			['image/webp', 'photo.webp'],
		])('accepts a %s file', async (type, name) => {
			const onInvalidFile = vi.fn();
			const { onChange, fileInput } = renderImageInput({ onInvalidFile });
			const file = buildFileOfSize(1024, { name, type });

			await user.upload(fileInput, file);

			expect(onChange).toHaveBeenCalledWith(file);
			expect(onInvalidFile).not.toHaveBeenCalled();
		});

		it.each([
			['a GIF', 'animation.gif', 'image/gif'],
			['an SVG', 'logo.svg', 'image/svg+xml'],
			['a PDF', 'document.pdf', 'application/pdf'],
			['a text file', 'notes.txt', 'text/plain'],
			['a file with no detectable type', 'mystery', ''],
		])('rejects %s with the type message and does not pass it on', async (_name, fileName, type) => {
			const onInvalidFile = vi.fn();
			const { onChange, fileInput } = renderImageInput({ onInvalidFile });

			await user.upload(fileInput, buildFileOfSize(1024, { name: fileName, type }));

			expect(onInvalidFile).toHaveBeenCalledTimes(1);
			expect(onInvalidFile).toHaveBeenCalledWith('Choose a JPEG, PNG or WebP image');
			expect(onChange).not.toHaveBeenCalled();
		});

		it('clears the file input after rejecting a wrong type, so the same file can be chosen again', async () => {
			const { fileInput } = renderImageInput({ onInvalidFile: vi.fn() });

			await user.upload(fileInput, buildFileOfSize(1024, { name: 'notes.txt', type: 'text/plain' }));

			expect(fileInput.files).toHaveLength(0);
			expect(fileInput.value).toBe('');
		});

		it('does not show a preview for a rejected file', async () => {
			const { container, fileInput } = renderImageInput({ onInvalidFile: vi.fn() });

			await user.upload(fileInput, buildFileOfSize(1024, { name: 'notes.txt', type: 'text/plain' }));

			expect(container.querySelector('.preview-wrapper')).toHaveClass('hidden');
			expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
		});

		it('keeps the current picture when a wrong file is chosen as a replacement', async () => {
			const { onChange, fileInput } = renderImageInput({ initialValue: initialPicture, onInvalidFile: vi.fn() });

			await user.upload(fileInput, buildFileOfSize(1024, { name: 'notes.txt', type: 'text/plain' }));

			expect(onChange).not.toHaveBeenCalled();
			expect(screen.getByAltText('preview')).toHaveAttribute('src', initialPicture);
		});

		it('does not throw when a wrong file is chosen and no onInvalidFile handler is given', async () => {
			const { onChange, fileInput } = renderImageInput();

			await expect(user.upload(fileInput, buildFileOfSize(1024, { name: 'notes.txt', type: 'text/plain' }))).resolves.toBeUndefined();
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe('file size', () => {
		it('accepts a file of exactly 10 MB', async () => {
			const onInvalidFile = vi.fn();
			const { onChange, fileInput } = renderImageInput({ onInvalidFile });
			const file = buildFileOfSize(MAX_BYTES);

			await user.upload(fileInput, file);

			expect(onChange).toHaveBeenCalledWith(file);
			expect(onInvalidFile).not.toHaveBeenCalled();
		});

		it('rejects a file one byte over 10 MB with the size message and does not pass it on', async () => {
			const onInvalidFile = vi.fn();
			const { onChange, fileInput } = renderImageInput({ onInvalidFile });

			await user.upload(fileInput, buildFileOfSize(MAX_BYTES + 1));

			expect(onInvalidFile).toHaveBeenCalledTimes(1);
			expect(onInvalidFile).toHaveBeenCalledWith('This image is over 10 MB');
			expect(onChange).not.toHaveBeenCalled();
		});

		it('clears the file input after rejecting an oversized file', async () => {
			const { fileInput } = renderImageInput({ onInvalidFile: vi.fn() });

			await user.upload(fileInput, buildFileOfSize(MAX_BYTES + 1));

			expect(fileInput.files).toHaveLength(0);
			expect(fileInput.value).toBe('');
		});

		it('does not show a preview for an oversized file', async () => {
			const { container, fileInput } = renderImageInput({ onInvalidFile: vi.fn() });

			await user.upload(fileInput, buildFileOfSize(MAX_BYTES + 1));

			expect(container.querySelector('.preview-wrapper')).toHaveClass('hidden');
		});

		it('checks the type before the size, so an oversized wrong-type file gets the type message', async () => {
			const onInvalidFile = vi.fn();
			const { fileInput } = renderImageInput({ onInvalidFile });

			await user.upload(fileInput, buildFileOfSize(MAX_BYTES + 1, { name: 'video.mp4', type: 'video/mp4' }));

			expect(onInvalidFile).toHaveBeenCalledTimes(1);
			expect(onInvalidFile).toHaveBeenCalledWith('Choose a JPEG, PNG or WebP image');
		});

		it('does not throw when an oversized file is chosen and no onInvalidFile handler is given', async () => {
			const { onChange, fileInput } = renderImageInput();

			await expect(user.upload(fileInput, buildFileOfSize(MAX_BYTES + 1))).resolves.toBeUndefined();
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe('with a picture present', () => {
		it('shows the current picture as the preview', () => {
			renderImageInput({ initialValue: initialPicture });

			expect(screen.getByAltText('preview')).toHaveAttribute('src', initialPicture);
		});

		it('opens the file picker when the picture is clicked', async () => {
			renderImageInput({ initialValue: initialPicture });
			openPickerSpy.mockClear();

			await user.click(screen.getByAltText('preview'));

			expect(openPickerSpy).toHaveBeenCalledTimes(1);
		});

		it('opens the file picker when Change is clicked', async () => {
			renderImageInput({ initialValue: initialPicture });
			openPickerSpy.mockClear();

			await user.click(screen.getByRole('button', { name: 'Change' }));

			expect(openPickerSpy).toHaveBeenCalledTimes(1);
		});

		it('shows the new file as the preview after choosing a replacement', async () => {
			const { fileInput } = renderImageInput({ initialValue: initialPicture });

			await user.upload(fileInput, buildFile());

			expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('blurred backdrop', () => {
		it('shows no blurred copy by default', () => {
			const { container } = renderImageInput({ initialValue: initialPicture });

			expect(container.querySelector('.preview-backdrop')).not.toBeInTheDocument();
		});

		it('puts a decorative blurred copy of the picture behind the preview when asked to', () => {
			const { container } = renderImageInput({ initialValue: initialPicture, hasBlurredBackdrop: true });
			const backdrop = container.querySelector('.preview-backdrop');

			expect(backdrop).toHaveAttribute('aria-hidden', 'true');
			expect(backdrop.querySelector('img')).toHaveAttribute('src', initialPicture);
			expect(backdrop.querySelector('img')).toHaveAttribute('alt', '');
		});

		it('keeps the real preview picture available by its alt text', () => {
			renderImageInput({ initialValue: initialPicture, hasBlurredBackdrop: true });

			expect(screen.getByAltText('preview')).toHaveAttribute('src', initialPicture);
		});

		it('blurs a newly chosen file too', async () => {
			const { container, fileInput } = renderImageInput({ hasBlurredBackdrop: true });

			await user.upload(fileInput, buildFile());

			expect(container.querySelector('.preview-backdrop img')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('remove button', () => {
		it('is not rendered when onRemove is not given', () => {
			renderImageInput({ initialValue: initialPicture });

			expect(screen.queryByRole('button', { name: 'Remove picture' })).not.toBeInTheDocument();
		});

		it('is rendered inside a visible preview when onRemove is given and a picture is present', () => {
			renderImageInput({ initialValue: initialPicture, onRemove: vi.fn() });

			const removeButton = screen.getByRole('button', { name: 'Remove picture' });

			expect(removeButton.closest('.preview-wrapper')).not.toHaveClass('hidden');
		});

		it('sits inside a hidden preview when no picture is present', () => {
			renderImageInput({ onRemove: vi.fn() });

			expect(screen.getByRole('button', { name: 'Remove picture' }).closest('.preview-wrapper')).toHaveClass('hidden');
		});

		it('calls onRemove, and not onChange, when clicked', async () => {
			const onRemove = vi.fn();
			const { onChange } = renderImageInput({ initialValue: initialPicture, onRemove });

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(onRemove).toHaveBeenCalledTimes(1);
			expect(onChange).not.toHaveBeenCalled();
		});

		it('does not open the file picker when clicked', async () => {
			renderImageInput({ initialValue: initialPicture, onRemove: vi.fn() });
			openPickerSpy.mockClear();

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(openPickerSpy).not.toHaveBeenCalled();
		});

		it('hides the preview and shows the empty input after removal', async () => {
			const { container } = renderImageInput({ initialValue: initialPicture, onRemove: vi.fn() });

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(container.querySelector('.preview-wrapper')).toHaveClass('hidden');
			expect(container.querySelector('.image-input-wrapper')).not.toHaveClass('hidden');
		});

		it('hides the preview and shows the empty input after removing a freshly chosen file', async () => {
			const { container, fileInput } = renderImageInput({ onRemove: vi.fn() });

			await user.upload(fileInput, buildFile());
			expect(container.querySelector('.preview-wrapper')).not.toHaveClass('hidden');

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(container.querySelector('.preview-wrapper')).toHaveClass('hidden');
		});

		it('lets a new file be chosen after removal and shows it as the preview', async () => {
			const { onChange, fileInput } = renderImageInput({ initialValue: initialPicture, onRemove: vi.fn() });
			const file = buildFile();

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.upload(fileInput, file);

			expect(onChange).toHaveBeenCalledWith(file);
			expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview');
		});
	});

	describe('placeholder sizing', () => {
		it('draws the placeholder icon at the width and height given in props', () => {
			const { container } = renderImageInput({ iconWidthProp: 120, iconHeightProp: 80 });
			const icon = container.querySelector('label svg');

			expect(icon).toHaveAttribute('width', '120px');
			expect(icon).toHaveAttribute('height', '80px');
		});

		it('falls back to a 90px icon when no icon size is given', () => {
			const { container } = renderImageInput();
			const icon = container.querySelector('label svg');

			expect(icon).toHaveAttribute('width', '90px');
			expect(icon).toHaveAttribute('height', '90px');
		});

		it('sets the placeholder text to the font size given in props', () => {
			renderImageInput({ placeholderText: 'Choose a Picture', fontSizeProp: 20 });

			expect(screen.getByText('Choose a Picture')).toHaveStyle({ fontSize: '20px' });
		});

		it('falls back to a 22px placeholder text when no font size is given', () => {
			renderImageInput({ placeholderText: 'Choose a Picture' });

			expect(screen.getByText('Choose a Picture')).toHaveStyle({ fontSize: '22px' });
		});
	});
});
