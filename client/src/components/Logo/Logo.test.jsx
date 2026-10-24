import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { APP_NAME } from '../../constants/app';

import Logo from './Logo';

describe('Logo', () => {
	it('shows the app name from the constant', () => {
		render(<Logo />);

		expect(screen.getByText(APP_NAME)).toBeInTheDocument();
	});

	it('adds a given class name to its own', () => {
		render(<Logo className='extra' />);

		expect(screen.getByText(APP_NAME)).toHaveClass('logo', 'extra');
	});

	it('has only its own class when none is given', () => {
		render(<Logo />);

		expect(screen.getByText(APP_NAME).className).toBe('logo');
	});
});
