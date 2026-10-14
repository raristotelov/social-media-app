import { useRef, useState } from 'react';

import { getFormErrors, isUnauthenticatedError } from '../utils/errors';

export const useForm = (initialValues, onSubmitHandler, { submitAllValues = false, validate, fallbackMessage, extraFieldNames = [] } = {}) => {
	const [values, setValues] = useState(initialValues);
	const [errors, setErrors] = useState({});
	const [formError, setFormError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSubmittingRef = useRef(false);

	const clearFieldError = (name) => {
		setErrors((state) => (state[name]?.length ? { ...state, [name]: [] } : state));
		setFormError((state) => (state ? '' : state));
	};

	const changeHandler = (e) => {
		const { name, value } = e.target;

		setValues((state) => ({ ...state, [name]: value }));
		clearFieldError(name);
	};

	const getSubmittedValues = () => {
		if (submitAllValues) {
			return values;
		}

		const updatedValues = {};
		const keys = Object.keys(initialValues);

		for (let i = 0; i < keys.length; i += 1) {
			const key = keys[i];

			if (values[key] !== initialValues[key]) {
				updatedValues[key] = values[key];
			}
		}

		return updatedValues;
	};

	const onSubmit = async (e) => {
		e.preventDefault();

		if (isSubmittingRef.current) {
			return;
		}

		setFormError('');

		if (validate) {
			const { fields = {}, formError: validationFormError = '' } = validate(values);

			setErrors(fields);
			setFormError(validationFormError);

			if (Object.keys(fields).length || validationFormError) {
				return;
			}
		}

		isSubmittingRef.current = true;
		setIsSubmitting(true);

		try {
			await onSubmitHandler(getSubmittedValues());
		} catch (requestError) {
			if (isUnauthenticatedError(requestError)) {
				return;
			}

			const { fieldErrors, formError: submitFormError } = getFormErrors(
				requestError,
				[...Object.keys(initialValues), ...extraFieldNames],
				fallbackMessage,
			);

			setErrors(fieldErrors);
			setFormError(submitFormError);
		} finally {
			isSubmittingRef.current = false;
			setIsSubmitting(false);
		}
	};

	return {
		values,
		changeHandler,
		clearFieldError,
		onSubmit,
		isSubmitting,
		errors,
		formError,
	};
};
