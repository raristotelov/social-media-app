import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import { demoLogin } from '../../services/userService';

import DemoStrip from './DemoStrip';

const mockNavigate = jest.fn();
let mockIsMobile = false;

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

jest.mock('../../services/userService');

jest.mock('../../hooks/useMediaQuery', () => () => mockIsMobile);

const GUEST_COPY = 'Explore the app without signing up';
const GUEST_COPY_MOBILE = 'Explore without signing up';
const NOTICE_LEAD = "You're using a demo account.";
const NOTICE_REST = 'It and everything you post will be deleted within 24 hours.';
const NOTICE_LEAD_MOBILE = 'Demo account';
const NOTICE_REST_MOBILE = '· deleted within 24 hours';
const GUEST_DISMISSED_KEY = 'demo-strip-dismissed';
const NOTICE_DISMISSED_KEY = 'demo-notice-dismissed';

const demoVisitor = { _id: 'visitor1', username: 'john_demo_2', accountType: 'demo' };
const regularUser = { _id: 'user1', username: 'johndoe', accountType: 'user' };

const buildUi = ({ jwtToken, loggedInUser, setJwtToken, showToast }) => (
	<LoggedInUserContext.Provider value={{ jwtToken, loggedInUser, setJwtToken }}>
		<ToastContext.Provider value={{ showToast }}>
			<MemoryRouter>
				<DemoStrip />
			</MemoryRouter>
		</ToastContext.Provider>
	</LoggedInUserContext.Provider>
);

const renderStrip = ({ jwtToken = null, loggedInUser, setJwtToken = jest.fn(), showToast = jest.fn() } = {}) => {
	const context = { jwtToken, loggedInUser, setJwtToken, showToast };
	const result = render(buildUi(context));

	return { ...result, context, setJwtToken, showToast };
};

const renderDemoVisitorStrip = (overrides = {}) => renderStrip({ jwtToken: 'demoToken', loggedInUser: demoVisitor, ...overrides });

