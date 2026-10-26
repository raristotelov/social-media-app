import '@testing-library/jest-dom';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';

import ToastContext from '../../contexts/ToastContext';
import { TOAST_TYPES } from '../../constants/toast';

import ToastProvider from './ToastProvider';

const ToastTrigger = ({ message }) => {
	const { showToast, dismissToast } = useContext(ToastContext);

	return (
		<>
			<button type='button' onClick={() => showToast(message)}>
				Show {message}
			</button>

			<button type='button' onClick={dismissToast}>
				Dismiss from context
			</button>
		</>
	);
};

const SuccessToastTrigger = () => {
	const { showToast } = useContext(ToastContext);

	return (
		<button type='button' onClick={() => showToast('Password changed', TOAST_TYPES.SUCCESS)}>
			Show success
		</button>
	);
};

const renderProvider = (messages = ['First failure']) =>
	render(
		<ToastProvider>
			{messages.map((message) => (
				<ToastTrigger key={message} message={message} />
			))}
		</ToastProvider>,
	);

describe('ToastProvider', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('renders its children', () => {
		renderProvider();

		expect(screen.getByRole('button', { name: 'Show First failure' })).toBeInTheDocument();
	});

	it('exposes an alert region that is empty until a toast is shown', () => {
		renderProvider();

		expect(screen.getByRole('alert')).toBeEmptyDOMElement();
	});

	it('announces assertively and atomically, so screen readers read the whole message', () => {
		renderProvider();

		const region = screen.getByRole('alert');

		expect(region).toHaveAttribute('aria-live', 'assertive');
		expect(region).toHaveAttribute('aria-atomic', 'true');
	});

	it('shows the message inside the alert region when showToast is called', () => {
		renderProvider();

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));

		expect(within(screen.getByRole('alert')).getByText('First failure')).toBeInTheDocument();
	});

	it('shows the error look by default, when showToast is called without a type', () => {
		renderProvider();

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));

		expect(screen.getByRole('alert').querySelector('.toast-icon')).not.toHaveClass('toast-icon-success');
	});

	it('passes the type through, so a success toast gets the success look', () => {
		render(
			<ToastProvider>
				<SuccessToastTrigger />
			</ToastProvider>,
		);

		userEvent.click(screen.getByRole('button', { name: 'Show success' }));

		expect(within(screen.getByRole('alert')).getByText('Password changed')).toBeInTheDocument();
		expect(screen.getByRole('alert').querySelector('.toast-icon')).toHaveClass('toast-icon-success');
	});

	it('replaces the showing toast with a new one instead of stacking them', () => {
		renderProvider(['First failure', 'Second failure']);

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));
		userEvent.click(screen.getByRole('button', { name: 'Show Second failure' }));

		expect(screen.queryByText('First failure')).not.toBeInTheDocument();
		expect(screen.getByText('Second failure')).toBeInTheDocument();
		expect(within(screen.getByRole('alert')).getAllByRole('button', { name: 'Close' })).toHaveLength(1);
	});

	it('restarts the 5 second timer when the same message is shown again', () => {
		renderProvider();

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));
		act(() => {
			jest.advanceTimersByTime(4000);
		});
		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));
		act(() => {
			jest.advanceTimersByTime(4000);
		});

		expect(screen.getByText('First failure')).toBeInTheDocument();

		act(() => {
			jest.advanceTimersByTime(1000);
		});

		expect(screen.queryByText('First failure')).not.toBeInTheDocument();
	});

	it('removes the toast when its close button is clicked', () => {
		renderProvider();

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));
		userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Close' }));

		expect(screen.queryByText('First failure')).not.toBeInTheDocument();
	});

	it('removes the toast automatically after 5 seconds', () => {
		renderProvider();

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));
		act(() => {
			jest.advanceTimersByTime(4999);
		});

		expect(screen.getByText('First failure')).toBeInTheDocument();

		act(() => {
			jest.advanceTimersByTime(1);
		});

		expect(screen.queryByText('First failure')).not.toBeInTheDocument();
	});

	it('removes the toast when dismissToast is called from the context', () => {
		renderProvider();

		userEvent.click(screen.getByRole('button', { name: 'Show First failure' }));
		userEvent.click(screen.getByRole('button', { name: 'Dismiss from context' }));

		expect(screen.queryByText('First failure')).not.toBeInTheDocument();
	});
});
