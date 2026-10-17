import { useEffect, useRef, useState } from 'react';

const usePostActionsMenu = () => {
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const menuContainerRef = useRef(null);

	useEffect(() => {
		if (!isMenuOpen) {
			return undefined;
		}

		const closeOnOutsideClick = (event) => {
			if (menuContainerRef.current && !menuContainerRef.current.contains(event.target)) {
				setIsMenuOpen(false);
			}
		};

		const closeOnEscape = (event) => {
			if (event.key === 'Escape') {
				setIsMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', closeOnOutsideClick);
		document.addEventListener('keydown', closeOnEscape);

		return () => {
			document.removeEventListener('mousedown', closeOnOutsideClick);
			document.removeEventListener('keydown', closeOnEscape);
		};
	}, [isMenuOpen]);

	const toggleMenu = () => {
		setIsMenuOpen((state) => !state);
	};

	const closeMenu = () => {
		setIsMenuOpen(false);
	};

	return { isMenuOpen, menuContainerRef, toggleMenu, closeMenu };
};

export default usePostActionsMenu;
