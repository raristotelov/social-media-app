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
});
