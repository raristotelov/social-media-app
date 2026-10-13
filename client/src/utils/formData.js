export const buildFormData = (values) => {
	const formData = new FormData();

	Object.entries(values).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			formData.append(key, value);
		}
	});

	return formData;
};
