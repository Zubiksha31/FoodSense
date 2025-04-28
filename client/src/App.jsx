// src/App.jsx
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import Navigation from '../components/Navbar';

const App = () => {
  return (
    <div>
      <Navigation />

      <Outlet />
    </div>
  );
};

export default App;
