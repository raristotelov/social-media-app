import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ProfileHeader from './ProfileHeader';

const buildUserData = (overrides = {}) => ({
	_id: 'user1',
	username: 'johndoe',
	bio: 'Just a bio',
	posts: [{ imageIdentifier: '1' }, { imageIdentifier: '2' }, { imageIdentifier: '3' }],
	followers: [{ _id: 'follower1' }],
	following: [{ _id: 'following1' }, { _id: 'following2' }],
	...overrides,
});

const renderProfileHeader = (props = {}) =>
	render(
		<ProfileHeader
			userData={buildUserData()}
			loggedInUserData={null}
			isLoggedInUserProfile={false}
			onEditProfileClick={vi.fn()}
			onFollowUserClick={vi.fn()}
			onUnfollowUserClick={vi.fn()}
			{...props}
		/>,
	);

describe('ProfileHeader', () => {
	it('renders the username and the post, follower and following counts from userData', () => {
		const { container } = renderProfileHeader();

		expect(screen.getByText('johndoe')).toBeInTheDocument();

		const stats = container.querySelectorAll('.profile-stat');
		expect(stats[0]).toHaveTextContent('3posts');
		expect(stats[1]).toHaveTextContent('1follower');
		expect(stats[2]).toHaveTextContent('2following');
	});

	describe('count labels', () => {
		const buildItems = (count) => Array.from({ length: count }, (_, index) => ({ _id: `item${index}`, imageIdentifier: `item${index}` }));

		const getStatText = (index, userDataOverrides) => {
			const { container } = renderProfileHeader({ userData: buildUserData(userDataOverrides) });

			return container.querySelectorAll('.profile-stat')[index].textContent;
		};

		it.each([
			[0, '0posts'],
			[1, '1post'],
			[2, '2posts'],
		])('labels %i posts as "%s"', (count, expected) => {
			expect(getStatText(0, { posts: buildItems(count) })).toBe(expected);
		});

		it.each([
			[0, '0followers'],
			[1, '1follower'],
			[2, '2followers'],
		])('labels %i followers as "%s"', (count, expected) => {
			expect(getStatText(1, { followers: buildItems(count) })).toBe(expected);
		});

		it.each([
			[0, '0following'],
			[1, '1following'],
			[2, '2following'],
		])('keeps the following label unchanged for %i', (count, expected) => {
			expect(getStatText(2, { following: buildItems(count) })).toBe(expected);
		});
	});

	describe('followers and following counts', () => {
		const buildItems = (count) => Array.from({ length: count }, (_, index) => ({ _id: `item${index}` }));

		it('opens the followers list when the followers count is clicked', async () => {
			const user = userEvent.setup();
			const onFollowersClick = vi.fn();
			renderProfileHeader({ onFollowersClick });

			await user.click(screen.getByRole('button', { name: /^1\s*follower$/ }));

			expect(onFollowersClick).toHaveBeenCalledTimes(1);
		});

		it('opens the following list when the following count is clicked', async () => {
			const user = userEvent.setup();
			const onFollowingClick = vi.fn();
			renderProfileHeader({ onFollowingClick });

			await user.click(screen.getByRole('button', { name: /^2\s*following$/ }));

			expect(onFollowingClick).toHaveBeenCalledTimes(1);
		});

		it('does not call the following handler when the followers count is clicked', async () => {
			const user = userEvent.setup();
			const onFollowingClick = vi.fn();
			renderProfileHeader({ onFollowersClick: vi.fn(), onFollowingClick });

			await user.click(screen.getByRole('button', { name: /^1\s*follower$/ }));

			expect(onFollowingClick).not.toHaveBeenCalled();
		});

		it('renders a zero followers count as plain text, not a button', () => {
			renderProfileHeader({ userData: buildUserData({ followers: [] }), onFollowersClick: vi.fn() });

			expect(screen.queryByRole('button', { name: /^0\s*followers$/ })).not.toBeInTheDocument();
			expect(screen.getByText('followers')).toBeInTheDocument();
		});

		it('renders a zero following count as plain text, not a button', () => {
			renderProfileHeader({ userData: buildUserData({ following: [] }), onFollowingClick: vi.fn() });

			expect(screen.queryByRole('button', { name: /^0\s*following$/ })).not.toBeInTheDocument();
			expect(screen.getByText('following')).toBeInTheDocument();
		});

		it('renders a missing followers list as a zero count that is not clickable', () => {
			renderProfileHeader({ userData: buildUserData({ followers: undefined }), onFollowersClick: vi.fn() });

			expect(screen.queryByRole('button', { name: /^0\s*followers$/ })).not.toBeInTheDocument();
		});

		it('renders the counts as plain text when no handler is given', () => {
			renderProfileHeader({ userData: buildUserData({ followers: buildItems(3), following: buildItems(3) }) });

			expect(screen.queryByRole('button', { name: /^3\s*followers$/ })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: /^3\s*following$/ })).not.toBeInTheDocument();
		});

		it('never makes the posts count a button', () => {
			renderProfileHeader({ onFollowersClick: vi.fn(), onFollowingClick: vi.fn() });

			expect(screen.queryByRole('button', { name: /^3\s*posts$/ })).not.toBeInTheDocument();
		});
	});

	it('renders the bio when present', () => {
		renderProfileHeader({ userData: buildUserData({ bio: 'Just a bio' }) });

		expect(screen.getByText('Just a bio')).toBeInTheDocument();
	});

	it('renders no bio element when the bio is empty', () => {
		const { container } = renderProfileHeader({ userData: buildUserData({ bio: '' }) });

		expect(container.querySelector('.bio')).not.toBeInTheDocument();
	});

	it('marks the header as having no bio when the bio is empty', () => {
		const { container } = renderProfileHeader({ userData: buildUserData({ bio: '' }) });

		expect(container.querySelector('header')).toHaveClass('profile-header-no-bio');
	});

	it('marks the header as having no bio when the bio is missing', () => {
		const { container } = renderProfileHeader({ userData: buildUserData({ bio: undefined }) });

		expect(container.querySelector('header')).toHaveClass('profile-header-no-bio');
	});

	it('does not mark the header as having no bio when there is a bio', () => {
		const { container } = renderProfileHeader({ userData: buildUserData({ bio: 'Just a bio' }) });

		expect(container.querySelector('header')).not.toHaveClass('profile-header-no-bio');
	});

	it('shows "Edit Profile" and calls onEditProfileClick when viewing your own profile', async () => {
		const user = userEvent.setup();
		const onEditProfileClick = vi.fn();
		renderProfileHeader({ isLoggedInUserProfile: true, onEditProfileClick });

		await user.click(screen.getByRole('button', { name: 'Edit Profile' }));

		expect(onEditProfileClick).toHaveBeenCalledTimes(1);
	});

	it('shows "Follow" and calls onFollowUserClick with the profile\'s user id when viewing someone else\'s profile', async () => {
		const user = userEvent.setup();
		const onFollowUserClick = vi.fn();
		renderProfileHeader({
			userData: buildUserData({ _id: 'user1' }),
			isLoggedInUserProfile: false,
			onFollowUserClick,
		});

		await user.click(screen.getByRole('button', { name: 'Follow' }));

		expect(onFollowUserClick).toHaveBeenCalledWith('user1');
	});

	it('shows "Unfollow" and calls onUnfollowUserClick when loggedInUserData.following contains the profile\'s id', async () => {
		const user = userEvent.setup();
		const onUnfollowUserClick = vi.fn();
		renderProfileHeader({
			userData: buildUserData({ _id: 'user1' }),
			loggedInUserData: { following: ['user1'] },
			isLoggedInUserProfile: false,
			onUnfollowUserClick,
		});

		await user.click(screen.getByRole('button', { name: 'Unfollow' }));

		expect(onUnfollowUserClick).toHaveBeenCalledWith('user1');
	});

	it('falls back to the ProfilePicture placeholder when userData has no profilePicture', () => {
		const { container } = renderProfileHeader({ userData: buildUserData({ profilePicture: undefined }) });

		expect(container.querySelector('img')).not.toBeInTheDocument();
		expect(container.querySelector('svg')).toBeInTheDocument();
	});

	describe('story ring', () => {
		const withPicture = { profilePicture: { imageUrl: 'https://example.com/john.jpg' } };

		it('rings the picture red and makes it a button when the user has an unwatched story', () => {
			const { container } = renderProfileHeader({ userData: buildUserData(withPicture), story: { isWatched: false }, onStoryClick: vi.fn() });

			expect(screen.getByRole('button', { name: "View johndoe's story" })).toContainElement(container.querySelector('img'));
			expect(container.querySelector('img')).toHaveClass('story-ring', 'story-ring-unwatched');
		});

		it('rings the picture grey when the story is watched', () => {
			const { container } = renderProfileHeader({ userData: buildUserData(withPicture), story: { isWatched: true }, onStoryClick: vi.fn() });

			expect(container.querySelector('img')).toHaveClass('story-ring');
			expect(container.querySelector('img')).not.toHaveClass('story-ring-unwatched');
			expect(screen.getByRole('button', { name: "View johndoe's story" })).toBeInTheDocument();
		});

		it('rings the placeholder picture too', () => {
			const { container } = renderProfileHeader({ story: { isWatched: false }, onStoryClick: vi.fn() });

			expect(container.querySelector('svg.profile-picture')).toHaveClass('story-ring', 'story-ring-unwatched');
			expect(screen.getByRole('button', { name: "View johndoe's story" })).toBeInTheDocument();
		});

		it('names the button "View your story" on your own profile', () => {
			renderProfileHeader({ isLoggedInUserProfile: true, story: { isWatched: true }, onStoryClick: vi.fn() });

			expect(screen.getByRole('button', { name: 'View your story' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: "View johndoe's story" })).not.toBeInTheDocument();
		});

		it('calls onStoryClick once when the ringed picture is clicked', async () => {
			const user = userEvent.setup();
			const onStoryClick = vi.fn();

			renderProfileHeader({ story: { isWatched: false }, onStoryClick });

			await user.click(screen.getByRole('button', { name: "View johndoe's story" }));

			expect(onStoryClick).toHaveBeenCalledTimes(1);
		});

		it('can be pressed with the keyboard', async () => {
			const user = userEvent.setup();
			const onStoryClick = vi.fn();

			renderProfileHeader({ story: { isWatched: false }, onStoryClick });

			screen.getByRole('button', { name: "View johndoe's story" }).focus();
			await user.keyboard('{Enter}');

			expect(onStoryClick).toHaveBeenCalledTimes(1);
		});

		it.each([[null], [undefined]])('has no ring and no story button when the story is %p', (story) => {
			const { container } = renderProfileHeader({ userData: buildUserData(withPicture), story, onStoryClick: vi.fn() });

			expect(container.querySelector('img')).not.toHaveClass('story-ring');
			expect(screen.queryByRole('button', { name: /story/i })).not.toBeInTheDocument();
		});

		it('keeps the picture inert, not a button, when there is no ring', async () => {
			const user = userEvent.setup();
			const onStoryClick = vi.fn();
			const { container } = renderProfileHeader({ userData: buildUserData(withPicture), story: null, onStoryClick });

			await user.click(container.querySelector('img'));

			expect(container.querySelector('.profile-picture-wrapper button')).not.toBeInTheDocument();
			expect(onStoryClick).not.toHaveBeenCalled();
		});

		it('does not call onStoryClick when other buttons of the header are clicked', async () => {
			const user = userEvent.setup();
			const onStoryClick = vi.fn();

			renderProfileHeader({ story: { isWatched: false }, onStoryClick, onFollowersClick: vi.fn() });

			await user.click(screen.getByRole('button', { name: 'Follow' }));
			await user.click(screen.getByRole('button', { name: /^1\s*follower$/ }));

			expect(onStoryClick).not.toHaveBeenCalled();
		});

		it('does not throw when the ringed picture is clicked and no handler is given', async () => {
			const user = userEvent.setup();

			renderProfileHeader({ story: { isWatched: false } });

			await user.click(screen.getByRole('button', { name: "View johndoe's story" }));

			expect(screen.getByRole('button', { name: "View johndoe's story" })).toBeInTheDocument();
		});
	});
});
