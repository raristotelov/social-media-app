import { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import LoggedInUserContext from './contexts/LoggedInUserContext';

import SignUpView from './components/SignUpView/SignUpView';
import LoginView from './components/LoginView/LoginView';
import ProfileLayout from './components/ProfileLayout/ProfileLayout';
import ProfileView from './components/ProfileView/ProfileView';
import ProfilePostsView from './components/ProfilePostsView/ProfilePostsView';
import FeedView from './components/FeedView/FeedView';
import PopularPostsView from './components/PopularPostsView/PopularPostsView';

import './index.css';

const Router = () => {
	const { jwtToken } = useContext(LoggedInUserContext);

	return (
		<div className='routes-wrapper'>
			<Routes>
				<Route path='/' element={jwtToken ? <Navigate to='/user-feed' replace /> : <Navigate to='/popular-posts' replace />} />

				<Route path='/sign-up' element={<SignUpView />} />

				<Route path='/log-in' element={<LoginView />} />

				<Route path='/user-feed' element={jwtToken ? <FeedView /> : <Navigate to='/log-in' replace state={{ from: '/user-feed' }} />} />

				<Route path='/popular-posts' element={<PopularPostsView />} />

				<Route path='/user/:userId' element={<ProfileLayout />}>
					<Route index element={<ProfileView />} />

					<Route path='posts' element={<ProfilePostsView />} />
				</Route>
			</Routes>
		</div>
	);
};

export default Router;
