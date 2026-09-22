import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getUsersProfileData, followUser } from '../../services/userService';

import ProfileView from './ProfileView';

jest.mock('../../services/userService');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
	const actual = jest.requireActual('react-router-dom');

	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

const profileUser = {
	_id: 'user2',
	username: 'janedoe',
	bio: 'Just a bio',
	posts: [],
	followers: [],
	following: [],
};

const renderProfileView = (loggedInUser) => {
	getUsersProfileData.mockResolvedValue([profileUser]);

	return render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn() }}>
			<MemoryRouter initialEntries={['/user/user2']}>
				<Routes>
					<Route path='/user/:userId' element={<ProfileView />} />
				</Routes>
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);
};

describe('ProfileView', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders the profile content for a guest and navigates to /log-in instead of calling followUser when Follow is clicked', async () => {
		renderProfileView(null);

		expect(await screen.findByText('janedoe')).toBeInTheDocument();

		userEvent.click(screen.getByRole('button', { name: 'Follow' }));

		expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2' } });
		expect(followUser).not.toHaveBeenCalled();
	});

	it("calls followUser when a logged-in user clicks Follow on someone else's profile", async () => {
		followUser.mockResolvedValue({ user: profileUser });

		renderProfileView({ _id: 'user1', username: 'johndoe', following: [] });

		expect(await screen.findByText('janedoe')).toBeInTheDocument();

		userEvent.click(screen.getByRole('button', { name: 'Follow' }));

		await waitFor(() => expect(followUser).toHaveBeenCalledWith({ userId: 'user1', jwtToken: 'token123', userIdToFollow: 'user2' }));
	});
});
