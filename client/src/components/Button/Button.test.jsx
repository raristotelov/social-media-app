import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Button from './Button';

describe('Button', () => {
	it('shows its label', () => {
		render(<Button label='Follow' />);

		expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
	});

	it('is primary by default: no secondary class', () => {
		render(<Button label='Follow' />);

		expect(screen.getByRole('button')).toHaveClass('button-classname');
		expect(screen.getByRole('button')).not.toHaveClass('button-secondary');
	});

	it('adds the secondary class for the secondary variant', () => {
		render(<Button label='Unfollow' variant='secondary' />);

		expect(screen.getByRole('button')).toHaveClass('button-classname', 'button-secondary');
	});

	it('merges a given class name with the button classes', () => {
		render(<Button label='Follow' className='custom' />);

		expect(screen.getByRole('button')).toHaveClass('button-classname', 'custom');
	});

	it('keeps the custom class on a secondary button', () => {
		render(<Button label='Unfollow' variant='secondary' className='custom' />);

		expect(screen.getByRole('button')).toHaveClass('button-classname', 'button-secondary', 'custom');
	});

	it('passes other props on to the button', () => {
		const onClick = jest.fn();

		render(<Button label='Follow' type='button' aria-label='Follow alice' onClick={onClick} />);

		userEvent.click(screen.getByRole('button', { name: 'Follow alice' }));

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
	});
});
