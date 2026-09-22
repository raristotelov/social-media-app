import { useContext, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import { updateUserProfileData } from '../../services/userService';

import './AccountMenu.css';

const AccountMenu = ({ isOpen, onClose, logoutHandler, className = '' }) => {
	const { loggedInUser, jwtToken, updateLoggedInUser } = useContext(LoggedInUserContext);
	const menuRef = useRef(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const closeOnOutsideClick = (event) => {
			if (menuRef.current && !menuRef.current.contains(event.target)) {
				onClose();
			}
		};

		const closeOnEscape = (event) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		document.addEventListener('mousedown', closeOnOutsideClick);
		document.addEventListener('keydown', closeOnEscape);

		return () => {
			document.removeEventListener('mousedown', closeOnOutsideClick);
			document.removeEventListener('keydown', closeOnEscape);
		};
	}, [isOpen, onClose]);

	if (!isOpen) {
		return null;
	}

	const isDark = loggedInUser?.theme === 'dark';

	const toggleTheme = async () => {
		const updatedUser = await updateUserProfileData({
			userId: loggedInUser._id,
			jwtToken,
			updatedProfileData: { theme: isDark ? 'light' : 'dark' },
		});

		updateLoggedInUser(updatedUser);
	};

	return (
		<div className={`account-menu ${className}`.trim()} ref={menuRef}>
			<Link to={`/user/${loggedInUser._id}`} className='account-menu-row' onClick={onClose}>
				<span>Profile</span>
			</Link>

			<button type='button' className='account-menu-row' onClick={toggleTheme} aria-pressed={isDark}>
				<span>Dark mode</span>

				<span className={`account-menu-switch ${isDark ? 'account-menu-switch-on' : ''}`} />
			</button>

			<button type='button' className='account-menu-row' onClick={logoutHandler}>
				<span>Log out</span>
			</button>
		</div>
	);
};

export default AccountMenu;
