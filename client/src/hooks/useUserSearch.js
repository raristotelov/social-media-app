import { useContext, useEffect, useState } from 'react';

import LoggedInUserContext from '../contexts/LoggedInUserContext';
import { getUsersProfileData } from '../services/userService';

const MIN_SEARCH_LENGTH = 2;

// Shared by the desktop header dropdown and the mobile search view so the two
// cannot drift apart.
export const useUserSearch = () => {
	const { jwtToken } = useContext(LoggedInUserContext);
	const [searchWord, setSearchWord] = useState('');
	const [results, setResults] = useState([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (searchWord.trim().length < MIN_SEARCH_LENGTH) {
			setResults([]);
			setIsLoading(false);

			return;
		}

		let isCurrent = true;

		setIsLoading(true);

		getUsersProfileData({ searchWord, jwtToken })
			.then((result) => {
				// A slower earlier request must not overwrite a newer one's results.
				if (isCurrent) {
					setResults(result);
				}
			})
			.catch(() => {
				if (isCurrent) {
					setResults([]);
				}
			})
			.finally(() => {
				if (isCurrent) {
					setIsLoading(false);
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [searchWord, jwtToken]);

	const clearSearch = () => {
		setSearchWord('');
		setResults([]);
	};

	return { searchWord, setSearchWord, results, isLoading, clearSearch };
};

export default useUserSearch;
