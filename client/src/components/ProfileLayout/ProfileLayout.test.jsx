import '@testing-library/jest-dom';
import { useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import NotFoundContext from '../../contexts/NotFoundContext';
import { getUsersProfileData } from '../../services/userService';

import ToastProvider from '../ToastProvider/ToastProvider';
import NotFoundProvider from '../NotFoundProvider/NotFoundProvider';
import ProfileLayout from './ProfileLayout';

jest.mock('../../services/userService');
jest.mock('../../services/userPostService');

const validProfile = { _id: 'user2', username: 'janedoe', posts: [], followers: [], following: [] };

const FlagProbe = () => {
	const { isNotFound } = useContext(NotFoundContext);

	return <p data-testid='flag'>{String(isNotFound)}</p>;
};

const renderLayoutAt = (path) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser: null, updateLoggedInUser: jest.fn(), endSession: jest.fn() }}>
			<ToastProvider>
				<NotFoundProvider>
					<MemoryRouter initialEntries={[path]}>
						<Link to='/user/user2'>Go to valid profile</Link>

						<Routes>
							<Route path='/user/:userId' element={<ProfileLayout />}>
								<Route index element={<p>Profile outlet</p>} />

								<Route path='posts' element={<p>Posts outlet</p>} />
							</Route>
						</Routes>

						<FlagProbe />
					</MemoryRouter>
				</NotFoundProvider>
			</ToastProvider>
		</LoggedInUserContext.Provider>,
	);

describe('ProfileLayout', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('when the user does not exist', () => {
		beforeEach(() => {
			getUsersProfileData.mockImplementation(({ userIds }) =>
				userIds[0] === 'user2' ? Promise.resolve([validProfile]) : Promise.reject({ code: 'USER_NOT_FOUND', status: 404 }),
			);
		});

		it.each([['/user/missing'], ['/user/missing/posts']])('shows the 404 page at %s', async (path) => {
			renderLayoutAt(path);

			expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
			expect(screen.queryByText('Profile outlet')).not.toBeInTheDocument();
			expect(screen.queryByText('Posts outlet')).not.toBeInTheDocument();
		});

		it('does not show the profile load error or its Retry button', async () => {
			renderLayoutAt('/user/missing');

			await screen.findByRole('heading', { name: 'Page not found' });
			expect(screen.queryByRole('heading', { name: "Couldn't load this profile" })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
		});

		it('marks the page as not found', async () => {
			renderLayoutAt('/user/missing');

			await screen.findByRole('heading', { name: 'Page not found' });
			await waitFor(() => expect(screen.getByTestId('flag')).toHaveTextContent('true'));
		});

		it('shows the profile and clears the not found mark after navigating to a valid profile', async () => {
			renderLayoutAt('/user/missing');

			await screen.findByRole('heading', { name: 'Page not found' });
			userEvent.click(screen.getByRole('link', { name: 'Go to valid profile' }));

			expect(await screen.findByText('Profile outlet')).toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
			await waitFor(() => expect(screen.getByTestId('flag')).toHaveTextContent('false'));
		});
	});

	describe('when the profile fails to load for another reason', () => {
		it.each([
			['a server failure', { code: 'INTERNAL_ERROR', status: 500 }],
			['a network failure', { code: 'INTERNAL_ERROR', status: 0 }],
		])('shows the load error with Retry, not the 404 page, for %s', async (_name, error) => {
			getUsersProfileData.mockRejectedValue(error);

			renderLayoutAt('/user/user2');

			expect(await screen.findByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
			expect(screen.getByTestId('flag')).toHaveTextContent('false');
		});
	});

	describe('when the user exists', () => {
		it('shows the profile outlet and no 404 page', async () => {
			getUsersProfileData.mockResolvedValue([validProfile]);

			renderLayoutAt('/user/user2');

			expect(await screen.findByText('Profile outlet')).toBeInTheDocument();
			expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
			expect(screen.getByTestId('flag')).toHaveTextContent('false');
		});
	});
});
