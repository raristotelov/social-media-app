import { useState } from 'react';

import { useForm } from '../../hooks/useForm';
import { MAX_BIO_LENGTH, UPLOAD_FIELDS } from '../../constants/validation';
import { ERROR_CODES } from '../../constants/errorCodes';
import { ACTION_FALLBACK_MESSAGES, ERROR_MESSAGES } from '../../constants/errorMessages';

import Button from '../Button/Button';
import ImageInput from '../ImageInput/ImageInput';
import AddProfilePictureIcon from '../icons/AddProfilePictureIcon';

import './EditProfileForm.css';

const EditProfileForm = ({ userData, editProfileData, onCancelClick }) => {
	const [profilePicture, setProfilePicture] = useState(null);
	const [isProfilePictureRemoved, setIsProfilePictureRemoved] = useState(false);
	const [invalidPictureError, setInvalidPictureError] = useState('');

	const profilePictureChangeHandler = (picture) => {
		setProfilePicture(picture);
		setIsProfilePictureRemoved(false);
		setInvalidPictureError('');
		clearFieldError(UPLOAD_FIELDS.PROFILE_PICTURE);
	};

	const profilePictureRemoveHandler = () => {
		setProfilePicture(null);
		setIsProfilePictureRemoved(Boolean(userData?.profilePicture));
		setInvalidPictureError('');
		clearFieldError(UPLOAD_FIELDS.PROFILE_PICTURE);
	};

	const editProfileDataHandler = (updatedValues) => {
		setInvalidPictureError('');

		if (!Object.keys(updatedValues).length && !profilePicture && !isProfilePictureRemoved) {
			onCancelClick();

			return;
		}

		let updatedUserValues = { ...updatedValues };

		if (profilePicture) {
			updatedUserValues = { ...updatedValues, profilePicture };
		} else if (isProfilePictureRemoved) {
			updatedUserValues = { ...updatedValues, profilePicture: null };
		}

		return editProfileData(updatedUserValues);
	};

	const validate = (formValues) => {
		const fields = {};

		if (!formValues.email.trim()) {
			fields.email = [ERROR_MESSAGES[ERROR_CODES.EMAIL_REQUIRED]];
		}

		if (!formValues.username.trim()) {
			fields.username = [ERROR_MESSAGES[ERROR_CODES.USERNAME_REQUIRED]];
		}

		return { fields };
	};

	const { values, changeHandler, clearFieldError, onSubmit, isSubmitting, errors, formError } = useForm(
		{
			email: userData.email,
			username: userData.username,
			bio: userData.bio ? userData.bio : '',
		},
		editProfileDataHandler,
		{ validate, fallbackMessage: ACTION_FALLBACK_MESSAGES.SAVE_PROFILE, extraFieldNames: [UPLOAD_FIELDS.PROFILE_PICTURE] },
	);

	const pictureError = invalidPictureError || errors[UPLOAD_FIELDS.PROFILE_PICTURE]?.[0] || '';

	return (
		<form id='edit-user-profile-form' onSubmit={onSubmit} className='edit-user-profile-form'>
			<div className='profile-form-profile-picture-wrapper'>
				<ImageInput
					initialValue={userData?.profilePicture?.imageUrl}
					onChange={profilePictureChangeHandler}
					onRemove={profilePictureRemoveHandler}
					onInvalidFile={setInvalidPictureError}
					PlaceHolderImageProp={AddProfilePictureIcon}
					isRoundImage={true}
					iconWidthProp={60}
					iconHeightProp={60}
					fontSizeProp={13}
				/>

				{pictureError ? <span className='field-error'>{pictureError}</span> : null}
			</div>

			<div className='profile-form-input-wrapper'>
				<input
					type='email'
					id='email'
					name='email'
					placeholder='Email'
					value={values.email}
					onChange={changeHandler}
					className={errors.email?.length ? 'has-error' : ''}
				/>

				{errors.email?.length ? <span className='field-error'>{errors.email[0]}</span> : null}
			</div>

			<div className='profile-form-input-wrapper'>
				<input
					type='text'
					id='username'
					name='username'
					placeholder='Username'
					value={values.username}
					onChange={changeHandler}
					className={errors.username?.length ? 'has-error' : ''}
				/>

				{errors.username?.length ? <span className='field-error'>{errors.username[0]}</span> : null}
			</div>

			<div className='profile-form-input-wrapper'>
				<textarea
					id='bio'
					name='bio'
					placeholder='Bio'
					value={values.bio}
					onChange={changeHandler}
					maxLength={MAX_BIO_LENGTH}
					className={errors.bio?.length ? 'has-error' : ''}
				/>

				{errors.bio?.length ? <span className='field-error'>{errors.bio[0]}</span> : null}
			</div>

			{formError ? (
				<p className='form-error edit-profile-error' role='alert'>
					{formError}
				</p>
			) : null}

			<div className='profile-form-button-row'>
				<Button type='submit' label='Save' disabled={isSubmitting} />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default EditProfileForm;
