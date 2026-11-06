import { render, screen } from '@testing-library/react';

import UnreadDot from './UnreadDot';

describe('UnreadDot', () => {
	it('is announced as unread notifications', () => {
		render(<UnreadDot />);

		expect(screen.getByRole('img', { name: 'Unread notifications' })).toBeInTheDocument();
	});

	it('has its own class', () => {
		render(<UnreadDot />);

		expect(screen.getByRole('img')).toHaveClass('unread-dot');
	});

	it('adds the class of the placement it is given', () => {
		render(<UnreadDot className='tab-bar-unread-dot' />);

		expect(screen.getByRole('img')).toHaveClass('unread-dot', 'tab-bar-unread-dot');
	});
});
