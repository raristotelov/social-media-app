import './LoadingSpinner.css';

export default function LoadingSpinner(props) {
	const { isFullPage } = props;

	const containerClassName = isFullPage ? 'spinner-container spinner-container-full-page' : 'spinner-container';

	return (
		<div className={containerClassName}>
			<div className='loading-spinner'></div>
		</div>
	);
}
