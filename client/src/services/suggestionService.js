import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';

export const getSuggestions = ({ placement, jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.get(`${serverUrl}/suggestions?placement=${encodeURIComponent(placement)}`);
};

export const dismissSuggestionsCarousel = ({ jwtToken }) => {
	const request = requestFactory(jwtToken);

	return request.post(`${serverUrl}/suggestions/carousel/dismiss`);
};
