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
});
