import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { APP_NAME } from '../../constants/app';

import SomethingWentWrongView from './SomethingWentWrongView';

describe('SomethingWentWrongView', () => {
	const originalLocation = window.location;
	let mockReload;
	let mockAssign;

	beforeEach(() => {
		mockReload = vi.fn();
		mockAssign = vi.fn();

		delete window.location;
		window.location = { ...originalLocation, reload: mockReload, assign: mockAssign };
	});

	afterEach(() => {
		window.location = originalLocation;
	});

	it('shows the heading "Something went wrong"', () => {
		render(<SomethingWentWrongView />);

		expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
	});

	it('shows the "Try reloading the page." line', () => {
		render(<SomethingWentWrongView />);

		expect(screen.getByText('Try reloading the page.')).toBeInTheDocument();
	});

	it('shows the logo', () => {
		render(<SomethingWentWrongView />);

		expect(screen.getByText(APP_NAME)).toBeInTheDocument();
	});

	it('reloads the current page when Reload is clicked', async () => {
		const user = userEvent.setup();

		render(<SomethingWentWrongView />);

		await user.click(screen.getByRole('button', { name: 'Reload' }));

		expect(mockReload).toHaveBeenCalledTimes(1);
		expect(mockAssign).not.toHaveBeenCalled();
	});

	it('loads / fresh when Go home is clicked', async () => {
		const user = userEvent.setup();

		render(<SomethingWentWrongView />);

		await user.click(screen.getByRole('button', { name: 'Go home' }));

		expect(mockAssign).toHaveBeenCalledTimes(1);
		expect(mockAssign).toHaveBeenCalledWith('/');
		expect(mockReload).not.toHaveBeenCalled();
	});
});
