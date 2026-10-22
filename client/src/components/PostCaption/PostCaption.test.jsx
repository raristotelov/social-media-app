import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PostCaption from './PostCaption';

const CAPTION = 'A very long caption that goes on and on across many lines of the post card';

describe('PostCaption', () => {
	let scrollHeightSpy;
	let clientHeightSpy;

	const setLayout = ({ scrollHeight, clientHeight }) => {
		scrollHeightSpy.mockReturnValue(scrollHeight);
		clientHeightSpy.mockReturnValue(clientHeight);
	};

	const setFittingLayout = () => setLayout({ scrollHeight: 40, clientHeight: 40 });

	const setOverflowingLayout = () => setLayout({ scrollHeight: 120, clientHeight: 40 });

	const getMoreButton = () => screen.queryByRole('button', { name: /more/ });

	beforeEach(() => {
		scrollHeightSpy = jest.spyOn(Element.prototype, 'scrollHeight', 'get');
		clientHeightSpy = jest.spyOn(Element.prototype, 'clientHeight', 'get');
		setFittingLayout();
	});

	afterEach(() => {
		scrollHeightSpy.mockRestore();
		clientHeightSpy.mockRestore();
		delete document.fonts;
	});

	it('shows the username followed by the caption', () => {
		const { container } = render(<PostCaption username='janedoe' caption={CAPTION} />);

		expect(container.querySelector('.post-caption-username')).toHaveTextContent('janedoe');
		expect(container.querySelector('.post-caption')).toHaveTextContent(`janedoe ${CAPTION}`);
	});

	it('shows no "more" control when the caption fits in two lines', () => {
		render(<PostCaption username='janedoe' caption={CAPTION} />);

		expect(getMoreButton()).not.toBeInTheDocument();
	});

	it('shows no "more" control when the overflow is only a pixel of rounding', () => {
		setLayout({ scrollHeight: 41, clientHeight: 40 });

		render(<PostCaption username='janedoe' caption={CAPTION} />);

		expect(getMoreButton()).not.toBeInTheDocument();
	});

	it('shows "… more" when the caption overflows its two lines', () => {
		setOverflowingLayout();

		render(<PostCaption username='janedoe' caption={CAPTION} />);

		expect(getMoreButton()).toHaveTextContent('… more');
	});

	it('cuts the caption while it is collapsed', () => {
		setOverflowingLayout();

		const { container } = render(<PostCaption username='janedoe' caption={CAPTION} />);

		expect(container.querySelector('.post-caption')).toHaveClass('post-caption-clamped');
	});

	it('expands the full caption when "more" is clicked', () => {
		setOverflowingLayout();

		const { container } = render(<PostCaption username='janedoe' caption={CAPTION} />);

		userEvent.click(getMoreButton());

		expect(container.querySelector('.post-caption')).not.toHaveClass('post-caption-clamped');
	});

	it('removes the "more" control once expanded', () => {
		setOverflowingLayout();

		render(<PostCaption username='janedoe' caption={CAPTION} />);

		userEvent.click(getMoreButton());

		expect(getMoreButton()).not.toBeInTheDocument();
	});

	it('keeps the whole caption text in the page after expanding', () => {
		setOverflowingLayout();

		const { container } = render(<PostCaption username='janedoe' caption={CAPTION} />);

		userEvent.click(getMoreButton());

		expect(container.querySelector('.post-caption')).toHaveTextContent(CAPTION);
	});

	it('shows "more" when the window is resized so that the caption no longer fits', () => {
		render(<PostCaption username='janedoe' caption={CAPTION} />);

		setOverflowingLayout();
		act(() => {
			fireEvent(window, new Event('resize'));
		});

		expect(getMoreButton()).toBeInTheDocument();
	});

	it('hides "more" when the window is resized so that the caption fits again', () => {
		setOverflowingLayout();

		render(<PostCaption username='janedoe' caption={CAPTION} />);

		setFittingLayout();
		act(() => {
			fireEvent(window, new Event('resize'));
		});

		expect(getMoreButton()).not.toBeInTheDocument();
	});

	it('measures again when the caption changes', () => {
		const { rerender } = render(<PostCaption username='janedoe' caption='Short' />);

		setOverflowingLayout();
		rerender(<PostCaption username='janedoe' caption={CAPTION} />);

		expect(getMoreButton()).toBeInTheDocument();
	});

	it('measures again once the fonts have loaded', async () => {
		let resolveFonts;
		const fontsReady = new Promise((resolve) => {
			resolveFonts = resolve;
		});

		Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontsReady } });

		render(<PostCaption username='janedoe' caption={CAPTION} />);

		setOverflowingLayout();
		await act(async () => {
			resolveFonts();
			await fontsReady;
		});

		expect(getMoreButton()).toBeInTheDocument();
	});

	it('stops listening for resizes once unmounted', () => {
		const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
		const { unmount } = render(<PostCaption username='janedoe' caption={CAPTION} />);

		unmount();

		expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

		removeEventListenerSpy.mockRestore();
	});
});
