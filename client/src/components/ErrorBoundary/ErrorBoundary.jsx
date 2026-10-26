import { Component } from 'react';

import SomethingWentWrongView from '../SomethingWentWrongView/SomethingWentWrongView';

class ErrorBoundary extends Component {
	state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	render() {
		if (this.state.hasError) {
			return <SomethingWentWrongView />;
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
