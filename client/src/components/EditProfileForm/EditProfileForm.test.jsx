import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { validateEditProfile } from '../../utils/validators';

import EditProfileForm from './EditProfileForm';

vi.mock('../../utils/validators', async (importOriginal) => {
	const actual = await importOriginal();

	return { ...actual, validateEditProfile: vi.fn(actual.validateEditProfile) };
});

const userData = {
	email: 'user@example.com',
	username: 'johndoe',
	bio: 'Just a bio',
};

const renderEditProfileForm = (editProfileData, onCancelClick, data = userData) =>
	render(<EditProfileForm userData={data} editProfileData={editProfileData} onCancelClick={onCancelClick} />);

describe('EditProfileForm', () => {
	let user;

	beforeEach(() => {
		user = userEvent.setup({ applyAccept: false });
	});

	it('prefills email, username and bio from userData', () => {
		renderEditProfileForm(vi.fn(), vi.fn());

		expect(screen.getByPlaceholderText('Email')).toHaveValue(userData.email);
		expect(screen.getByPlaceholderText('Username')).toHaveValue(userData.username);
		expect(screen.getByPlaceholderText('Bio')).toHaveValue(userData.bio);
	});

	it('labels the submit button "Save", not "Submit"', () => {
		renderEditProfileForm(vi.fn(), vi.fn());

		expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
		expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
	});

	it('shows "Email is required" and does not call editProfileData when the email is cleared', async () => {
		const editProfileData = vi.fn();
		renderEditProfileForm(editProfileData, vi.fn());

		await user.clear(screen.getByPlaceholderText('Email'));
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Email is required')).toBeInTheDocument();
		expect(editProfileData).not.toHaveBeenCalled();
	});

	it('shows the app validation error, not the browser one, for an email without an @, and sends nothing', async () => {
		const editProfileData = vi.fn();
		const onCancelClick = vi.fn();
		const { container } = renderEditProfileForm(editProfileData, onCancelClick);

		await user.clear(screen.getByPlaceholderText('Email'));
		await user.type(screen.getByPlaceholderText('Email'), 'not-an-email');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Please provide a valid email address')).toHaveClass('field-error');
		expect(container.querySelector('form')).toHaveAttribute('novalidate');
		expect(editProfileData).not.toHaveBeenCalled();
		expect(onCancelClick).not.toHaveBeenCalled();
	});

	it('shows "Username is required" and does not call editProfileData when the username is cleared', async () => {
		const editProfileData = vi.fn();
		renderEditProfileForm(editProfileData, vi.fn());

		await user.clear(screen.getByPlaceholderText('Username'));
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Username is required')).toBeInTheDocument();
		expect(editProfileData).not.toHaveBeenCalled();
	});

	it('calls onCancelClick and not editProfileData when the untouched form is submitted', async () => {
		const editProfileData = vi.fn();
		const onCancelClick = vi.fn();
		renderEditProfileForm(editProfileData, onCancelClick);

		await user.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
		expect(editProfileData).not.toHaveBeenCalled();
	});

	it('calls editProfileData with only the changed values', async () => {
		const editProfileData = vi.fn();
		renderEditProfileForm(editProfileData, vi.fn());

		await user.clear(screen.getByPlaceholderText('Username'));
		await user.type(screen.getByPlaceholderText('Username'), 'newname');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
		expect(editProfileData).toHaveBeenCalledWith({ username: 'newname' });
	});

	it('renders the bio field as a textarea, not an input', () => {
		renderEditProfileForm(vi.fn(), vi.fn());

		const bioField = screen.getByPlaceholderText('Bio');
		expect(bioField.tagName).toBe('TEXTAREA');
	});

	describe('profile picture', () => {
		const userDataWithPicture = { ...userData, profilePicture: { imageUrl: 'https://example.com/me.jpg' } };

		const buildFile = () => new File(['(image)'], 'new.png', { type: 'image/png' });

		const getFileInput = (container) => container.querySelector('input[type="file"]');

		beforeEach(() => {
			globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
			globalThis.URL.revokeObjectURL = vi.fn();
		});

		it('shows the remove button when the user has a picture', () => {
			renderEditProfileForm(vi.fn(), vi.fn(), userDataWithPicture);

			expect(screen.getByRole('button', { name: 'Remove picture' })).toBeInTheDocument();
		});

		it('sends profilePicture: null and nothing else when the existing picture is removed and Save is clicked', async () => {
			const editProfileData = vi.fn();
			renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
			expect(editProfileData).toHaveBeenCalledWith({ profilePicture: null });
		});

		it('does not call editProfileData or close the form on removal alone, until Save is clicked', async () => {
			const editProfileData = vi.fn();
			const onCancelClick = vi.fn();
			renderEditProfileForm(editProfileData, onCancelClick, userDataWithPicture);

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));

			expect(editProfileData).not.toHaveBeenCalled();
			expect(onCancelClick).not.toHaveBeenCalled();
		});

		it('sends profilePicture: null together with other changed values', async () => {
			const editProfileData = vi.fn();
			renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

			await user.clear(screen.getByPlaceholderText('Bio'));
			await user.type(screen.getByPlaceholderText('Bio'), 'New bio');
			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ bio: 'New bio', profilePicture: null }));
		});

		it('sends the chosen file when a new picture is picked after removing the old one', async () => {
			const editProfileData = vi.fn();
			const file = buildFile();
			const { container } = renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.upload(getFileInput(container), file);
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
			expect(editProfileData).toHaveBeenCalledWith({ profilePicture: file });
		});

		it('sends the chosen file when a replacement is picked without removing first', async () => {
			const editProfileData = vi.fn();
			const file = buildFile();
			const { container } = renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

			await user.upload(getFileInput(container), file);
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ profilePicture: file }));
		});

		it('sends nothing for the picture when a new file is chosen and then removed on a user who had no picture', async () => {
			const editProfileData = vi.fn();
			const onCancelClick = vi.fn();
			const { container } = renderEditProfileForm(editProfileData, onCancelClick);

			await user.upload(getFileInput(container), buildFile());
			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
			expect(editProfileData).not.toHaveBeenCalled();
		});

		it('sends profilePicture: null when a new file is chosen and then removed on a user who had a picture', async () => {
			const editProfileData = vi.fn();
			const { container } = renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

			await user.upload(getFileInput(container), buildFile());
			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ profilePicture: null }));
		});

		it('does not send profilePicture when the picture was never touched', async () => {
			const editProfileData = vi.fn();
			renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

			await user.clear(screen.getByPlaceholderText('Username'));
			await user.type(screen.getByPlaceholderText('Username'), 'newname');
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ username: 'newname' }));
		});

		it('calls onCancelClick and sends nothing when Cancel is clicked after removing the picture', async () => {
			const editProfileData = vi.fn();
			const onCancelClick = vi.fn();
			renderEditProfileForm(editProfileData, onCancelClick, userDataWithPicture);

			await user.click(screen.getByRole('button', { name: 'Remove picture' }));
			await user.click(screen.getByRole('button', { name: 'Cancel' }));

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

		const changeUsername = async () => {
			await user.clear(screen.getByPlaceholderText('Username'));
			await user.type(screen.getByPlaceholderText('Username'), 'newname');
		};

		it('enables Save before anything is sent', () => {
			renderEditProfileForm(vi.fn(), vi.fn());

			expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
		});

		it('disables Save while the request is in flight', async () => {
			const request = buildDeferred();

			renderEditProfileForm(vi.fn().mockReturnValue(request.promise), vi.fn());
			await changeUsername();
			await user.click(screen.getByRole('button', { name: 'Save' }));

			expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
		});

		it('keeps Cancel enabled while the request is in flight', async () => {
			const request = buildDeferred();

			renderEditProfileForm(vi.fn().mockReturnValue(request.promise), vi.fn());
			await changeUsername();
			await user.click(screen.getByRole('button', { name: 'Save' }));

			expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
		});

		it('sends one request when Save is double-clicked', async () => {
			const request = buildDeferred();
			const editProfileData = vi.fn().mockReturnValue(request.promise);

			renderEditProfileForm(editProfileData, vi.fn());
			await changeUsername();
			await user.dblClick(screen.getByRole('button', { name: 'Save' }));

			expect(editProfileData).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
		});

		it('sends one request when the form is submitted twice synchronously before React re-renders, and allows a new submit once it settles', async () => {
			const request = buildDeferred();
			const editProfileData = vi.fn().mockReturnValue(request.promise);

			const { container } = renderEditProfileForm(editProfileData, vi.fn());
			const form = container.querySelector('form');

			await changeUsername();
			act(() => {
				form.requestSubmit();
				form.requestSubmit();
			});

			expect(editProfileData).toHaveBeenCalledTimes(1);

			request.resolve();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

			act(() => {
				form.requestSubmit();
			});

			expect(editProfileData).toHaveBeenCalledTimes(2);

			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
		});

		it('enables Save again after a failed request', async () => {
			renderEditProfileForm(vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }), vi.fn());
			await changeUsername();
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await screen.findByRole('alert');

			expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
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
			globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
			globalThis.URL.revokeObjectURL = vi.fn();
		});

		describe('choosing a file in the browser', () => {
			it('shows the type message under the picture for a file that is not JPEG, PNG or WebP', async () => {
				const { container } = renderEditProfileForm(vi.fn(), vi.fn());

				await user.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));

				expect(within(getPictureWrapper(container)).getByText(TYPE_MESSAGE)).toHaveClass('field-error');
			});

			it('shows the size message under the picture for a file over 10 MB', async () => {
				const { container } = renderEditProfileForm(vi.fn(), vi.fn());

				await user.upload(getFileInput(container), buildOversizedFile());

				expect(within(getPictureWrapper(container)).getByText(SIZE_MESSAGE)).toHaveClass('field-error');
			});

			it('does not use the form message for a rejected file', async () => {
				const { container } = renderEditProfileForm(vi.fn(), vi.fn());

				await user.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));

				expect(container.querySelector('.form-error')).not.toBeInTheDocument();
			});

			it('sends nothing for a rejected file, and closes the form as an untouched submit', async () => {
				const editProfileData = vi.fn();
				const onCancelClick = vi.fn();
				const { container } = renderEditProfileForm(editProfileData, onCancelClick);

				await user.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				await user.click(screen.getByRole('button', { name: 'Save' }));

				await waitFor(() => expect(onCancelClick).toHaveBeenCalledTimes(1));
				expect(editProfileData).not.toHaveBeenCalled();
			});

			it('clears the message when a valid file is chosen', async () => {
				const { container } = renderEditProfileForm(vi.fn(), vi.fn());

				await user.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				await user.upload(getFileInput(container), buildFile());

				expect(screen.queryByText(TYPE_MESSAGE)).not.toBeInTheDocument();
			});

			it('clears the message when the picture is removed', async () => {
				const userDataWithPicture = { ...userData, profilePicture: { imageUrl: 'https://example.com/me.jpg' } };
				const { container } = renderEditProfileForm(vi.fn(), vi.fn(), userDataWithPicture);

				await user.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				await user.click(screen.getByRole('button', { name: 'Remove picture' }));

				expect(screen.queryByText(TYPE_MESSAGE)).not.toBeInTheDocument();
			});

			it('clears the message when the form is submitted with other changes', async () => {
				const editProfileData = vi.fn().mockResolvedValue(undefined);
				const { container } = renderEditProfileForm(editProfileData, vi.fn());

				await user.upload(getFileInput(container), buildFile('notes.txt', 'text/plain'));
				await user.clear(screen.getByPlaceholderText('Username'));
				await user.type(screen.getByPlaceholderText('Username'), 'newname');
				await user.click(screen.getByRole('button', { name: 'Save' }));

				await waitFor(() => expect(editProfileData).toHaveBeenCalledWith({ username: 'newname' }));
				expect(screen.queryByText(TYPE_MESSAGE)).not.toBeInTheDocument();
			});
		});

		describe('rejected by the server', () => {
			const submitNewPictureRejectedWith = async (error) => {
				const editProfileData = vi.fn().mockRejectedValue(error);
				const view = renderEditProfileForm(editProfileData, vi.fn());

				await user.upload(getFileInput(view.container), buildFile());
				await user.click(screen.getByRole('button', { name: 'Save' }));

				await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

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

				await user.upload(getFileInput(container), buildFile('other.png'));

				expect(screen.queryByText(SIZE_MESSAGE)).not.toBeInTheDocument();
			});

			it('clears the picture message when the picture is removed', async () => {
				const userDataWithPicture = { ...userData, profilePicture: { imageUrl: 'https://example.com/me.jpg' } };
				const editProfileData = vi
					.fn()
					.mockRejectedValue({ code: 'IMAGE_TOO_LARGE', fields: { profilePicture: 'IMAGE_TOO_LARGE' }, status: 413 });
				const { container } = renderEditProfileForm(editProfileData, vi.fn(), userDataWithPicture);

				await user.upload(getFileInput(container), buildFile());
				await user.click(screen.getByRole('button', { name: 'Save' }));
				await screen.findByText(SIZE_MESSAGE);

				await user.click(screen.getByRole('button', { name: 'Remove picture' }));

				expect(screen.queryByText(SIZE_MESSAGE)).not.toBeInTheDocument();
			});
		});
	});

	describe('submit failures', () => {
		const submitChangedUsername = async (editProfileData) => {
			const rendered = renderEditProfileForm(editProfileData, vi.fn());

			await user.clear(screen.getByPlaceholderText('Username'));
			await user.type(screen.getByPlaceholderText('Username'), 'newname');
			await user.click(screen.getByRole('button', { name: 'Save' }));

			return rendered;
		};

		it.each([
			['EMAIL_TAKEN', 'email', 'This email is already registered'],
			['EMAIL_INVALID', 'email', 'Please provide a valid email address'],
			['USERNAME_TAKEN', 'username', 'This username is taken'],
			['BIO_TOO_LONG', 'bio', 'Bio must be at most 150 characters'],
		])('shows %s under the %s field', async (code, field, copy) => {
			const editProfileData = vi.fn().mockRejectedValue({ code, fields: { [field]: code }, status: 400 });
			const { container } = await submitChangedUsername(editProfileData);

			const message = await screen.findByText(copy);
			expect(message).toHaveClass('field-error');
			expect(container.querySelector('.form-error')).not.toBeInTheDocument();
		});

		it('shows a field code the form has no input for (PASSWORD_NOT_EDITABLE) as the form message', async () => {
			const editProfileData = vi.fn().mockRejectedValue({
				code: 'PASSWORD_NOT_EDITABLE',
				fields: { password: 'PASSWORD_NOT_EDITABLE' },
				status: 400,
			});
			const { container } = await submitChangedUsername(editProfileData);

			const message = await screen.findByText('Password cannot be changed from the profile form');
			expect(message).toHaveClass('form-error');
			expect(container.querySelector('.field-error')).not.toBeInTheDocument();
		});

		it('renders the form message with an alert role so it is announced', async () => {
			await submitChangedUsername(vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }));

			expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your profile. Try again.");
		});

		it('shows the save-profile fallback copy for INTERNAL_ERROR', async () => {
			await submitChangedUsername(vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }));

			expect(await screen.findByText("Couldn't save your profile. Try again.")).toHaveClass('form-error');
		});

		it('shows the save-profile fallback copy for a network failure', async () => {
			await submitChangedUsername(vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 0 }));

			expect(await screen.findByText("Couldn't save your profile. Try again.")).toBeInTheDocument();
		});

		it('shows no form error for UNAUTHENTICATED', async () => {
			const editProfileData = vi.fn().mockRejectedValue({ code: 'UNAUTHENTICATED', status: 401 });
			const { container } = await submitChangedUsername(editProfileData);

			await waitFor(() => expect(editProfileData).toHaveBeenCalledTimes(1));
			await screen.findByRole('button', { name: 'Save' });
			expect(container.querySelector('.form-error')).not.toBeInTheDocument();
			expect(container.querySelector('.field-error')).not.toBeInTheDocument();
		});

		it('clears the form message when the user edits a field again', async () => {
			await submitChangedUsername(vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', status: 500 }));
			await screen.findByText("Couldn't save your profile. Try again.");

			await user.type(screen.getByPlaceholderText('Username'), 'x');

			expect(screen.queryByText("Couldn't save your profile. Try again.")).not.toBeInTheDocument();
		});
	});

	describe('field error accessibility', () => {
		it('marks neither the email nor the username input invalid before any error', () => {
			renderEditProfileForm(vi.fn(), vi.fn());

			expect(screen.getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'false');
			expect(screen.getByPlaceholderText('Username')).toHaveAttribute('aria-invalid', 'false');
		});

		it('marks only the email input invalid when the email fails validation', async () => {
			renderEditProfileForm(vi.fn(), vi.fn());

			await user.clear(screen.getByPlaceholderText('Email'));
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await screen.findByText('Email is required');
			expect(screen.getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'true');
			expect(screen.getByPlaceholderText('Username')).toHaveAttribute('aria-invalid', 'false');
		});

		it('marks only the username input invalid when the username fails validation', async () => {
			renderEditProfileForm(vi.fn(), vi.fn());

			await user.clear(screen.getByPlaceholderText('Username'));
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await screen.findByText('Username is required');
			expect(screen.getByPlaceholderText('Username')).toHaveAttribute('aria-invalid', 'true');
			expect(screen.getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'false');
		});

		it('marks the username input invalid when the server rejects the username', async () => {
			const editProfileData = vi.fn().mockRejectedValue({ code: 'USERNAME_TAKEN', fields: { username: 'USERNAME_TAKEN' }, status: 400 });
			renderEditProfileForm(editProfileData, vi.fn());

			await user.clear(screen.getByPlaceholderText('Username'));
			await user.type(screen.getByPlaceholderText('Username'), 'newname');
			await user.click(screen.getByRole('button', { name: 'Save' }));

			await screen.findByText('This username is taken');
			expect(screen.getByPlaceholderText('Username')).toHaveAttribute('aria-invalid', 'true');
			expect(screen.getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'false');
		});

		it('clears aria-invalid on a field once the user edits it again', async () => {
			renderEditProfileForm(vi.fn(), vi.fn());

			await user.clear(screen.getByPlaceholderText('Email'));
			await user.click(screen.getByRole('button', { name: 'Save' }));
			await screen.findByText('Email is required');

			await user.type(screen.getByPlaceholderText('Email'), 'a');

			expect(screen.getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'false');
		});
	});

	describe('several messages for one field', () => {
		it('renders every email message, each as a field error', async () => {
			validateEditProfile.mockReturnValue({ fields: { email: ['First email problem', 'Second email problem'] } });
			renderEditProfileForm(vi.fn(), vi.fn());

			await user.click(screen.getByRole('button', { name: 'Save' }));

			expect(await screen.findByText('First email problem')).toHaveClass('field-error');
			expect(screen.getByText('Second email problem')).toHaveClass('field-error');
			expect(screen.getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'true');
		});

		it('renders every username message, each as a field error', async () => {
			validateEditProfile.mockReturnValue({ fields: { username: ['First username problem', 'Second username problem'] } });
			renderEditProfileForm(vi.fn(), vi.fn());

			await user.click(screen.getByRole('button', { name: 'Save' }));

			expect(await screen.findByText('First username problem')).toHaveClass('field-error');
			expect(screen.getByText('Second username problem')).toHaveClass('field-error');
			expect(screen.getByPlaceholderText('Username')).toHaveAttribute('aria-invalid', 'true');
		});

		it('keeps the messages of one field out of the other field', async () => {
			validateEditProfile.mockReturnValue({ fields: { email: ['First email problem', 'Second email problem'] } });
			renderEditProfileForm(vi.fn(), vi.fn());

			await user.click(screen.getByRole('button', { name: 'Save' }));
			await screen.findByText('First email problem');

			const usernameWrapper = screen.getByPlaceholderText('Username').closest('.profile-form-input-wrapper');

			expect(within(usernameWrapper).queryByText(/email problem/)).not.toBeInTheDocument();
		});
	});
});
