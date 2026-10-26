import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { updateUserProfileData } from '../../services/userService';
import { dragDown, fireTransitionEnd, installBottomSheetEnvironment, restoreBottomSheetEnvironment } from '../../testUtils/bottomSheet';

import AccountMenu from './AccountMenu';

jest.mock('../../services/userService');

const loggedInUser = { _id: 'user1', username: 'johndoe', theme: 'light' };

const renderAccountMenu = (isOpen, props = {}) =>
	render(
		<LoggedInUserContext.Provider value={{ jwtToken: 'token123', loggedInUser, updateLoggedInUser: jest.fn() }}>
			<MemoryRouter>
				<AccountMenu isOpen={isOpen} onClose={jest.fn()} logoutHandler={jest.fn()} {...props} />
			</MemoryRouter>
		</LoggedInUserContext.Provider>,
	);

describe('AccountMenu', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders the Profile, Dark mode and Log out rows when open', () => {
		renderAccountMenu(true);

		expect(screen.getByText('Profile')).toBeInTheDocument();
		expect(screen.getByText('Dark mode')).toBeInTheDocument();
		expect(screen.getByText('Log out')).toBeInTheDocument();
	});

	it('places the Change password row between Dark mode and Log out', () => {
		renderAccountMenu(true, { onChangePasswordClick: jest.fn() });

		const rowLabels = screen.getAllByText(/^(Profile|Dark mode|Change password|Log out)$/).map((row) => row.textContent);

		expect(rowLabels).toEqual(['Profile', 'Dark mode', 'Change password', 'Log out']);
	});

	it('closes the menu and calls onChangePasswordClick when Change password is clicked', () => {
		const onClose = jest.fn();
		const onChangePasswordClick = jest.fn();
		renderAccountMenu(true, { onClose, onChangePasswordClick });

		userEvent.click(screen.getByRole('button', { name: 'Change password' }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onChangePasswordClick).toHaveBeenCalledTimes(1);
	});

	it('does not log out or toggle the theme when Change password is clicked', () => {
		const logoutHandler = jest.fn();
		renderAccountMenu(true, { logoutHandler, onChangePasswordClick: jest.fn() });

		userEvent.click(screen.getByRole('button', { name: 'Change password' }));

		expect(logoutHandler).not.toHaveBeenCalled();
		expect(updateUserProfileData).not.toHaveBeenCalled();
	});

	it('renders nothing when isOpen is false', () => {
		const { container } = renderAccountMenu(false);

		expect(container.querySelector('.account-menu')).not.toBeInTheDocument();
	});

	it('calls logoutHandler when Log out is clicked', () => {
		const logoutHandler = jest.fn();
		renderAccountMenu(true, { logoutHandler });

		userEvent.click(screen.getByRole('button', { name: 'Log out' }));

		expect(logoutHandler).toHaveBeenCalledTimes(1);
	});

	it('calls updateUserProfileData with the opposite theme when the dark mode switch is toggled', async () => {
		updateUserProfileData.mockResolvedValue({ ...loggedInUser, theme: 'dark' });

		renderAccountMenu(true);

		userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

		await waitFor(() =>
			expect(updateUserProfileData).toHaveBeenCalledWith({
				userId: 'user1',
				jwtToken: 'token123',
				updatedProfileData: { theme: 'dark' },
			}),
		);
	});

	describe('as a bottom sheet', () => {
		const getSheet = (container) => container.querySelector('.account-menu');
		const getHandle = (container) => container.querySelector('.bottom-sheet-handle');

		beforeEach(() => {
			installBottomSheetEnvironment();
		});

		afterEach(() => {
			restoreBottomSheetEnvironment();
		});

		it('renders the drag handle inside the menu', () => {
			const { container } = renderAccountMenu(true, { isBottomSheet: true });

			expect(getSheet(container)).toContainElement(getHandle(container));
		});

		it('renders no handle when it is not a bottom sheet', () => {
			const { container } = renderAccountMenu(true);

			expect(getHandle(container)).not.toBeInTheDocument();
		});

		it('renders no handle while closed', () => {
			const { container } = renderAccountMenu(false, { isBottomSheet: true });

			expect(getHandle(container)).not.toBeInTheDocument();
		});

		it('slides out and then calls onClose when the handle is dragged down past 25%', () => {
			const onClose = jest.fn();
			const { container } = renderAccountMenu(true, { isBottomSheet: true, onClose });

			dragDown(getHandle(container), 120);

			expect(onClose).not.toHaveBeenCalled();

			fireTransitionEnd(getSheet(container));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('springs back and stays open on a short drag', () => {
			const onClose = jest.fn();
			const { container } = renderAccountMenu(true, { isBottomSheet: true, onClose });

			dragDown(getHandle(container), 40);
			fireTransitionEnd(getSheet(container));

			expect(getSheet(container).style.transform).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('does not start a drag from a row', () => {
			const onClose = jest.fn();
			const { container } = renderAccountMenu(true, { isBottomSheet: true, onClose });

			dragDown(screen.getByRole('button', { name: 'Log out' }), 300);
			fireTransitionEnd(getSheet(container));

			expect(getSheet(container).style.transform).toBe('');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('does not drag on a screen of 600px or wider', () => {
			installBottomSheetEnvironment({ isMobile: false });
			const onClose = jest.fn();
			const { container } = renderAccountMenu(true, { isBottomSheet: true, onClose });

			dragDown(getHandle(container), 300);
			fireTransitionEnd(getSheet(container));

			expect(onClose).not.toHaveBeenCalled();
		});

		it('does not drag when it is not a bottom sheet', () => {
			const onClose = jest.fn();
			const { container } = renderAccountMenu(true, { onClose });

			dragDown(screen.getByText('Profile'), 300);
			fireTransitionEnd(getSheet(container));

			expect(onClose).not.toHaveBeenCalled();
		});
	});
});
