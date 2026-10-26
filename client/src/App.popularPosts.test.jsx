import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ToastContext from './contexts/ToastContext';
import { getPopularPosts, getNextPopularPosts } from './services/userPostService';

import App from './App';

jest.mock('./components/Header/MainHeader', () => () => <header>Main header</header>);
jest.mock('./components/Header/MobileTopBar', () => () => <header>Mobile top bar</header>);
jest.mock('./components/TabBar/TabBar', () => () => <nav>Tab bar</nav>);
jest.mock('./Router', () => {
	const { Link, Route, Routes, useOutletContext } = require('react-router-dom');
	const PopularPostsLayout = require('./components/PopularPostsLayout/PopularPostsLayout').default;

	const Page = ({ name }) => {
		const { posts } = useOutletContext();

		return (
			<div>
				<p data-testid='page-name'>{name}</p>

				<p data-testid='post-ids'>{posts.map((post) => post._id).join(',')}</p>

				<Link to='/popular-posts/posts#p35'>Open last post</Link>

				<Link to='/popular-posts'>Back to grid</Link>
			</div>
		);
	};

	return function MockRouter() {
		return (
			<Routes>
				<Route path='/popular-posts' element={<PopularPostsLayout />}>
					<Route index element={<Page name='grid' />} />

					<Route path='posts' element={<Page name='posts' />} />
				</Route>
			</Routes>
		);
	};
});
jest.mock('./services/userService');
jest.mock('./services/userPostService');

const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';
const FIRST_BATCH_IDS = Array.from({ length: 30 }, (_, index) => `p${index + 1}`);
const SECOND_BATCH_IDS = Array.from({ length: 5 }, (_, index) => `p${index + 31}`);
const ALL_IDS = [...FIRST_BATCH_IDS, ...SECOND_BATCH_IDS].join(',');

const buildPost = (id) => ({ _id: id, likes: [], commentsCount: 0, previewComments: [], userId: { _id: 'author', username: 'author' } });

describe('App with the popular posts pages', () => {
	beforeEach(() => {
		jest.resetAllMocks();
		window.localStorage.clear();
		window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });

		getPopularPosts.mockResolvedValue({ posts: FIRST_BATCH_IDS.map(buildPost), snapshotTime: SNAPSHOT_TIME, hasMore: true });
		getNextPopularPosts.mockResolvedValue({ posts: SECOND_BATCH_IDS.map(buildPost), snapshotTime: SNAPSHOT_TIME, hasMore: false });
	});

	const renderApp = () =>
		render(
			<ToastContext.Provider value={{ showToast: jest.fn() }}>
				<MemoryRouter initialEntries={['/popular-posts']}>
					<App />
				</MemoryRouter>
			</ToastContext.Provider>,
		);

	it('keeps the posts loaded past the first batch, without a new request, going grid -> posts view -> back', async () => {
		renderApp();

		await waitFor(() => expect(screen.getByTestId('post-ids')).toHaveTextContent(ALL_IDS));

		userEvent.click(screen.getByRole('link', { name: 'Open last post' }));

		await waitFor(() => expect(screen.getByTestId('page-name')).toHaveTextContent('posts'));
		expect(screen.getByTestId('post-ids')).toHaveTextContent(ALL_IDS);

		userEvent.click(screen.getByRole('link', { name: 'Back to grid' }));

		await waitFor(() => expect(screen.getByTestId('page-name')).toHaveTextContent('grid'));
		expect(screen.getByTestId('post-ids')).toHaveTextContent(ALL_IDS);
		expect(getPopularPosts).toHaveBeenCalledTimes(1);
		expect(getNextPopularPosts).toHaveBeenCalledTimes(1);
	});
});
