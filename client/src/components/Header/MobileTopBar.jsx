import { useContext, useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import useUserSearch from '../../hooks/useUserSearch';

import Logo from '../Logo/Logo';
import AccountMenu from '../AccountMenu/AccountMenu';
import SearchResults from '../SearchResults/SearchResults';
import MenuIcon from '../icons/Menu';
import SearchIcon from '../icons/Search';

import './MobileTopBar.css';

// Which trailing icon each screen gets, taken from the mobile frames: search on
// the feed, Popular and the auth pages, the account menu on your own profile, and
// nothing on someone else's profile.
const getTrailingAction = (pathname, loggedInUser) => {
	if (['/user-feed', '/popular-posts', '/log-in', '/sign-up'].includes(pathname)) {
		return 'search';
	}

	if (loggedInUser && pathname === `/user/${loggedInUser._id}`) {
		return 'menu';
	}

	return 'none';
};

const MobileTopBar = ({ logoutHandler }) => {
	const { loggedInUser } = useContext(LoggedInUserContext);
	const { pathname } = useLocation();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isSearching, setIsSearching] = useState(false);

	const searchFieldRef = useRef(null);

	useEffect(() => {
		if (isSearching) {
			searchFieldRef.current?.focus();
		}
	}, [isSearching]);
	const { searchWord, setSearchWord, results, isLoading, clearSearch } = useUserSearch();

	const trailingAction = getTrailingAction(pathname, loggedInUser);

	const closeSearch = () => {
		setIsSearching(false);
		clearSearch();
	};

	if (isSearching) {
		return (
			<div className='mobile-top-bar mobile-top-bar-searching'>
				<div className='mobile-top-bar-row'>
					<input
						type='text'
						className='mobile-search-field'
						placeholder='Search'
						value={searchWord}
						onChange={(event) => setSearchWord(event.target.value)}
						ref={searchFieldRef}
					/>

					<button type='button' className='mobile-search-cancel' onClick={closeSearch}>
						Cancel
					</button>
				</div>

				{searchWord.trim().length >= 2 ? <SearchResults results={results} isLoading={isLoading} onResultClick={closeSearch} /> : null}
			</div>
		);
	}

	return (
		<div className='mobile-top-bar'>
			<div className='mobile-top-bar-row'>
				<Link to='/' className='mobile-top-bar-logo'>
					<Logo />
				</Link>

				{trailingAction === 'search' ? (
					<button type='button' className='mobile-top-bar-action' aria-label='Search' onClick={() => setIsSearching(true)}>
						<SearchIcon iconColorProp='currentColor' />
					</button>
				) : null}

				{trailingAction === 'menu' ? (
					<button
						type='button'
						className='mobile-top-bar-action'
						aria-label='Account menu'
						aria-expanded={isMenuOpen}
						onClick={() => setIsMenuOpen((state) => !state)}
					>
						<MenuIcon iconColorProp='currentColor' />
					</button>
				) : null}
			</div>

			<AccountMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} logoutHandler={logoutHandler} className='account-menu-sheet' />
		</div>
	);
};

export default MobileTopBar;
