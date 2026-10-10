import { useForm } from '../../hooks/useForm';

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

	const { values, changeHandler, onSubmit, isSubmitting, formError } = useForm({ caption: post.caption || '' }, submitHandler);

	return (
		<form id='edit-post-form' onSubmit={onSubmit} className='add-image-post-form'>
			<img className='edit-post-image' src={post.imageUrl} alt='post' />

			<textarea className='caption-input' name='caption' placeholder='Write a caption...' value={values.caption} onChange={changeHandler} />

			{formError ? <p className='form-error edit-post-error'>{formError}</p> : null}

			<div className='button-row'>
				<Button type='submit' label='Save' disabled={isSubmitting} />

				<Button type='button' label='Cancel' variant='secondary' onClick={onCancelClick} />
			</div>
		</form>
	);
};

export default EditPostForm;
