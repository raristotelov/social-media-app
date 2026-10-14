import { buildFormData } from './formData';

describe('buildFormData', () => {
	it('returns a FormData instance', () => {
		expect(buildFormData({})).toBeInstanceOf(FormData);
	});

	it('appends each value under its key', () => {
		const formData = buildFormData({ caption: 'Sunset', bio: 'Hello' });

		expect(formData.get('caption')).toBe('Sunset');
		expect(formData.get('bio')).toBe('Hello');
	});

	it('appends a file as a file, keeping its name and type', () => {
		const image = new File(['(image)'], 'photo.png', { type: 'image/png' });

		const formData = buildFormData({ image });
		const appended = formData.get('image');

		expect(appended).toBeInstanceOf(File);
		expect(appended.name).toBe('photo.png');
		expect(appended.type).toBe('image/png');
	});

	it('skips undefined values', () => {
		const formData = buildFormData({ caption: undefined, bio: 'Hello' });

		expect(formData.has('caption')).toBe(false);
		expect(formData.get('bio')).toBe('Hello');
	});

	it('skips null values, so they are not sent as the string "null"', () => {
		const formData = buildFormData({ profilePicture: null, bio: 'Hello' });

		expect(formData.has('profilePicture')).toBe(false);
	});

	it('keeps an empty string, which is a real value such as a cleared bio', () => {
		const formData = buildFormData({ bio: '' });

		expect(formData.has('bio')).toBe(true);
		expect(formData.get('bio')).toBe('');
	});

	it('keeps falsy values that are not null or undefined', () => {
		const formData = buildFormData({ count: 0, flag: false });

		expect(formData.get('count')).toBe('0');
		expect(formData.get('flag')).toBe('false');
	});

	it('returns an empty FormData for no values', () => {
		expect([...buildFormData({}).keys()]).toEqual([]);
	});
});
