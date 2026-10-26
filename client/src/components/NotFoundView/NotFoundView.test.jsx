import '@testing-library/jest-dom';
import { useContext } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import NotFoundContext from '../../contexts/NotFoundContext';

import NotFoundProvider from '../NotFoundProvider/NotFoundProvider';
import NotFoundView from './NotFoundView';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useNavigate: () => mockNavigate,
}));

const FlagProbe = () => {
	const { isNotFound } = useContext(NotFoundContext);

	return <p data-testid='flag'>{String(isNotFound)}</p>;
};

const renderNotFoundView = () => {
	const tree = (isViewShown) => (
		<NotFoundProvider>
			<MemoryRouter>
				{isViewShown ? <NotFoundView /> : null}

				<FlagProbe />
			</MemoryRouter>
		</NotFoundProvider>
	);

	const rendered = render(tree(true));

	return { ...rendered, hideView: () => rendered.rerender(tree(false)) };
};

describe('NotFoundView', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows the heading "Page not found"', () => {
		renderNotFoundView();

		expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
	});

	it('shows the broken link line', () => {
		renderNotFoundView();

		expect(screen.getByText('This link may be broken, or the page may have been removed.')).toBeInTheDocument();
	});

	it('shows a Go home button and no Retry button', () => {
		renderNotFoundView();

		expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
	});

	it('navigates to / when Go home is clicked', () => {
		renderNotFoundView();

		userEvent.click(screen.getByRole('button', { name: 'Go home' }));

		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith('/');
	});

	it('marks the page as not found while mounted', () => {
		renderNotFoundView();

		expect(screen.getByTestId('flag')).toHaveTextContent('true');
	});

	it('clears the not found mark when unmounted', () => {
		const { hideView } = renderNotFoundView();

		hideView();

		expect(screen.getByTestId('flag')).toHaveTextContent('false');
	});
});
