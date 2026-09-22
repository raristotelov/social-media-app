import { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import LoggedInUserContext from './contexts/LoggedInUserContext';

import SignUpView from './components/SignUpView/SignUpView';
import LoginView from './components/LoginView/LoginView';
import ProfileView from './components/ProfileView/ProfileView';
import FeedView from './components/FeedView/FeedView';
import PopularPostsView from './components/PopularPostsView/PopularPostsView';

import './index.css';

const Router = () => {
	const { jwtToken, loggedInUser } = useContext(LoggedInUserContext);

	return (
		<div className='routes-wrapper'>
			<Routes>
				<Route path='/' element={jwtToken ? <Navigate to='/user-feed' /> : <Navigate to='/log-in' />} />

				<Route path='/sign-up' element={<SignUpView />} />

				<Route path='/log-in' element={<LoginView />} />

				<Route path='/user-feed' element={<FeedView posts={loggedInUser?.followedUsersPosts} />} />

				<Route path='/popular-posts' element={<PopularPostsView />} />

				<Route path='/user/:userId' element={<ProfileView />} />
			</Routes>
		</div>
	);
};

export default Router;
