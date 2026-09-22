import { useState, useEffect, useRef, useCallback } from 'react';

import SearchResults from '../SearchResults/SearchResults';

import './SearchInput.css';

const MIN_SEARCH_LENGTH = 2;

const SearchInput = (props) => {
	const [isSearchDropDownOpen, setIsSearchDropDownOpen] = useState(false);

	const { className, searchWord, onSearchWordChange, results, isLoading, onResultClick } = props;

	const dropdownOptionsRef = useRef();
	const searchInputRef = useRef();

	const handleClickOutside = useCallback((event) => {
		if (dropdownOptionsRef.current && !dropdownOptionsRef.current.contains(event.target) && !searchInputRef.current.contains(event.target)) {
			setIsSearchDropDownOpen(false);
		}
	}, []);

	useEffect(() => {
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	}, [handleClickOutside]);

	const onChange = (e) => {
		onSearchWordChange(e.target.value);
		setIsSearchDropDownOpen(true);
	};

	const onSearchOptionClick = () => {
		setIsSearchDropDownOpen(false);
		onResultClick();
	};

	let classes = 'search-input-wrapper';

	if (className) {
		classes = `search-input-wrapper ${className}`;
	}

	const hasSearchWord = searchWord.trim().length >= MIN_SEARCH_LENGTH;

	return (
		<div className={classes}>
			<input
				type='text'
				id='searched-text'
				name='searchedText'
				placeholder='Search'
				value={searchWord}
				onChange={onChange}
				onFocus={() => setIsSearchDropDownOpen(true)}
				className='search-input'
				ref={searchInputRef}
			/>

			{isSearchDropDownOpen && hasSearchWord ? (
				<div className='options-wrapper' ref={dropdownOptionsRef}>
					<SearchResults results={results} isLoading={isLoading} onResultClick={onSearchOptionClick} className='search-results-dropdown' />
				</div>
			) : null}
		</div>
	);
};

export default SearchInput;
