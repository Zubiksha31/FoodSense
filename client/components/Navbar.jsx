import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const Navigation = () => {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-between p-4 bg-white/20 backdrop-blur-lg shadow-lg"
    >
      {/* Text Logo */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        className="flex items-center gap-2"
      >
        <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          FreshSense
        </span>
        <span className="text-xl" role="img" aria-label="logo">🍎</span>
      </motion.div>

      {/* Navigation Links */}
      <div className="flex gap-6">
        <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Link
            to="/"
            className="text-gray-700 hover:text-indigo-600 font-medium text-sm transition-colors duration-300 relative group"
          >
            Freshness Detector
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Link
            to="/product-tracker"
            className="text-gray-700 hover:text-indigo-600 font-medium text-sm transition-colors duration-300 relative group"
          >
            Product Tracker
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          </Link>
        </motion.div>
      </div>
    </motion.nav>
  );
};

export default Navigation;