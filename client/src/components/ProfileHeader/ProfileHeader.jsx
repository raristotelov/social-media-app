import Button from '../Button/Button';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './ProfileHeader.css';

const ProfileStat = ({ count, label, onClick }) => {
	const content = (
		<>
			<strong>{count}</strong>

			<span>{label}</span>
		</>
	);

	if (!onClick || count === 0) {
		return <span className='profile-stat'>{content}</span>;
	}

	return (
		<button type='button' className='profile-stat profile-stat-button' onClick={onClick}>
			{content}
		</button>
	);
};

const ProfileHeader = (props) => {
	const {
		userData,
		loggedInUserData,
		onEditProfileClick,
		onFollowUserClick,
		onUnfollowUserClick,
		onFollowersClick,
		onFollowingClick,
		isLoggedInUserProfile,
	} = props;

	const totalPostsCount = userData?.posts?.length ? userData.posts.length : 0;
	const followersCount = userData?.followers?.length ? userData.followers.length : 0;
	const followingCount = userData?.following?.length ? userData.following.length : 0;
	const bio = userData.bio ? userData.bio : '';

	const profilePictureUrl = userData?.profilePicture?.imageUrl;

	const isFollowed = loggedInUserData?.following?.includes(userData._id);

	return (
		<header className={bio ? 'profile-header' : 'profile-header profile-header-no-bio'}>
			<div className='profile-picture-wrapper'>
				<ProfilePicture imageUrl={profilePictureUrl} />
			</div>

			<span className='username'>{userData.username}</span>

			<div className='followers-data-wrapper'>
				<ProfileStat count={totalPostsCount} label={totalPostsCount === 1 ? 'post' : 'posts'} />

				<ProfileStat count={followersCount} label={followersCount === 1 ? 'follower' : 'followers'} onClick={onFollowersClick} />

				<ProfileStat count={followingCount} label='following' onClick={onFollowingClick} />
			</div>

			{bio ? <p className='bio'>{bio}</p> : null}

			<div className='profile-action'>
				{isLoggedInUserProfile ? (
					<Button onClick={onEditProfileClick} label='Edit Profile' variant='secondary' />
				) : (
					<Button
						onClick={() => {
							if (isFollowed) {
								onUnfollowUserClick(userData._id);
							} else {
								onFollowUserClick(userData._id);
							}
						}}
						label={isFollowed ? 'Unfollow' : 'Follow'}
						variant={isFollowed ? 'secondary' : 'primary'}
					/>
				)}
			</div>
		</header>
	);
};

export default ProfileHeader;
