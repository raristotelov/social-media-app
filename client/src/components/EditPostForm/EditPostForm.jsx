import { useForm } from '../../hooks/useForm';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';

import Button from '../Button/Button';

import './EditPostForm.css';

const EditPostForm = ({ post, editPostHandler, onCancelClick }) => {
	const submitHandler = (updatedValues) => {
		if (!Object.keys(updatedValues).length) {
			onCancelClick();

			return;
		}

		return editPostHandler(updatedValues.caption);
	};

	const { values, changeHandler, onSubmit, isSubmitting, errors, formError } = useForm({ caption: post.caption || '' }, submitHandler, {
		fallbackMessage: ACTION_FALLBACK_MESSAGES.EDIT_CAPTION,
	});

	return (
		<form id='edit-post-form' onSubmit={onSubmit} className='add-image-post-form'>
			<img className='edit-post-image' src={post.imageUrl} alt='post' />

			<textarea
				className={errors.caption?.length ? 'caption-input has-error' : 'caption-input'}
				name='caption'
				placeholder='Write a caption...'
				value={values.caption}
				onChange={changeHandler}
				aria-invalid={Boolean(errors.caption?.length)}
			/>

			{errors.caption?.length ? <span className='field-error caption-error'>{errors.caption[0]}</span> : null}

			{formError ? (
				<p className='form-error edit-post-error' role='alert'>
					{formError}
				</p>
			) : null}

			<div className='button-row'>
				<Button type='submit' label='Save' disabled={isSubmitting} />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default EditPostForm;
