import { useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import LoggedInUserContext from '../../contexts/LoggedInUserContext';
import ToastContext from '../../contexts/ToastContext';
import useDemoStripOffset from '../../hooks/useDemoStripOffset';
import useMediaQuery from '../../hooks/useMediaQuery';
import useSessionFlag from '../../hooks/useSessionFlag';
import { demoLogin } from '../../services/userService';
import { DEMO_ACCOUNT_TYPE, DEMO_LANDING_PATH, DEMO_NOTICE_DISMISSED_KEY, DEMO_STRIP_COPY, GUEST_STRIP_DISMISSED_KEY } from '../../constants/demo';
import { ACTION_FALLBACK_MESSAGES } from '../../constants/errorMessages';
import { MOBILE_MEDIA_QUERY } from '../../constants/layout';
import { getErrorMessage } from '../../utils/errors';

import CloseToastIcon from '../icons/CloseToast';

import './DemoStrip.css';

const isDemoVisitor = (user) => user?.accountType === DEMO_ACCOUNT_TYPE;

const DemoStrip = () => {
	const { jwtToken, loggedInUser, setJwtToken } = useContext(LoggedInUserContext);
	const { showToast } = useContext(ToastContext);

	const navigate = useNavigate();
	const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

	const [isGuestStripDismissed, dismissGuestStrip] = useSessionFlag(GUEST_STRIP_DISMISSED_KEY);
	const [isNoticeDismissed, dismissNotice] = useSessionFlag(DEMO_NOTICE_DISMISSED_KEY);
	const [isStarting, setIsStarting] = useState(false);

	const stripRef = useRef(null);

	const isGuest = !jwtToken;
	const isVisible = isGuest ? !isGuestStripDismissed : isDemoVisitor(loggedInUser) && !isNoticeDismissed;

	useDemoStripOffset(stripRef, isVisible);

	const startDemo = async () => {
		setIsStarting(true);

		try {
			const demoJwt = await demoLogin();

			setJwtToken(demoJwt);
			navigate(DEMO_LANDING_PATH, { replace: true });
		} catch (error) {
			showToast(getErrorMessage(error, ACTION_FALLBACK_MESSAGES.START_DEMO));
		} finally {
			setIsStarting(false);
		}
	};

	if (!isVisible) {
		return null;
	}

	const noticeLead = isMobile ? DEMO_STRIP_COPY.NOTICE_LEAD_MOBILE : DEMO_STRIP_COPY.NOTICE_LEAD;
	const noticeRest = isMobile ? DEMO_STRIP_COPY.NOTICE_REST_MOBILE : DEMO_STRIP_COPY.NOTICE_REST;

	return (
		<div className={isGuest ? 'demo-strip demo-strip-guest' : 'demo-strip'} ref={stripRef}>
			{isGuest ? (
				<>
					<p className='demo-strip-message'>{isMobile ? DEMO_STRIP_COPY.GUEST_MOBILE : DEMO_STRIP_COPY.GUEST}</p>

					<button type='button' className='demo-strip-button' onClick={startDemo} disabled={isStarting}>
						{isStarting ? DEMO_STRIP_COPY.TRY_DEMO_BUSY_LABEL : DEMO_STRIP_COPY.TRY_DEMO_LABEL}
					</button>
				</>
			) : (
				<p className='demo-strip-message'>
					<strong>{noticeLead}</strong>

					{` ${noticeRest}`}
				</p>
			)}

			<button
				type='button'
				className='demo-strip-close'
				onClick={isGuest ? dismissGuestStrip : dismissNotice}
				aria-label={DEMO_STRIP_COPY.CLOSE_LABEL}
			>
				<CloseToastIcon />
			</button>
		</div>
	);
};

export default DemoStrip;
