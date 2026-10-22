import { Link } from 'react-router-dom';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './SearchResults.css';

const SearchResults = ({ results, isLoading, onResultClick, className = '', showFollowersCount = true, emptyMessage = 'No users found' }) => {
	const classNames = `search-results ${className}`.trim();

	if (isLoading) {
		return (
			<div className={classNames}>
				<LoadingSpinner />
			</div>
		);
	}

	if (!results.length) {
		return (
			<div className={classNames}>
				<p className='search-results-empty'>{emptyMessage}</p>
			</div>
		);
	}

	return (
		<div className={classNames}>
			{results.map((user) => {
				const followersCount = user.followersCount || 0;

				return (
					<Link to={`/user/${user._id}`} key={user._id} className='search-result' onClick={onResultClick}>
						<ProfilePicture imageUrl={user.profilePicture?.imageUrl} className='search-result-avatar' />

						<span className='search-result-text'>
							<span className='search-result-username'>{user.username}</span>

							{showFollowersCount ? (
								<span className='search-result-followers'>{`${followersCount} ${followersCount === 1 ? 'follower' : 'followers'}`}</span>
							) : null}
						</span>
					</Link>
				);
			})}
		</div>
	);
};

export default SearchResults;
