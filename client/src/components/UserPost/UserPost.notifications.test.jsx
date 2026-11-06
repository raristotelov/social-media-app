import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { getComments } from '../../services/commentService';

import ToastProvider from '../ToastProvider/ToastProvider';

import UserPost from './UserPost';

vi.mock('../../services/userPostService');
vi.mock('../../services/commentService');

const loggedInUser = { _id: 'user1', username: 'johndoe' };
const author = { _id: 'user2', username: 'janedoe' };

const post = {
	_id: 'post1',
	imageUrl: 'https://example.com/1.jpg',
	imageWidth: 1080,
	imageHeight: 1350,
	caption: 'Sunset at the beach',
	likes: [],
	commentsCount: 0,
	previewComments: [],
};

const buildTree = (commentsOpenRequest) => (
	<LoggedInUserContext.Provider value={{ loggedInUser, endSession: vi.fn() }}>
		<ToastProvider>
			<MemoryRouter>
				<UserPost userPostData={post} author={author} commentsOpenRequest={commentsOpenRequest} onPostChange={vi.fn()} />
			</MemoryRouter>
		</ToastProvider>
	</LoggedInUserContext.Provider>
);

describe('UserPost commentsOpenRequest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getComments.mockResolvedValue([]);
	});

	it('keeps the comments closed when there is no request', () => {
		render(buildTree(null));

		expect(screen.queryByRole('heading', { name: 'Comments' })).not.toBeInTheDocument();
	});

	it('opens the comments when it mounts with a request', async () => {
		render(buildTree({ postId: 'post1', shouldOpenComments: true }));

		expect(await screen.findByRole('heading', { name: 'Comments' })).toBeInTheDocument();
	});

	it('opens the comments when a request arrives after it has mounted', async () => {
		const { rerender } = render(buildTree(null));

		rerender(buildTree({ postId: 'post1', shouldOpenComments: true }));

		expect(await screen.findByRole('heading', { name: 'Comments' })).toBeInTheDocument();
	});

	it('loads the comments of its own post', async () => {
		render(buildTree({ postId: 'post1', shouldOpenComments: true }));

		await screen.findByRole('heading', { name: 'Comments' });

		expect(getComments).toHaveBeenCalledWith(expect.objectContaining({ userPostId: 'post1' }));
	});
});
