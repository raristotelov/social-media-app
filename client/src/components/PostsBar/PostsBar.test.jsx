import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PostsBar from './PostsBar';

describe('PostsBar', () => {
	it('shows the "Posts" heading', () => {
		render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

		expect(screen.getByRole('heading', { name: 'Posts' })).toBeInTheDocument();
	});

	it('shows the username of the profile the posts belong to', () => {
		render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

		expect(screen.getByText('janedoe')).toBeInTheDocument();
	});

	it('calls onBackClick when the back chevron is clicked', () => {
		const onBackClick = jest.fn();

		render(<PostsBar username='janedoe' onBackClick={onBackClick} />);

		userEvent.click(screen.getByRole('button', { name: 'Back' }));

		expect(onBackClick).toHaveBeenCalledTimes(1);
	});

	it('is visible by default', () => {
		const { container } = render(<PostsBar username='janedoe' onBackClick={jest.fn()} />);

		expect(container.querySelector('.posts-bar')).not.toHaveClass('posts-bar-hidden');
	});

	it('is marked hidden when isHidden is set', () => {
		const { container } = render(<PostsBar username='janedoe' isHidden onBackClick={jest.fn()} />);

		expect(container.querySelector('.posts-bar')).toHaveClass('posts-bar-hidden');
	});
});
