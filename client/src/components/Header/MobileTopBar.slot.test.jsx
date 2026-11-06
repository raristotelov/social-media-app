import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotFoundContext from '../../contexts/NotFoundContext';
import ToastContext from '../../contexts/ToastContext';

import MobileTopBar from './MobileTopBar';

jest.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', following: [] };

const renderTopBar = (path, user = loggedInUser) =>
	render(
		<LoggedInUserContext.Provider value={{ loggedInUser: user }}>
			<NotFoundContext.Provider value={{ isNotFound: false, setIsNotFound: jest.fn() }}>
				<ToastContext.Provider value={{ showToast: jest.fn() }}>
					<MemoryRouter initialEntries={[path]}>
						<MobileTopBar logoutHandler={jest.fn()} />
					</MemoryRouter>
				</ToastContext.Provider>
			</NotFoundContext.Provider>
		</LoggedInUserContext.Provider>,
	);

describe('MobileTopBar slot', () => {
	it('wraps the bar in the sticky slot', () => {
		const { container } = renderTopBar('/user-feed');

		expect(container.firstChild).toHaveClass('mobile-top-bar-slot');
		expect(container.querySelector('.mobile-top-bar-slot > .mobile-top-bar')).toBeInTheDocument();
	});

	it('wraps the bar in the slot for a guest too', () => {
		const { container } = renderTopBar('/popular-posts', null);

		expect(container.querySelector('.mobile-top-bar-slot > .mobile-top-bar')).toBeInTheDocument();
	});

	it('keeps the slot, with the searching bar inside it, while searching', () => {
		const { container } = renderTopBar('/user-feed');

		userEvent.click(screen.getByRole('button', { name: 'Search' }));

		expect(container.querySelectorAll('.mobile-top-bar-slot')).toHaveLength(1);
		expect(container.querySelector('.mobile-top-bar-slot > .mobile-top-bar-searching')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
	});

	it('goes back to the normal bar in the same single slot after cancelling the search', () => {
		const { container } = renderTopBar('/user-feed');

		userEvent.click(screen.getByRole('button', { name: 'Search' }));
		userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(container.querySelectorAll('.mobile-top-bar-slot')).toHaveLength(1);
		expect(container.querySelector('.mobile-top-bar-searching')).not.toBeInTheDocument();
	});

	it('renders no slot where the Posts bar replaces the top bar', () => {
		const { container } = renderTopBar('/user/user2/posts');

		expect(container).toBeEmptyDOMElement();
	});
});
