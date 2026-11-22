import { render } from '@testing-library/react';

import { STORY_RING_STATES } from '../../constants/stories';

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

	describe('story ring', () => {
		it('has no ring classes without a ring state', () => {
			const { container } = render(<ProfilePicture imageUrl='https://example.com/avatar.jpg' />);

			const image = container.querySelector('img');
			expect(image).not.toHaveClass('story-ring');
			expect(image).not.toHaveClass('story-ring-unwatched');
		});

		it('has the red ring classes for the unwatched state', () => {
			const { container } = render(<ProfilePicture imageUrl='https://example.com/avatar.jpg' ringState={STORY_RING_STATES.UNWATCHED} />);

			expect(container.querySelector('img')).toHaveClass('profile-picture', 'story-ring', 'story-ring-unwatched');
		});

		it('has the grey ring class only for the watched state', () => {
			const { container } = render(<ProfilePicture imageUrl='https://example.com/avatar.jpg' ringState={STORY_RING_STATES.WATCHED} />);

			const image = container.querySelector('img');
			expect(image).toHaveClass('profile-picture', 'story-ring');
			expect(image).not.toHaveClass('story-ring-unwatched');
		});

		it('rings the placeholder svg too when imageUrl is missing', () => {
			const { container } = render(<ProfilePicture ringState={STORY_RING_STATES.UNWATCHED} />);

			expect(container.querySelector('svg')).toHaveClass('profile-picture', 'story-ring', 'story-ring-unwatched');
		});

		it('keeps an extra className next to the ring classes', () => {
			const { container } = render(
				<ProfilePicture imageUrl='https://example.com/avatar.jpg' className='search-result-avatar' ringState={STORY_RING_STATES.WATCHED} />,
			);

			expect(container.querySelector('img')).toHaveClass('profile-picture', 'story-ring', 'search-result-avatar');
		});

		it('adds no ring for an unknown ring state value other than unwatched or watched', () => {
			const { container } = render(<ProfilePicture imageUrl='https://example.com/avatar.jpg' ringState='' />);

			expect(container.querySelector('img')).not.toHaveClass('story-ring');
		});
	});
});
