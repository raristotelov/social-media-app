import { Link } from 'react-router-dom';

import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

import './SearchResults.css';

const SearchResults = ({ results, isLoading, onResultClick, className = '' }) => {
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
				<p className='search-results-empty'>No users found</p>
			</div>
		);
	}

	return (
		<div className={classNames}>
			{results.map((user) => (
				<Link to={`/user/${user._id}`} key={user._id} className='search-result' onClick={onResultClick}>
					<span className='search-result-avatar' />

					<span className='search-result-text'>
						<span className='search-result-username'>{user.username}</span>

						<span className='search-result-followers'>{`${user.followers?.length || 0} followers`}</span>
					</span>
				</Link>
			))}
		</div>
	);
};

export default SearchResults;
