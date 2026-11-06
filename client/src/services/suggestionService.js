import { requestFactory } from './requester';
import { serverUrl } from '../constants/serverUrl';

export const getSuggestions = ({ placement }) => {
	const request = requestFactory();

	return request.get(`${serverUrl}/suggestions?placement=${encodeURIComponent(placement)}`);
};

export const dismissSuggestionsCarousel = () => {
	const request = requestFactory();

	return request.post(`${serverUrl}/suggestions/carousel/dismiss`);
};
