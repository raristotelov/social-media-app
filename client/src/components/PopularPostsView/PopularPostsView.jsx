import UserProfilePost from '../UserProfilePost/UserProfilePost';

import './PopularPostsView.css';

const PopularPostsView = () => {
	const userPosts = [];

	return (
		<section className='popular-posts-wrapper'>
			{userPosts.map((post) => (
				<UserProfilePost key={post.imageIdentifier} post={post} />
			))}
		</section>
	);
};

export default PopularPostsView;
