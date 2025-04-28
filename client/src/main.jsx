import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import FreshnessDetector from '../components/FreshnessDetector';
import ProductTracker from '../components/ProductTracker';
import './index.css';


const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true, 
        element: <FreshnessDetector />,
      },
      {
        path: '/product-tracker',
        element: <ProductTracker />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
