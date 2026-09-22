import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getUsersProfileData } from '../../services/userService';

import MainHeader from './MainHeader';

jest.mock('../../services/userService');

const renderMainHeader = (loggedInUser, logoutHandler = jest.fn()) => {
	getUsersProfileData.mockResolvedValue([]);

	return render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser }}>
			<MemoryRouter>
				<MainHeader logoutHandler={logoutHandler} />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);
};

describe('MainHeader', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows Log in and Sign up links, and still renders the search field, for a guest', () => {
		renderMainHeader(null);

		expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
		expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
	});

	it("shows the logged-in user's username, the account menu trigger and the Feed/Popular navigation", () => {
		const { container } = renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] });

		expect(screen.getByText('johndoe')).toBeInTheDocument();
		expect(container.querySelector('[aria-haspopup="menu"]')).toBeInTheDocument();
		expect(screen.getByText('Feed')).toBeInTheDocument();
		expect(screen.getByText('Popular')).toBeInTheDocument();
	});

	it('calls getUsersProfileData with the search word once at least two characters have been typed', async () => {
		renderMainHeader({ _id: 'user1', username: 'johndoe', following: [] });

		userEvent.type(screen.getByPlaceholderText('Search'), 'ab');

		await waitFor(() => expect(getUsersProfileData).toHaveBeenCalledWith({ searchWord: 'ab', jwtToken: 'token123' }));
	});
});
