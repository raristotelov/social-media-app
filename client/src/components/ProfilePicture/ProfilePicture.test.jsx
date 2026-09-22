import '@testing-library/jest-dom';
import { render } from '@testing-library/react';

import ProfilePicture from './ProfilePicture';

describe('ProfilePicture', () => {
	it('renders an img with the given imageUrl', () => {
		const { container } = render(<ProfilePicture imageUrl='https://example.com/avatar.jpg' />);

		const image = container.querySelector('img');
		expect(image).toBeInTheDocument();
		expect(image).toHaveAttribute('src', 'https://example.com/avatar.jpg');
	});

	it('renders the inline svg placeholder instead of an img when imageUrl is missing', () => {
		const { container } = render(<ProfilePicture />);

		expect(container.querySelector('img')).not.toBeInTheDocument();
		expect(container.querySelector('svg')).toBeInTheDocument();
	});

	it('passes through an extra className alongside the base profile-picture class', () => {
		const { container } = render(<ProfilePicture imageUrl='https://example.com/avatar.jpg' className='comment-avatar' />);

		const image = container.querySelector('img');
		expect(image).toHaveClass('profile-picture', 'comment-avatar');
	});

	it('passes through an extra className on the placeholder svg when imageUrl is missing', () => {
		const { container } = render(<ProfilePicture className='comment-avatar' />);

		const placeholder = container.querySelector('svg');
		expect(placeholder).toHaveClass('profile-picture', 'comment-avatar');
	});
});
