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
