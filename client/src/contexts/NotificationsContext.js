import { createContext } from 'react';

const NotificationsContext = createContext({ unreadCount: 0, clearUnreadCount: () => {} });

NotificationsContext.displayName = 'NotificationsContext';

export default NotificationsContext;
