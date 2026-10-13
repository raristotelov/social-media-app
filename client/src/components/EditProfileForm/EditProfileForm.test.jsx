import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
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

	describe('while saving', () => {
		const buildDeferred = () => {
			const deferred = {};

			deferred.promise = new Promise((resolve, reject) => {
				deferred.resolve = resolve;
				deferred.reject = reject;
			});

			return deferred;
		};

		const changeUsername = () => {
			userEvent.clear(screen.getByPlaceholderText('Username'));
			userEvent.type(screen.getByPlaceholderText('Username'), 'newname');
		};

		it('enables Submit before anything is sent', () => {
			renderEditProfileForm(jest.fn(), jest.fn());

			expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
		});

		it('disables Submit while the request is in flight', async () => {
			const request = buildDeferred();

			renderEditProfileForm(jest.fn().mockReturnValue(request.promise), jest.fn());
			changeUsername();
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('keeps Cancel enabled while the request is in flight', async () => {
			const request = buildDeferred();

			renderEditProfileForm(jest.fn().mockReturnValue(request.promise), jest.fn());
			changeUsername();
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('sends one request when Submit is double-clicked', async () => {
			const request = buildDeferred();
			const editProfileData = jest.fn().mockReturnValue(request.promise);

			renderEditProfileForm(editProfileData, jest.fn());
			changeUsername();
			userEvent.dblClick(screen.getByRole('button', { name: 'Submit' }));

			expect(editProfileData).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
		});

		it('enables Submit again after a failed request', async () => {
			renderEditProfileForm(jest.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }), jest.fn());
			changeUsername();
			userEvent.click(screen.getByRole('button', { name: 'Submit' }));

			await screen.findByRole('alert');

			expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
		});
	});

	describe('profile picture errors', () => {
		const MAX_BYTES = 10 * 1024 * 1024;
		const TYPE_MESSAGE = 'Choose a JPEG, PNG or WebP image';
		const SIZE_MESSAGE = 'This image is over 10 MB';

		const buildFile = (name = 'new.png', type = 'image/png') => new File(['(image)'], name, { type });

		const buildOversizedFile = () => {
			const file = buildFile('huge.jpg', 'image/jpeg');

			Object.defineProperty(file, 'size', { value: MAX_BYTES + 1 });

			return file;
		};

		const getFileInput = (container) => container.querySelector('input[type="file"]');

		const getPictureWrapper = (container) => container.querySelector('.profile-form-profile-picture-wrapper');

		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => 'blob:preview');
			global.URL.revokeObjectURL = jest.fn();
		});

		describe('choosing a file in the browser', () => {
			it('shows the type message under the picture for a file that is not JPEG, PNG or WebP', () => {
				const { container } = renderEditProfileForm(jest.fn(), jest.fn());

				userEvent.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));

				expect(within(getPictureWrapper(container)).getByText(TYPE_MESSAGE)).toHaveClass('field-error');
			});

			it('shows the size message under the picture for a file over 10 MB', () => {
				const { container } = renderEditProfileForm(jest.fn(), jest.fn());

				userEvent.upload(getFileInput(container), buildOversizedFile());

				expect(within(getPictureWrapper(container)).getByText(SIZE_MESSAGE)).toHaveClass('field-error');
			});

			it('does not use the form message for a rejected file', () => {
				const { container } = renderEditProfileForm(jest.fn(), jest.fn());

				userEvent.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));

				expect(container.querySelector('.form-error')).not.toBeInTheDocument();
			});

			it('sends nothing for a rejected file, and closes the form as an untouched submit', async () => {
				const editProfileData = jest.fn();
				const onCancelClick = jest.fn();
				const { container } = renderEditProfileForm(editProfileData, onCancelClick);

				userEvent.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				userEvent.click(screen.getByRole('button', { name: 'Submit' }));

				await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
				expect(editProfileData).not.toHaveBeenCalled();
			});

			it('clears the message when a valid file is chosen', () => {
				const { container } = renderEditProfileForm(jest.fn(), jest.fn());

				userEvent.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				userEvent.upload(getFileInput(container), buildFile());

				expect(screen.queryByText(TYPE_MESSAGE)).not.toBeInTheDocument();
			});

			it('clears the message when the picture is removed', () => {
				const userDataWithPicture = { ...userData, profilePicture: { imageUrl: 'https://example.com/me.jpg' } };
				const { container } = renderEditProfileForm(jest.fn(), jest.fn(), userDataWithPicture);

				userEvent.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

				expect(screen.queryByText(TYPE_MESSAGE)).not.toBeInTheDocument();
			});

			it('clears the message when the form is submitted with other changes', async () => {
				const editProfileData = jest.fn().mockResolvedValue(undefined);
				const { container } = renderEditProfileForm(editProfileData, jest.fn());

				userEvent.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				userEvent.clear(screen.getByPlaceholderText('Username'));
				userEvent.type(screen.getByPlaceholderText('Username'), 'newname');
				userEvent.click(screen.getByRole('button', { name: 'Submit' }));

				await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ username: 'newname' }));
				expect(screen.queryByText(TYPE_MESSAGE)).not.toBeInTheDocument();
			});
		});

		describe('rejected by the server', () => {
			const submitNewPictureRejectedWith = async (error) => {
				const editProfileData = jest.fn().mockRejectedValue(error);
				const view = renderEditProfileForm(editProfileData, jest.fn());

				userEvent.upload(getFileInput(view.container), buildFile());
				userEvent.click(screen.getByRole('button', { name: 'Submit' }));

				await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());

				return view;
			};

			it('shows IMAGE_TYPE_INVALID under the picture and no form message', async () => {
				const { container } = await submitNewPictureRejectedWith({
					code: 'IMAGE_TYPE_INVALID',
					fields: { profilePicture: 'IMAGE_TYPE_INVALID' },
					status: 400,
				});

				expect(within(getPictureWrapper(container)).getByText(TYPE_MESSAGE)).toHaveClass('field-error');
				expect(container.querySelector('.form-error')).not.toBeInTheDocument();
			});

			it('shows IMAGE_TOO_LARGE under the picture and no form message', async () => {
				const { container } = await submitNewPictureRejectedWith({
					code: 'IMAGE_TOO_LARGE',
					fields: { profilePicture: 'IMAGE_TOO_LARGE' },
					status: 413,
				});

				expect(within(getPictureWrapper(container)).getByText(SIZE_MESSAGE)).toHaveClass('field-error');
				expect(container.querySelector('.form-error')).not.toBeInTheDocument();
			});

			it('shows the save-profile fallback as the form message, not under the picture, for an unexpected error', async () => {
				const { container } = await submitNewPictureRejectedWith({ code: 'INTERNAL_ERROR', status: 500 });

				expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save your profile. Try again.");
				expect(getPictureWrapper(container).querySelector('.field-error')).not.toBeInTheDocument();
			});

			it('clears the picture message when another file is chosen', async () => {
				const { container } = await submitNewPictureRejectedWith({
					code: 'IMAGE_TOO_LARGE',
					fields: { profilePicture: 'IMAGE_TOO_LARGE' },
					status: 413,
				});

				userEvent.upload(getFileInput(container), buildFile('other.png'));

				expect(screen.queryByText(SIZE_MESSAGE)).not.toBeInTheDocument();
			});

			it('clears the picture message when the picture is removed', async () => {
				const userDataWithPicture = { ...userData, profilePicture: { imageUrl: 'https://example.com/me.jpg' } };
				const editProfileData = jest
					.fn()
					.mockRejectedValue({ code: 'IMAGE_TOO_LARGE', fields: { profilePicture: 'IMAGE_TOO_LARGE' }, status: 413 });
				const { container } = renderEditProfileForm(editProfileData, jest.fn(), userDataWithPicture);

				userEvent.upload(getFileInput(container), buildFile());
				userEvent.click(screen.getByRole('button', { name: 'Submit' }));
				await screen.findByText(SIZE_MESSAGE);

				userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));

				expect(screen.queryByText(SIZE_MESSAGE)).not.toBeInTheDocument();
			});
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