describe('DemoStrip', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sessionStorage.clear();
		mockIsMobile = false;
	});

	afterEach(() => {
		sessionStorage.clear();
	});

	describe('for a guest', () => {
		it('should show the invitation copy', () => {
			renderStrip();

			expect(screen.getByText(GUEST_COPY)).toBeInTheDocument();
		});

		it('should show the shorter invitation copy on mobile', () => {
			mockIsMobile = true;

			renderStrip();

			expect(screen.getByText(GUEST_COPY_MOBILE)).toBeInTheDocument();
			expect(screen.queryByText(GUEST_COPY)).not.toBeInTheDocument();
		});

		it('should show the Try the demo button', () => {
			renderStrip();

			expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled();
		});

		it('should show the close button', () => {
			renderStrip();

			expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		});

		it('should not show the demo account notice', () => {
			renderStrip();

			expect(screen.queryByText(NOTICE_LEAD)).not.toBeInTheDocument();
		});

		it('should show the strip when a logged-in user object is present but there is no token', () => {
			renderStrip({ jwtToken: null, loggedInUser: demoVisitor });

			expect(screen.getByText(GUEST_COPY)).toBeInTheDocument();
		});

		describe('closing the strip', () => {
			it('should hide the strip when the close button is clicked', () => {
				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Close' }));

				expect(screen.queryByText(GUEST_COPY)).not.toBeInTheDocument();
				expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument();
			});

			it('should remember the dismissal in session storage', () => {
				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Close' }));

				expect(sessionStorage.getItem(GUEST_DISMISSED_KEY)).toBe('true');
			});

			it('should not use local storage, so a new tab shows the strip again', () => {
				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Close' }));

				expect(localStorage.getItem(GUEST_DISMISSED_KEY)).toBeNull();
			});

			it('should stay hidden after a reload in the same tab', () => {
				const first = renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Close' }));
				first.unmount();

				renderStrip();

				expect(screen.queryByText(GUEST_COPY)).not.toBeInTheDocument();
			});

			it('should show the strip in a fresh tab, where session storage is empty', () => {
				sessionStorage.clear();

				renderStrip();

				expect(screen.getByText(GUEST_COPY)).toBeInTheDocument();
			});

			it('should render nothing once dismissed', () => {
				sessionStorage.setItem(GUEST_DISMISSED_KEY, 'true');

				const { container } = renderStrip();

				expect(container).toBeEmptyDOMElement();
			});
		});

		describe('trying the demo', () => {
			it('should request a demo account', async () => {
				demoLogin.mockResolvedValue('demoJwt');

				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

				await waitFor(() => expect(demoLogin).toHaveBeenCalledTimes(1));
			});

			it('should log in with the token the server returns', async () => {
				demoLogin.mockResolvedValue('demoJwt');

				const { setJwtToken } = renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

				await waitFor(() => expect(setJwtToken).toHaveBeenCalledWith('demoJwt'));
			});

			it('should go to the feed, replacing the guest page in the history', async () => {
				demoLogin.mockResolvedValue('demoJwt');

				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

				await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/user-feed', { replace: true }));
			});

			it('should not ask for any form input or credentials', async () => {
				demoLogin.mockResolvedValue('demoJwt');

				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

				await waitFor(() => expect(demoLogin).toHaveBeenCalledWith());
			});

			it('should read Starting... and be disabled while the request runs', async () => {
				let resolveRequest;

				demoLogin.mockReturnValue(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);

				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

				const busyButton = await screen.findByRole('button', { name: 'Starting...' });

				expect(busyButton).toBeDisabled();
				expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument();

				resolveRequest('demoJwt');

				await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
			});

			it('should send only one request when the button is clicked again while it runs', async () => {
				let resolveRequest;

				demoLogin.mockReturnValue(
					new Promise((resolve) => {
						resolveRequest = resolve;
					}),
				);

				renderStrip();

				userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));
				userEvent.click(await screen.findByRole('button', { name: 'Starting...' }));

				expect(demoLogin).toHaveBeenCalledTimes(1);

				resolveRequest('demoJwt');

				await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
			});

			describe('when the request fails', () => {
				it('should show the fallback message in a toast', async () => {
					demoLogin.mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalledWith("Couldn't start the demo. Try again."));
				});

				it('should show the connection limit message when the server answers 429', async () => {
					demoLogin.mockRejectedValue({ status: 429, code: 'TOO_MANY_REQUESTS' });

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalledWith('Too many demo accounts from this connection. Try again later.'));
				});

				it('should show the busy message when the server says the demo is at capacity', async () => {
					demoLogin.mockRejectedValue({ status: 429, code: 'DEMO_UNAVAILABLE' });

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalledWith('The demo is busy right now. Try again later.'));
				});

				it('should enable the button again after the busy message so the guest can try later', async () => {
					demoLogin.mockRejectedValue({ status: 429, code: 'DEMO_UNAVAILABLE' });

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalled());

					expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled();
					expect(mockNavigate).not.toHaveBeenCalled();
				});

				it('should show the fallback message when the request fails without an error code', async () => {
					demoLogin.mockRejectedValue(new Error('Network down'));

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalledWith("Couldn't start the demo. Try again."));
				});

				it('should not log in or navigate', async () => {
					demoLogin.mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });

					const { setJwtToken, showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalled());

					expect(setJwtToken).not.toHaveBeenCalled();
					expect(mockNavigate).not.toHaveBeenCalled();
				});

				it('should enable the button again so the guest can retry', async () => {
					demoLogin.mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalled());

					expect(screen.getByRole('button', { name: 'Try the demo' })).toBeEnabled();
				});

				it('should keep the strip visible', async () => {
					demoLogin.mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });

					const { showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalled());

					expect(screen.getByText(GUEST_COPY)).toBeInTheDocument();
				});

				it('should allow a second attempt that succeeds', async () => {
					demoLogin.mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' }).mockResolvedValueOnce('demoJwt');

					const { setJwtToken, showToast } = renderStrip();

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(showToast).toHaveBeenCalled());

					userEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

					await waitFor(() => expect(setJwtToken).toHaveBeenCalledWith('demoJwt'));
				});
			});
		});
	});

	describe('for a logged-in demo visitor', () => {
		it('should show the demo account notice', () => {
			renderDemoVisitorStrip();

			expect(screen.getByText(NOTICE_LEAD)).toBeInTheDocument();
			expect(screen.getByText(new RegExp(NOTICE_REST.replace('.', '\\.')))).toBeInTheDocument();
		});

		it('should state the 24 hour deletion in a single sentence with the lead in bold', () => {
			renderDemoVisitorStrip();

			expect(screen.getByText(NOTICE_LEAD).tagName).toBe('STRONG');
		});

		it('should show the shorter notice on mobile', () => {
			mockIsMobile = true;

			renderDemoVisitorStrip();

			expect(screen.getByText(NOTICE_LEAD_MOBILE)).toBeInTheDocument();
			expect(screen.getByText(new RegExp(NOTICE_REST_MOBILE))).toBeInTheDocument();
			expect(screen.queryByText(NOTICE_LEAD)).not.toBeInTheDocument();
		});

		it('should not offer the Try the demo button', () => {
			renderDemoVisitorStrip();

			expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument();
		});

		it('should not show the guest invitation', () => {
			renderDemoVisitorStrip();

			expect(screen.queryByText(GUEST_COPY)).not.toBeInTheDocument();
		});

		it('should show the close button', () => {
			renderDemoVisitorStrip();

			expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		});

		it('should hide the notice when the close button is clicked', () => {
			renderDemoVisitorStrip();

			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(screen.queryByText(NOTICE_LEAD)).not.toBeInTheDocument();
		});

		it('should remember the dismissal in session storage', () => {
			renderDemoVisitorStrip();

			userEvent.click(screen.getByRole('button', { name: 'Close' }));

			expect(sessionStorage.getItem(NOTICE_DISMISSED_KEY)).toBe('true');
		});

		it('should stay hidden after a reload in the same tab', () => {
			const first = renderDemoVisitorStrip();

			userEvent.click(screen.getByRole('button', { name: 'Close' }));
			first.unmount();

			renderDemoVisitorStrip();

			expect(screen.queryByText(NOTICE_LEAD)).not.toBeInTheDocument();
		});

		it('should show the notice in a fresh tab, where session storage is empty', () => {
			renderDemoVisitorStrip();

			expect(screen.getByText(NOTICE_LEAD)).toBeInTheDocument();
		});

		it('should not be hidden by the guest strip having been dismissed earlier in the tab', () => {
			sessionStorage.setItem(GUEST_DISMISSED_KEY, 'true');

			renderDemoVisitorStrip();

			expect(screen.getByText(NOTICE_LEAD)).toBeInTheDocument();
		});

		it('should not hide the guest strip for the guest who logs out after dismissing the notice', () => {
			sessionStorage.setItem(NOTICE_DISMISSED_KEY, 'true');

			renderStrip();

			expect(screen.getByText(GUEST_COPY)).toBeInTheDocument();
		});

		it('should show the notice once the profile of the visitor has loaded after the token', () => {
			const { rerender, context } = renderStrip({ jwtToken: 'demoToken', loggedInUser: undefined });

			expect(screen.queryByText(NOTICE_LEAD)).not.toBeInTheDocument();

			rerender(buildUi({ ...context, loggedInUser: demoVisitor }));

			expect(screen.getByText(NOTICE_LEAD)).toBeInTheDocument();
		});
	});

	describe('for a logged-in regular user', () => {
		it('should render nothing', () => {
			const { container } = renderStrip({ jwtToken: 'token123', loggedInUser: regularUser });

			expect(container).toBeEmptyDOMElement();
		});

		it('should render nothing for an account of the persona type', () => {
			const { container } = renderStrip({ jwtToken: 'token123', loggedInUser: { ...regularUser, accountType: 'persona' } });

			expect(container).toBeEmptyDOMElement();
		});

		it('should render nothing while the profile has not loaded yet', () => {
			const { container } = renderStrip({ jwtToken: 'token123', loggedInUser: undefined });

			expect(container).toBeEmptyDOMElement();
		});

		it('should render nothing for a user whose profile has no account type', () => {
			const { container } = renderStrip({ jwtToken: 'token123', loggedInUser: { _id: 'user1', username: 'johndoe' } });

			expect(container).toBeEmptyDOMElement();
		});
	});
});
