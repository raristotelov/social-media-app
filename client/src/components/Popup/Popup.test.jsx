import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Popup from './Popup';

describe('Popup', () => {
	it('renders the title when given', () => {
		render(<Popup title='Edit profile' onClosePopupClick={jest.fn()} />);

		expect(screen.getByRole('heading', { name: 'Edit profile' })).toBeInTheDocument();
	});

	it('omits the title when none is given', () => {
		render(<Popup onClosePopupClick={jest.fn()} />);

		expect(screen.queryByRole('heading')).not.toBeInTheDocument();
	});

	it('calls onClosePopupClick when the close button is clicked', () => {
		const onClosePopupClick = jest.fn();
		render(<Popup onClosePopupClick={onClosePopupClick} />);

		userEvent.click(screen.getByRole('button', { name: 'Close' }));

		expect(onClosePopupClick).toHaveBeenCalledTimes(1);
	});

	it('calls onClosePopupClick when Escape is pressed', () => {
		const onClosePopupClick = jest.fn();
		render(<Popup onClosePopupClick={onClosePopupClick} />);

		userEvent.keyboard('{Escape}');

		expect(onClosePopupClick).toHaveBeenCalledTimes(1);
	});

	describe('with a popup nested inside another', () => {
		const renderNested = () => {
			const onCloseOuter = jest.fn();
			const onCloseInner = jest.fn();

			const rendered = render(
				<Popup title='Outer' onClosePopupClick={onCloseOuter}>
					<Popup title='Inner' onClosePopupClick={onCloseInner} />
				</Popup>,
			);

			return { ...rendered, onCloseOuter, onCloseInner };
		};

		it('closes only the top popup on Escape', () => {
			const { onCloseOuter, onCloseInner } = renderNested();

			userEvent.keyboard('{Escape}');

			expect(onCloseInner).toHaveBeenCalledTimes(1);
			expect(onCloseOuter).not.toHaveBeenCalled();
		});

		it('closes the outer popup on Escape once the inner one is gone', () => {
			const onCloseOuter = jest.fn();
			const { rerender } = render(
				<Popup title='Outer' onClosePopupClick={onCloseOuter}>
					<Popup title='Inner' onClosePopupClick={jest.fn()} />
				</Popup>,
			);

			rerender(<Popup title='Outer' onClosePopupClick={onCloseOuter} />);
			userEvent.keyboard('{Escape}');

			expect(onCloseOuter).toHaveBeenCalledTimes(1);
		});

		it('closes the outer popup on Escape when its children are not popups', () => {
			const onCloseOuter = jest.fn();

			render(
				<Popup onClosePopupClick={onCloseOuter}>
					<p>Not a popup</p>
				</Popup>,
			);

			userEvent.keyboard('{Escape}');

			expect(onCloseOuter).toHaveBeenCalledTimes(1);
		});

		it('still closes the inner popup with its own close button', () => {
			const { onCloseOuter, onCloseInner } = renderNested();

			const innerClose = screen.getAllByRole('button', { name: 'Close' })[1];

			userEvent.click(innerClose);

			expect(onCloseInner).toHaveBeenCalledTimes(1);
			expect(onCloseOuter).not.toHaveBeenCalled();
		});
	});

	it('ignores other keys', () => {
		const onClosePopupClick = jest.fn();
		render(<Popup onClosePopupClick={onClosePopupClick} />);

		userEvent.keyboard('{Enter}');

		expect(onClosePopupClick).not.toHaveBeenCalled();
	});

	it('stops listening for Escape once closed', () => {
		const onClosePopupClick = jest.fn();
		const { unmount } = render(<Popup onClosePopupClick={onClosePopupClick} />);

		unmount();
		userEvent.keyboard('{Escape}');

		expect(onClosePopupClick).not.toHaveBeenCalled();
	});

	it('renders its children', () => {
		render(
			<Popup onClosePopupClick={jest.fn()}>
				<p>Popup content</p>
			</Popup>,
		);

		expect(screen.getByText('Popup content')).toBeInTheDocument();
	});

	it('keeps the default container and body classes when no extra classes are given', () => {
		const { container } = render(<Popup onClosePopupClick={jest.fn()} />);

		expect(container.querySelector('.popup-container')).toBeInTheDocument();
		expect(container.querySelector('.popup-body')).toBeInTheDocument();
	});

	it('adds className to the container while keeping popup-container', () => {
		const { container } = render(<Popup className='delete-post-popup' onClosePopupClick={jest.fn()} />);

		expect(container.firstChild).toHaveClass('popup-container', 'delete-post-popup');
	});

	it('adds bodyClassName to the body while keeping popup-body', () => {
		const { container } = render(<Popup bodyClassName='bottom-sheet' onClosePopupClick={jest.fn()} />);

		expect(container.querySelector('.popup-body')).toHaveClass('popup-body', 'bottom-sheet');
	});

	it('does not put className on the body or bodyClassName on the container', () => {
		const { container } = render(<Popup className='outer-extra' bodyClassName='inner-extra' onClosePopupClick={jest.fn()} />);

		expect(container.firstChild).not.toHaveClass('inner-extra');
		expect(container.querySelector('.popup-body')).not.toHaveClass('outer-extra');
	});

	it('does not leak "undefined" into the class names when the extra classes are omitted', () => {
		const { container } = render(<Popup onClosePopupClick={jest.fn()} />);

		expect(container.firstChild.className).toBe('popup-container');
		expect(container.querySelector('.popup-body').className).toBe('popup-body');
	});
});
