import { useState, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useUserSearch from '../../hooks/useUserSearch';
import { POPULAR_POSTS_PATH, POPULAR_POSTS_VIEW_PATH } from '../../constants/popularPosts';

import Logo from '../Logo/Logo';
import SearchInput from '../SearchInput/SearchInput';
import AccountMenu from '../AccountMenu/AccountMenu';
import ChangePasswordPopup from '../ChangePasswordPopup/ChangePasswordPopup';
import ProfilePicture from '../ProfilePicture/ProfilePicture';
import ArrowDown from '../icons/ArrowDown';
import FlameIcon from '../icons/Flame';
import HouseIcon from '../icons/House';

import './MainHeader.css';

const MainHeader = ({ logoutHandler }) => {
	const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
	const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

	const location = useLocation();
	const currentPath = location.pathname;

	const { loggedInUser } = useContext(LoggedInUserContext);
	const { searchWord, setSearchWord, results, isLoading, clearSearch } = useUserSearch();

	const isPopularActive = currentPath === POPULAR_POSTS_PATH || currentPath === POPULAR_POSTS_VIEW_PATH;

	const popularLink = (
		<Link to={POPULAR_POSTS_PATH} title='Popular' className={`navigation-item-icon ${isPopularActive ? 'navigation-item-active' : ''}`}>
			<FlameIcon iconColorProp='currentColor' />

			<span>Popular</span>
		</Link>
	);

	const loggedUserLinks = (
		<div className='navigation-links'>
			<Link to='/' title='Feed' className={`navigation-item-icon ${currentPath === '/user-feed' ? 'navigation-item-active' : ''}`}>
				<HouseIcon iconColorProp='currentColor' />

				<span>Feed</span>
			</Link>

			{popularLink}
		</div>
	);

	const guestUserLinks = (
		<div className='navigation-links navigation-links-guest'>
			{popularLink}

			<div className='navigation-auth-actions'>
				<Link to='/log-in' className={`navigation-item-text ${currentPath === '/log-in' ? 'navigation-item-active' : ''}`}>
					Log in
				</Link>

				<Link to='/sign-up' className={`navigation-item-text ${currentPath === '/sign-up' ? 'navigation-item-active' : ''}`}>
					Sign up
				</Link>
			</div>
		</div>
	);

	return (
		<div className='header-wrapper'>
			<header className='header'>
				<div className='logo-search-container'>
					<Link to='/' style={{ textDecoration: 'none' }}>
						<Logo />
					</Link>

					<div className='search-component-wrapper'>
						<SearchInput
							searchWord={searchWord}
							onSearchWordChange={setSearchWord}
							results={results}
							isLoading={isLoading}
							onResultClick={clearSearch}
						/>
					</div>
				</div>

				<div className='navbar-logged-user-container'>
					<nav className='navbar'>{loggedInUser ? loggedUserLinks : guestUserLinks}</nav>

					{loggedInUser ? (
						<div className='account-menu-anchor'>
							<button
								type='button'
								className='logged-user-avatar'
								onClick={() => setIsAccountMenuOpen((state) => !state)}
								aria-expanded={isAccountMenuOpen}
								aria-haspopup='menu'
							>
								<ProfilePicture imageUrl={loggedInUser.profilePicture?.imageUrl} />

								<span>{loggedInUser.username}</span>

								<ArrowDown iconColorProp='currentColor' />
							</button>

							<AccountMenu
								isOpen={isAccountMenuOpen}
								onClose={() => setIsAccountMenuOpen(false)}
								logoutHandler={logoutHandler}
								onChangePasswordClick={() => setIsChangePasswordOpen(true)}
							/>
						</div>
					) : null}
				</div>
			</header>

			{isChangePasswordOpen ? <ChangePasswordPopup onClose={() => setIsChangePasswordOpen(false)} /> : null}
		</div>
	);
};

export default MainHeader;
