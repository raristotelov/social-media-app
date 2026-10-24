import { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { POPULAR_POSTS_PATH, POPULAR_POSTS_VIEW_PATH } from '../../constants/popularPosts';

import FlameIcon from '../icons/Flame';
import HouseIcon from '../icons/House';
import ProfilePicture from '../ProfilePicture/ProfilePicture';

import './TabBar.css';

const TabBar = () => {
	const { loggedInUser } = useContext(LoggedInUserContext);
	const { pathname } = useLocation();

	const itemClasses = (path, extraClass, additionalActivePaths = []) => {
		const classes = ['tab-bar-item'];

		if (extraClass) {
			classes.push(extraClass);
		}

		if ([path, ...additionalActivePaths].includes(pathname)) {
			classes.push('tab-bar-item-active');
		}

		return classes.join(' ');
	};

	if (loggedInUser) {
		const profilePath = `/user/${loggedInUser._id}`;

		return (
			<nav className='tab-bar'>
				<Link to='/user-feed' className={itemClasses('/user-feed')}>
					<HouseIcon iconColorProp='currentColor' />

					<span className='tab-bar-label'>Feed</span>
				</Link>

				<Link to={POPULAR_POSTS_PATH} className={itemClasses(POPULAR_POSTS_PATH, undefined, [POPULAR_POSTS_VIEW_PATH])}>
					<FlameIcon iconColorProp='currentColor' />

					<span className='tab-bar-label'>Popular</span>
				</Link>

				<Link to={profilePath} className={itemClasses(profilePath)}>
					<ProfilePicture className='tab-bar-avatar' imageUrl={loggedInUser.profilePicture?.imageUrl} />

					<span className='tab-bar-label'>Profile</span>
				</Link>
			</nav>
		);
	}

	return (
		<nav className='tab-bar'>
			<Link to={POPULAR_POSTS_PATH} className={itemClasses(POPULAR_POSTS_PATH, undefined, [POPULAR_POSTS_VIEW_PATH])}>
				<FlameIcon iconColorProp='currentColor' />

				<span className='tab-bar-label'>Popular</span>
			</Link>

			<Link to='/log-in' className={itemClasses('/log-in', 'tab-bar-item-text')}>
				Log in
			</Link>

			<Link to='/sign-up' className={itemClasses('/sign-up', 'tab-bar-item-text')}>
				Sign up
			</Link>
		</nav>
	);
};

export default TabBar;
