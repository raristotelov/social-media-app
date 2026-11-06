import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import ToastContext from './contexts/ToastContext';
import { getCurrentUser } from './services/userService';
import { getPopularPosts, getNextPopularPosts } from './services/userPostService';

import App from './App';

vi.mock('./components/Header/MainHeader', () => ({ default: () => <header>Main header</header> }));
vi.mock('./components/Header/MobileTopBar', () => ({ default: () => <header>Mobile top bar</header> }));
vi.mock('./components/TabBar/TabBar', () => ({ default: () => <nav>Tab bar</nav> }));
vi.mock('./Router', async () => {
	const { Link, Route, Routes, useOutletContext } = await import('react-router');
	const { default: PopularPostsLayout } = await import('./components/PopularPostsLayout/PopularPostsLayout');

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

	return {
		default: function MockRouter() {
			return (
				<Routes>
					<Route path='/popular-posts' element={<PopularPostsLayout />}>
						<Route index element={<Page name='grid' />} />

						<Route path='posts' element={<Page name='posts' />} />
					</Route>
				</Routes>
			);
		},
	};
});
vi.mock('./services/userService');
vi.mock('./services/userPostService');

const SNAPSHOT_TIME = '2026-10-24T10:00:00.000Z';
const FIRST_BATCH_IDS = Array.from({ length: 30 }, (_, index) => `p${index + 1}`);
const SECOND_BATCH_IDS = Array.from({ length: 5 }, (_, index) => `p${index + 31}`);
const ALL_IDS = [...FIRST_BATCH_IDS, ...SECOND_BATCH_IDS].join(',');

const buildPost = (id) => ({ _id: id, likes: [], commentsCount: 0, previewComments: [], userId: { _id: 'author', username: 'author' } });

let user;

describe('App with the popular posts pages', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		user = userEvent.setup();
		window.localStorage.clear();
		window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });

		getCurrentUser.mockResolvedValue(null);
		getPopularPosts.mockResolvedValue({ posts: FIRST_BATCH_IDS.map(buildPost), snapshotTime: SNAPSHOT_TIME, hasMore: true });
		getNextPopularPosts.mockResolvedValue({ posts: SECOND_BATCH_IDS.map(buildPost), snapshotTime: SNAPSHOT_TIME, hasMore: false });
	});

	const renderApp = () =>
		render(
			<ToastContext.Provider value={{ showToast: vi.fn() }}>
				<MemoryRouter initialEntries={['/popular-posts']}>
					<App />
				</MemoryRouter>
			</ToastContext.Provider>,
		);

	it('keeps the posts loaded past the first batch, without a new request, going grid -> posts view -> back', async () => {
		renderApp();

		await waitFor(() => expect(screen.getByTestId('post-ids')).toHaveTextContent(ALL_IDS));

		await user.click(screen.getByRole('link', { name: 'Open last post' }));

		await waitFor(() => expect(screen.getByTestId('page-name')).toHaveTextContent('posts'));
		expect(screen.getByTestId('post-ids')).toHaveTextContent(ALL_IDS);

		await user.click(screen.getByRole('link', { name: 'Back to grid' }));

		await waitFor(() => expect(screen.getByTestId('page-name')).toHaveTextContent('grid'));
		expect(screen.getByTestId('post-ids')).toHaveTextContent(ALL_IDS);
		expect(getPopularPosts).toHaveBeenCalledTimes(1);
		expect(getNextPopularPosts).toHaveBeenCalledTimes(1);
	});
});
