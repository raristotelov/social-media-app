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

	describe('profile picture', () => {
		const userDataWithPicture = { ...userData, profilePicture: { imageUrl: 'https://example.com/me.jpg' } };

		const buildFile = () => new File(['(image)'], 'new.png', { type: 'image/png' });

		const getFileInput = (container) => container.querySelector('input[type="file"]');

		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => 'blob:preview');
			global.URL.revokeObjectURL = jest.fn();
		});

		it('shows the remove button when the user has a picture', () => {
			renderEditProfileForm(jest.fn(), jest.fn(), userDataWithPicture);

			expect(screen.getByRole('button', { name: 'Remove picture' })).toBeInTheDocument();
		});

		it('sends profilePicture: null and nothing else when the existing picture is removed and Submit is clicked', async () => {
			const editProfileData = jest.fn();
			renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
			expect(editProfileData).toHaveBeenCalledWith({ profilePicture: null });
		});

		it('does not call editProfileData or close the form on removal alone, until Submit is clicked', () => {
			const editProfileData = jest.fn();
			const onCancelClick = jest.fn();
			renderEditProfileForm(editProfileData, onCancelClick, userDataWithPicture);

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(editProfileData).not.toHaveBeenCalled();
			expect(onCancelClick).not.toHaveBeenCalled();
		});

		it('sends profilePicture: null together with other changed values', async () => {
			const editProfileData = jest.fn();
			renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

			userEvent.clear(screen.getByPlaceholderText('Bio'));
			userEvent.type(screen.getByPlaceholderText('Bio'), 'New bio');
			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ bio: 'New bio', profilePicture: null }));
		});

		it('sends the chosen file when a new picture is picked after removing the old one', async () => {
			const editProfileData = jest.fn();
			const file = buildFile();
			const { container } = renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.upload(getFileInput(container), file);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
			expect(editProfileData).toHaveBeenCalledWith({ profilePicture: file });
		});

		it('sends the chosen file when a replacement is picked without removing first', async () => {
			const editProfileData = jest.fn();
			const file = buildFile();
			const { container } = renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

			userEvent.upload(getFileInput(container), file);
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ profilePicture: file }));
		});

		it('sends nothing for the picture when a new file is chosen and then removed on a user who had no picture', async () => {
			const editProfileData = jest.fn();
			const onCancelClick = jest.fn();
			const { container } = renderEditProfileForm(editProfileData, onCancelClick);

			userEvent.upload(getFileInput(container), buildFile());
			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
			expect(editProfileData).not.toHaveBeenCalled();
		});

		it('sends profilePicture: null when a new file is chosen and then removed on a user who had a picture', async () => {
			const editProfileData = jest.fn();
			const { container } = renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

			userEvent.upload(getFileInput(container), buildFile());
			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ profilePicture: null }));
		});

		it('does not send profilePicture when the picture was never touched', async () => {
			const editProfileData = jest.fn();
			renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

			userEvent.clear(screen.getByPlaceholderText('Username'));
			userEvent.type(screen.getByPlaceholderText('Username'), 'newname');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ username: 'newname' }));
		});

		it('calls onCancelClick and sends nothing when Cancel is clicked after removing the picture', () => {
			const editProfileData = jest.fn();
			const onCancelClick = jest.fn();
			renderEditProfileForm(editProfileData, onCancelClick, userDataWithPicture);

			userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
			userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			expect(onCancelClick).toHaveBeenCalledTimes(1);
			expect(editProfileData).not.toHaveBeenCalled();
		});
	});

	describe('submit failures', () => {
		const submitChangedUsername = (editProfileData) => {
			const rendered = renderEditProfileForm(editProfileData, jest.fn());

			userEvent.clear(screen.getByPlaceholderText('Username'));
			userEvent.type(screen.getByPlaceholderText('Username'), 'newname');
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			return rendered;
		};

		it.each([
			['EMAIL_TAKEN', 'email', 'This email is already registered'],
			['EMAIL_INVALID', 'email', 'Please provide a valid email address'],
			['USERNAME_TAKEN', 'username', 'This username is taken'],
			['BIO_TOO_LONG', 'bio', 'Bio must be at most 150 characters'],
		])('shows %s under the %s field', async (code, field, copy) => {
			const editProfileData = jest.fn().mockRejectedValue({ code, fields: { [field]: code }, status: 400 });
			const { container } = submitChangedUsername(editProfileData);

			const message = await screen.findByText(copy);
			expect(message).toHaveClass('field-error');
			expect(container.querySelector('.form-error')).not.toBeInTheDocument();
		});

		it('shows a field code the form has no input for (PASSWORD_NOT_EDITABLE) as the form message', async () => {
			const editProfileData = jest.fn().mockRejectedValue({
				code: 'PASSWORD_NOT_EDITABLE',
				fields: { password: 'PASSWORD_NOT_EDITABLE' },
				status: 400,
			});
			const { container } = submitChangedUsername(editProfileData);

			const message = await screen.findByText('Password cannot be changed from the profile form');
			expect(message).toHaveClass('form-error');
			expect(container.querySelector('.field-error')).not.toBeInTheDocument();
		});

		it('renders the form message with an alert role so it is announced', async () => {
			submitChangedUsername(jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your profile. Try again.");
		});

		it('shows the save-profile fallback copy for INTERNAL_ERROR', async () => {
			submitChangedUsername(jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }));

			expect(await screen.findByText("Couldn't save your profile. Try again.")).toHaveClass('form-error');
		});

		it('shows the save-profile fallback copy for a network failure', async () => {
			submitChangedUsername(jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 0 }));

			expect(await screen.findByText("Couldn't save your profile. Try again.")).toBeInTheDocument();
		});

		it('shows no form error for UNAUTHENTICATED', async () => {
			const editProfileData = jest.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { container } = submitChangedUsername(editProfileData);

			await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
			await screen.findByRole('button', { name: 'Submit' });
			expect(container.querySelector('.form-error')).not.toBeInTheDocument();
			expect(container.querySelector('.field-error')).not.toBeInTheDocument();
		});

		it('clears the form message when the user edits a field again', async () => {
			submitChangedUsername(jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }));
			await screen.findByText("Couldn't save your profile. Try again.");

			userEvent.type(screen.getByPlaceholderText('Username'), 'x');

			expect(screen.queryByText("Couldn't save your profile. Try again.")).not.toBeInTheDocument();
		});
	});
});
