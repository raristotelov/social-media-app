import useSuggestions from '../../hooks/useSuggestions';
import { DISMISS_SUGGESTIONS_LABEL, SUGGESTION_PLACEMENTS, SUGGESTIONS_HEADING } from '../../constants/suggestions';

import SuggestionCard from '../SuggestionCard/SuggestionCard';
import CloseIcon from '../icons/Close';

import './SuggestionsCarousel.css';

const SuggestionsCarousel = () => {
	const { suggestions, isLoaded, isCarouselDismissed, followSuggestion, dismissCarousel } = useSuggestions(SUGGESTION_PLACEMENTS.CAROUSEL);

	if (!isLoaded || isCarouselDismissed || !suggestions.length) {
		return null;
	}

	return (
		<section className='suggestions-carousel' aria-label={SUGGESTIONS_HEADING}>
			<header className='suggestions-carousel-header'>
				<h2 className='suggestions-carousel-heading'>{SUGGESTIONS_HEADING}</h2>

				<button type='button' className='suggestions-carousel-dismiss' aria-label={DISMISS_SUGGESTIONS_LABEL} onClick={dismissCarousel}>
					<CloseIcon iconColorProp='currentColor' />
				</button>
			</header>

			<div className='suggestions-carousel-cards'>
				{suggestions.map((suggestion) => (
					<SuggestionCard key={suggestion._id} suggestion={suggestion} onFollowClick={followSuggestion} />
				))}
			</div>
		</section>
	);
};

export default SuggestionsCarousel;
