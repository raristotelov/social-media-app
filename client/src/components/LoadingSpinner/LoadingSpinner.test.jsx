import '@testing-library/jest-dom';
import { render } from '@testing-library/react';

import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
	it('shows the spinner', () => {
		const { container } = render(<LoadingSpinner />);

		expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
	});

	it('is an inline spinner by default', () => {
		const { container } = render(<LoadingSpinner />);

		expect(container.querySelector('.spinner-container')).not.toHaveClass('spinner-container-full-page');
		expect(container.querySelector('.spinner-container')).not.toHaveClass('spinner-container-below-header');
	});

	it('fills the page when it is a full-page spinner', () => {
		const { container } = render(<LoadingSpinner isFullPage />);

		expect(container.querySelector('.spinner-container')).toHaveClass('spinner-container-full-page');
	});

	it('does not leave room for the header by default, so the session-restore spinner stays 100vh', () => {
		const { container } = render(<LoadingSpinner isFullPage />);

		expect(container.querySelector('.spinner-container')).not.toHaveClass('spinner-container-below-header');
	});

	it('leaves room for the header when it is a full-page spinner below the header', () => {
		const { container } = render(<LoadingSpinner isFullPage isBelowHeader />);

		expect(container.querySelector('.spinner-container')).toHaveClass('spinner-container-full-page');
		expect(container.querySelector('.spinner-container')).toHaveClass('spinner-container-below-header');
	});

	it('ignores the below-header option on an inline spinner', () => {
		const { container } = render(<LoadingSpinner isBelowHeader />);

		expect(container.querySelector('.spinner-container')).not.toHaveClass('spinner-container-below-header');
	});
});
