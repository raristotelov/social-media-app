import Button from '../Button/Button';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './ProfileHeader.css';

const ProfileHeader = (props) => {
	const { userData, loggedInUserData, onEditProfileClick, onFollowUserClick, onUnfollowUserClick, isLoggedInUserProfile } = props;

	const totalPostsCount = userData?.posts?.length ? userData.posts.length : 0;
	const followersCount = userData?.followers?.length ? userData.followers.length : 0;
	const followingCount = userData?.following?.length ? userData.following.length : 0;
	const bio = userData.bio ? userData.bio : '';

	const profilePictureUrl = userData?.profilePicture?.imageUrl;

	const isFollowed = loggedInUserData?.following?.includes(userData._id);

	return (
		<header className='profile-header'>
			<div className='profile-picture-wrapper'>
				<ProfilePicture imageUrl={profilePictureUrl} />
			</div>

			<span className='username'>{userData.username}</span>

			<div className='followers-data-wrapper'>
				<span className='profile-stat'>
					<strong>{totalPostsCount}</strong>

					<span>posts</span>
				</span>

				<span className='profile-stat'>
					<strong>{followersCount}</strong>

					<span>followers</span>
				</span>

				<span className='profile-stat'>
					<strong>{followingCount}</strong>

					<span>following</span>
				</span>
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
