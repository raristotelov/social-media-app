import { useState } from 'react';

import { useForm } from '../../hooks/useForm';
import { MAX_BIO_LENGTH } from '../../constants/validation';

import Button from '../Button/Button';
import ImageInput from '../ImageInput/ImageInput';
import AddProfilePictureIcon from '../icons/AddProfilePictureIcon';

import './EditProfileForm.css';

const EditProfileForm = ({ userData, editProfileData, onCancelClick }) => {
	const [profilePicture, setProfilePicture] = useState(null);

	const editProfileDataHandler = (updatedValues) => {
		if (!Object.keys(updatedValues).length && !profilePicture) {
			onCancelClick();

			return;
		}

		let updatedUserValues = { ...updatedValues };

		if (profilePicture) {
			updatedUserValues = { ...updatedValues, profilePicture };
		}

		return editProfileData(updatedUserValues);
	};

	const validate = (formValues) => {
		const fields = {};

		if (!formValues.email.trim()) {
			fields.email = ['Email is required'];
		}

		if (!formValues.username.trim()) {
			fields.username = ['Username is required'];
		}

		return { fields };
	};

	const { values, changeHandler, onSubmit, errors } = useForm(
		{
			email: userData.email,
			username: userData.username,
			bio: userData.bio ? userData.bio : '',
		},
		editProfileDataHandler,
		{ validate },
	);

	return (
		<form id='edit-user-profile-form' onSubmit={onSubmit} className='edit-user-profile-form'>
			<div className='profile-form-profile-picture-wrapper'>
				<ImageInput
					initialValue={userData?.profilePicture?.imageUrl}
					onChange={setProfilePicture}
					PlaceHolderImageProp={AddProfilePictureIcon}
					isRoundImage={true}
					iconWidthProp={60}
					iconHeightProp={60}
					fontSizeProp={13}
				/>
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

			<div className='profile-form-button-row'>
				<Button type='submit' label='Submit' />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default EditProfileForm;
