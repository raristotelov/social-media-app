import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import useLoginRedirect from './useLoginRedirect';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

const renderRedirectAt = (entry) => {
	const wrapper = ({ children }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;

	return renderHook(() => useLoginRedirect(), { wrapper });
};

describe('useLoginRedirect', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not navigate until the returned function is called', () => {
		renderRedirectAt('/user/user2/posts');

		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it('navigates to /log-in with the current path as state.from', () => {
		const { result } = renderRedirectAt('/user-feed');

		result.current();

		expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user-feed' } });
	});

	it('keeps the hash in state.from so the guest returns to the same post', () => {
		const { result } = renderRedirectAt('/user/user2/posts#post7');

		result.current();

		expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts#post7' } });
	});

	it('keeps the query string in state.from', () => {
		const { result } = renderRedirectAt('/user/user2/posts?ref=share#post7');

		result.current();

		expect(mockNavigate).toHaveBeenCalledWith('/log-in', { state: { from: '/user/user2/posts?ref=share#post7' } });
	});
});
