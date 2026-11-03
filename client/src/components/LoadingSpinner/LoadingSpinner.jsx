import './LoadingSpinner.css';

export default function LoadingSpinner(props) {
	const { isFullPage, isBelowHeader } = props;

	let containerClassName = isFullPage ? 'spinner-container spinner-container-full-page' : 'spinner-container';

	if (isFullPage && isBelowHeader) {
		containerClassName = `${containerClassName} spinner-container-below-header`;
	}

	return (
		<div className={containerClassName}>
			<div className='loading-spinner'></div>
		</div>
	);
}
