import { CRASH_MESSAGES } from '../../constants/errorMessages';

import Button from '../Button/Button';
import Logo from '../Logo/Logo';
import AlertIcon from '../icons/Alert';

import './SomethingWentWrongView.css';

const SomethingWentWrongView = () => {
	const reloadPage = () => {
		window.location.reload();
	};

	const goHome = () => {
		window.location.assign('/');
	};

	return (
		<div className='crash-view'>
			<div className='crash-view-logo-row'>
				<Logo />
			</div>

			<section className='crash-view-content'>
				<div className='crash-view-icon'>
					<AlertIcon iconColorProp='currentColor' />
				</div>

				<h1 className='crash-view-heading'>{CRASH_MESSAGES.HEADING}</h1>

				<p className='crash-view-description'>{CRASH_MESSAGES.DESCRIPTION}</p>

				<div className='crash-view-actions'>
					<Button type='button' label={CRASH_MESSAGES.RELOAD_LABEL} onClick={reloadPage} />

					<Button type='button' variant='secondary' label={CRASH_MESSAGES.GO_HOME_LABEL} onClick={goHome} />
				</div>
			</section>
		</div>
	);
};

export default SomethingWentWrongView;
