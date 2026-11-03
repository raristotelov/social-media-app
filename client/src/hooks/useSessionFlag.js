import { useCallback, useState } from 'react';

const FLAG_ON = 'true';

const readFlag = (key) => {
	try {
		return sessionStorage.getItem(key) === FLAG_ON;
	} catch {
		return false;
	}
};

const writeFlag = (key) => {
	try {
		sessionStorage.setItem(key, FLAG_ON);
	} catch {
		return;
	}
};

const useSessionFlag = (key) => {
	const [isSet, setIsSet] = useState(() => readFlag(key));

	const setFlag = useCallback(() => {
		writeFlag(key);
		setIsSet(true);
	}, [key]);

	return [isSet, setFlag];
};

export default useSessionFlag;
