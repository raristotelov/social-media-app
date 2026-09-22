import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditProfileForm from './EditProfileForm';

const userData = {
	email: 'user@example.com',
	username: 'johndoe',
	bio: 'Just a bio',
};

const renderEditProfileForm = (editProfileData, onCancelClick, data = userData) =>
	render(<EditProfileForm userData={data} editProfileData={editProfileData} onCancelClick={onCancelClick} />);

describe('EditProfileForm', () => {
	it('prefills email, username and bio from userData', () => {
		renderEditProfileForm(jest.fn(), jest.fn());

		expect(screen.getByPlaceholderText('Email')).toHaveValue(userData.email);
		expect(screen.getByPlaceholderText('Username')).toHaveValue(userData.username);
		expect(screen.getByPlaceholderText('Bio')).toHaveValue(userData.bio);
	});

	it('shows "Email is required" and does not call editProfileData when the email is cleared', async () => {
		const editProfileData = jest.fn();
		renderEditProfileForm(editProfileData, jest.fn());

		userEvent.clear(screen.getByPlaceholderText('Email'));
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Email is required')).toBeInTheDocument();
		expect(editProfileData).not.toHaveBeenCalled();
	});

	it('shows "Username is required" and does not call editProfileData when the username is cleared', async () => {
		const editProfileData = jest.fn();
		renderEditProfileForm(editProfileData, jest.fn());

		userEvent.clear(screen.getByPlaceholderText('Username'));
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		expect(await screen.findByText('Username is required')).toBeInTheDocument();
		expect(editProfileData).not.toHaveBeenCalled();
	});

	it('calls onCancelClick and not editProfileData when the untouched form is submitted', async () => {
		const editProfileData = jest.fn();
		const onCancelClick = jest.fn();
		renderEditProfileForm(editProfileData, onCancelClick);

		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
		expect(editProfileData).not.toHaveBeenCalled();
	});

	it('calls editProfileData with only the changed values', async () => {
		const editProfileData = jest.fn();
		renderEditProfileForm(editProfileData, jest.fn());

		userEvent.clear(screen.getByPlaceholderText('Username'));
		userEvent.type(screen.getByPlaceholderText('Username'), 'newname');
		userEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
		expect(editProfileData).toHaveBeenCalledWith({ username: 'newname' });
	});

	it('renders the bio field as a textarea, not an input', () => {
		renderEditProfileForm(jest.fn(), jest.fn());

		const bioField = screen.getByPlaceholderText('Bio');
		expect(bioField.tagName).toBe('TEXTAREA');
	});
});
