import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = "https://serverless.roboflow.com/food-spoilage-status-lks1t/2";
const API_KEY = "qpGs104Zgl9fJ44z71Bh";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_HISTORY_ITEMS = 10;
const FRAME_PROCESS_INTERVAL = 5000; // Process one frame every 5 seconds

const FreshnessDetector = () => {
  const [imagePreview, setImagePreview] = useState('');
  const [result, setResult] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('scan');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize camera and load history
  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError('Failed to access camera. Please ensure camera permissions are granted.');
      }
    };

    if (activeTab === 'scan') {
      startCamera();
    }

    // Load history from localStorage
    const savedHistory = localStorage.getItem('foodDetectionHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }

    // Cleanup on unmount or tab change
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeTab]);

  // Real-time frame processing
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError('Failed to capture frame.');
        return;
      }

      if (blob.size > MAX_FILE_SIZE) {
        setError('Captured frame is too large.');
        return;
      }

      setImagePreview(canvas.toDataURL('image/jpeg'));
      setLoading(true);

      try {
        const base64Image = canvas.toDataURL('image/jpeg');
        const response = await axios.post(
          API_URL,
          base64Image,
          {
            params: { api_key: API_KEY },
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
          }
        );

        const { predictions } = response.data;
        if (predictions?.length > 0) {
          const { class: resultClass, confidence: resultConfidence } = predictions[0];
          const confidencePercent = resultConfidence * 100;

          setResult(resultClass);
          setConfidence(confidencePercent);
        } else {
          setResult('Unknown');
          setConfidence(0);
          setError('No recognizable food items detected.');
        }
      } catch (err) {
        if (err.response?.status === 429) {
          setError('API rate limit exceeded. Please try again later.');
        } else {
          setError('Failed to analyze frame. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }, 'image/jpeg');
  }, [loading]);

  // Process uploaded image
  const processUploadedImage = useCallback(async () => {
    if (!uploadedFile) {
      setError('Please select an image to analyze.');
      return;
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      setError('Uploaded file is too large. Maximum size is 5MB.');
      return;
    }

    setLoading(true);
    setError('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result;
      setImagePreview(base64Image);

      try {
        const response = await axios.post(
          API_URL,
          base64Image,
          {
            params: { api_key: API_KEY },
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 10000,
          }
        );

        const { predictions } = response.data;
        if (predictions?.length > 0) {
          const { class: resultClass, confidence: resultConfidence } = predictions[0];
          const confidencePercent = resultConfidence * 100;

          setResult(resultClass);
          setConfidence(confidencePercent);
        } else {
          setResult('Unknown');
          setConfidence(0);
          setError('No recognizable food items detected.');
        }
      } catch (err) {
        if (err.response?.status === 429) {
          setError('API rate limit exceeded. Please try again later.');
        } else {
          setError('Failed to analyze image. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(uploadedFile);
  }, [uploadedFile]);

  // Start/stop real-time processing
  const toggleProcessing = useCallback(() => {
    if (isProcessing) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsProcessing(false);
    } else {
      setIsProcessing(true);
      processFrame(); // Process immediately
      intervalRef.current = setInterval(processFrame, FRAME_PROCESS_INTERVAL);
    }
  }, [isProcessing, processFrame]);

  // Save significant result to history
  const saveToHistory = useCallback(() => {
    if (!result || !imagePreview) return;

    const historyItem = {
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      image: imagePreview,
      result,
      confidence,
    };

    setHistory(prev => [historyItem, ...prev.slice(0, MAX_HISTORY_ITEMS - 1)]);
    localStorage.setItem('foodDetectionHistory', JSON.stringify([historyItem, ...history.slice(0, MAX_HISTORY_ITEMS - 1)]));
  }, [result, imagePreview, confidence, history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('foodDetectionHistory');
  }, []);

  const handleRetake = useCallback(() => {
    setImagePreview('');
    setResult('');
    setConfidence(0);
    setError('');
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (isProcessing) {
      toggleProcessing(); // Stop processing if running
    }
  }, [isProcessing, toggleProcessing]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      setUploadedFile(file);
      setError('');
    } else {
      setError('Please upload a valid JPEG or PNG image.');
      setUploadedFile(null);
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const getStatusColor = (status) => {
    if (!status) return 'text-gray-400';
    status = status.toLowerCase();
    if (status.includes('fresh')) return 'text-green-500';
    if (status.includes('spoiled') || status.includes('rotten')) return 'text-red-500';
    return 'text-yellow-500';
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 90) return 'bg-green-500';
    if (conf >= 70) return 'bg-blue-500';
    if (conf >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 font-sans overflow-hidden flex flex-col">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col flex-grow">
        <video ref={videoRef} autoPlay playsInline className={`w-full max-w-md mx-auto rounded-xl shadow-md ${activeTab !== 'scan' ? 'hidden' : ''}`} />
        <canvas ref={canvasRef} className="hidden" />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row flex-grow mt-4"
        >
          {/* Side Navigation */}
          <div className="lg:w-16 bg-gradient-to-b from-blue-600 to-indigo-600 flex lg:flex-col justify-center items-center py-4 px-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('scan')}
              className={`p-3 rounded-full ${
                activeTab === 'scan' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/20'
              } transition-all duration-300 mb-0 lg:mb-4 mx-3 lg:mx-0`}
              aria-label="Scan"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('history')}
              className={`p-3 rounded-full ${
                activeTab === 'history' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/20'
              } transition-all duration-300 mb-0 lg:mb-4 mx-3 lg:mx-0`}
              aria-label="History"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('upload')}
              className={`p-3 rounded-full ${
                activeTab === 'upload' ? 'bg-white text-indigo-600' : 'text-white hover:bg-white/20'
              } transition-all duration-300`}
              aria-label="Upload"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.2 6.1L16 4l2.29 2.29a1 1 0 001.42 0L22 4v4h-4l1.29 1.29a1 1 0 01-1.42 1.42L16 8.41l-1.88 1.88A4 4 0 017 16z" />
              </svg>
            </motion.button>
          </div>

          {/* Content Area */}
          <div className="flex-grow p-6 lg:p-8 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'scan' ? (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-semibold text-gray-800">Food Freshness Scanner</h2>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsModalOpen(true)}
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-2 text-sm font-medium transition-all duration-300"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      App Info
                    </motion.button>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-6 flex-grow">
                    {/* Scanner Area */}
                    <div className="flex flex-col">
                      <motion.div
                        className="bg-white/30 backdrop-blur-md rounded-2xl shadow-lg p-6 mb-4 flex-grow"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                      >
                        <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-indigo-200 rounded-xl p-8 hover:border-indigo-400 transition-all duration-300">
                          <motion.div
                            className="bg-indigo-100 p-6 rounded-full mb-6"
                            whileHover={{ scale: 1.1 }}
                          >
                            <svg className="w-12 h-12 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </motion.div>
                          <h3 className="text-xl font-semibold text-gray-800 mb-4">Live Food Scanner</h3>
                          <p className="text-gray-500 mb-6">Point your camera at a food item for real-time freshness detection</p>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={toggleProcessing}
                            className={`inline-block bg-gradient-to-r ${
                              isProcessing
                                ? 'from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
                                : 'from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                            } text-white py-4 px-8 rounded-xl cursor-pointer transition-all duration-300 shadow-md font-medium`}
                          >
                            {isProcessing ? 'Stop Scanning' : 'Start Scanning'}
                          </motion.button>
                          {isProcessing && result && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={saveToHistory}
                              className="inline-block bg-green-600 hover:bg-green-700 text-white py-4 px-8 rounded-xl cursor-pointer transition-all duration-300 shadow-md font-medium mt-4"
                            >
                              Save Result
                            </motion.button>
                          )}
                        </div>
                      </motion.div>

                      {loading && (
                        <motion.div
                          className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="flex flex-col items-center">
                            <motion.div
                              className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mb-4"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            />
                            <p className="text-gray-600 font-medium">Analyzing frame...</p>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* Results Area */}
                    <div className="flex flex-col">
                      {result && !loading && (
                        <motion.div
                          className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md mb-4"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5 }}
                        >
                          <h3 className="text-xl font-semibold text-gray-800 mb-6">Latest Result</h3>

                          {error ? (
                            <div className="bg-red-50/70 backdrop-blur-md border border-red-100 rounded-xl p-6 text-center">
                              <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <p className="text-red-600 font-medium mb-4">{error}</p>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleRetake}
                                className="bg-white hover:bg-gray-50 text-red-600 border border-red-200 py-2 px-6 rounded-lg transition-all duration-300 text-sm font-medium"
                              >
                                Reset
                              </motion.button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center text-center">
                              <motion.div
                                className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 ${
                                  result.toLowerCase().includes('fresh')
                                    ? 'bg-green-100'
                                    : result.toLowerCase().includes('spoiled') || result.toLowerCase().includes('rotten')
                                    ? 'bg-red-100'
                                    : 'bg-yellow-100'
                                }`}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, type: 'spring' }}
                              >
                                <span className={`text-4xl font-bold ${getStatusColor(result)}`}>
                                  {result.toLowerCase().includes('fresh')
                                    ? '✓'
                                    : result.toLowerCase().includes('spoiled') || result.toLowerCase().includes('rotten')
                                    ? '✗'
                                    : '!'}
                                </span>
                              </motion.div>

                              <h4 className={`text-2xl font-bold mb-2 ${getStatusColor(result)}`}>{result}</h4>

                              <div className="w-full bg-gray-100/50 backdrop-blur-sm rounded-full h-3 mb-4 mt-6">
                                <motion.div
                                  className={`h-3 rounded-full ${getConfidenceColor(confidence)}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${confidence}%` }}
                                  transition={{ duration: 1, ease: 'easeOut' }}
                                />
                              </div>

                              <p className="text-gray-600 mb-8">
                                Confidence: <span className="font-semibold">{confidence.toFixed(1)}%</span>
                              </p>

                              <div className="grid grid-cols-2 gap-4 w-full">
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={handleRetake}
                                  className="bg-white/30 backdrop-blur-md hover:bg-gray-50 text-indigo-600 border border-indigo-200 py-3 rounded-xl transition-all duration-300 font-medium"
                                >
                                  Reset
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setActiveTab('history')}
                                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl transition-all duration-300 shadow-md font-medium"
                                >
                                  View History
                                </motion.button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      <motion.div
                        className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md flex-grow"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                      >
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-semibold text-gray-800">Scan Tips</h3>
                        </div>
                        <ul className="space-y-4">
                          {[
                            'Ensure good lighting for accurate real-time detection',
                            'Position the food item clearly within the camera frame',
                            'Avoid rapid movements to allow stable frame analysis',
                          ].map((tip, index) => (
                            <motion.li
                              key={index}
                              className="flex items-start gap-3"
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.5, delay: index * 0.1 }}
                            >
                              <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </div>
                              <p className="text-gray-600 text-sm">{tip}</p>
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'history' ? (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-semibold text-gray-800">Scan History</h2>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={clearHistory}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-all duration-300 shadow-sm text-sm font-medium disabled:opacity-50"
                      disabled={history.length === 0}
                    >
                      Clear All
                    </motion.button>
                  </div>

                  {history.length === 0 ? (
                    <motion.div
                      className="flex-grow flex flex-col items-center justify-center bg-white/20 backdrop-blur-md rounded-2xl p-10"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <svg className="w-20 h-20 text-indigo-300 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-xl font-medium text-gray-700 mb-2">No scan history yet</h3>
                      <p className="text-gray-500 mb-8 text-center">Start scanning food items to build your history</p>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setActiveTab('scan')}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 px-8 rounded-xl transition-all duration-300 shadow-md font-medium"
                      >
                        Start Scanning
                      </motion.button>
                    </motion.div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {history.map((item, index) => (
                        <motion.div
                          key={item.id}
                          className="bg-white/30 backdrop-blur-md rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                        >
                          <div className="relative h-40">
                            <img src={item.image} alt="Food item" className="w-full h-full object-cover" />
                            <div
                              className={`absolute top-3 right-3 ${
                                item.result.toLowerCase().includes('fresh')
                                  ? 'bg-green-100 text-green-700'
                                  : item.result.toLowerCase().includes('spoiled') || item.result.toLowerCase().includes('rotten')
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              } px-3 py-1 rounded-full text-xs font-bold`}
                            >
                              {item.confidence.toFixed(1)}% confidence
                            </div>
                          </div>
                          <div className="p-4">
                            <div className={`text-lg font-semibold ${getStatusColor(item.result)} mb-1`}>
                              {item.result}
                            </div>
                            <p className="text-xs text-gray-500">{item.timestamp}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-semibold text-gray-800">Upload Image</h2>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsModalOpen(true)}
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-2 text-sm font-medium transition-all duration-300"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      App Info
                    </motion.button>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-6 flex-grow">
                    {/* Upload Area */}
                    <div className="flex flex-col">
                      <motion.div
                        className="bg-white/30 backdrop-blur-md rounded-2xl shadow-lg p-6 mb-4 flex-grow"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                      >
                        <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-indigo-200 rounded-xl p-8 hover:border-indigo-400 transition-all duration-300">
                          <motion.div
                            className="bg-indigo-100 p-6 rounded-full mb-6"
                            whileHover={{ scale: 1.1 }}
                          >
                            <svg className="w-12 h-12 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.2 6.1L16 4l2.29 2.29a1 1 0 001.42 0L22 4v4h-4l1.29 1.29a1 1 0 01-1.42 1.42L16 8.41l-1.88 1.88A4 4 0 017 16z" />
                            </svg>
                          </motion.div>
                          <h3 className="text-xl font-semibold text-gray-800 mb-4">Upload Food Image</h3>
                          <p className="text-gray-500 mb-6">Upload a JPEG or PNG image of a food item for freshness detection</p>
                          {uploadedFile && (
                            <p className="text-sm text-gray-600 mb-4">Selected file: {uploadedFile.name}</p>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={triggerFileInput}
                            className="inline-block bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 px-8 rounded-xl cursor-pointer transition-all duration-300 shadow-md font-medium mb-4"
                          >
                            Upload Image
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={processUploadedImage}
                            disabled={!uploadedFile || loading}
                            className={`inline-block bg-gradient-to-r ${
                              uploadedFile && !loading
                                ? 'from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                                : 'from-gray-400 to-gray-500 cursor-not-allowed'
                            } text-white py-4 px-8 rounded-xl transition-all duration-300 shadow-md font-medium`}
                          >
                            Analyze Image
                          </motion.button>
                          {result && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={saveToHistory}
                              className="inline-block bg-green-600 hover:bg-green-700 text-white py-4 px-8 rounded-xl cursor-pointer transition-all duration-300 shadow-md font-medium mt-4"
                            >
                              Save Result
                            </motion.button>
                          )}
                        </div>
                      </motion.div>

                      {loading && (
                        <motion.div
                          className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="flex flex-col items-center">
                            <motion.div
                              className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mb-4"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            />
                            <p className="text-gray-600 font-medium">Analyzing image...</p>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* Results Area */}
                    <div className="flex flex-col">
                      {imagePreview && (
                        <motion.div
                          className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md mb-4"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5 }}
                        >
                          <h3 className="text-xl font-semibold text-gray-800 mb-6">Image Preview</h3>
                          <img src={imagePreview} alt="Uploaded food" className="w-full h-48 object-contain rounded-xl mb-4" />
                        </motion.div>
                      )}

                      {result && !loading && (
                        <motion.div
                          className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md mb-4"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5 }}
                        >
                          <h3 className="text-xl font-semibold text-gray-800 mb-6">Analysis Result</h3>

                          {error ? (
                            <div className="bg-red-50/70 backdrop-blur-md border border-red-100 rounded-xl p-6 text-center">
                              <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <p className="text-red-600 font-medium mb-4">{error}</p>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleRetake}
                                className="bg-white hover:bg-gray-50 text-red-600 border border-red-200 py-2 px-6 rounded-lg transition-all duration-300 text-sm font-medium"
                              >
                                Reset
                              </motion.button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center text-center">
                              <motion.div
                                className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 ${
                                  result.toLowerCase().includes('fresh')
                                    ? 'bg-green-100'
                                    : result.toLowerCase().includes('spoiled') || result.toLowerCase().includes('rotten')
                                    ? 'bg-red-100'
                                    : 'bg-yellow-100'
                                }`}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, type: 'spring' }}
                              >
                                <span className={`text-4xl font-bold ${getStatusColor(result)}`}>
                                  {result.toLowerCase().includes('fresh')
                                    ? '✓'
                                    : result.toLowerCase().includes('spoiled') || result.toLowerCase().includes('rotten')
                                    ? '✗'
                                    : '!'}
                                </span>
                              </motion.div>

                              <h4 className={`text-2xl font-bold mb-2 ${getStatusColor(result)}`}>{result}</h4>

                              <div className="w-full bg-gray-100/50 backdrop-blur-sm rounded-full h-3 mb-4 mt-6">
                                <motion.div
                                  className={`h-3 rounded-full ${getConfidenceColor(confidence)}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${confidence}%` }}
                                  transition={{ duration: 1, ease: 'easeOut' }}
                                />
                              </div>

                              <p className="text-gray-600 mb-8">
                                Confidence: <span className="font-semibold">{confidence.toFixed(1)}%</span>
                              </p>

                              <div className="grid grid-cols-2 gap-4 w-full">
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={handleRetake}
                                  className="bg-white/30 backdrop-blur-md hover:bg-gray-50 text-indigo-600 border border-indigo-200 py-3 rounded-xl transition-all duration-300 font-medium"
                                >
                                  Reset
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={() => setActiveTab('history')}
                                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl transition-all duration-300 shadow-md font-medium"
                                >
                                  View History
                                </motion.button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}

                      <motion.div
                        className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md flex-grow"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                      >
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-semibold text-gray-800">Upload Tips</h3>
                        </div>
                        <ul className="space-y-4">
                          {[
                            'Use high-quality JPEG or PNG images for best results',
                            'Ensure the food item is clearly visible and well-lit',
                            'Keep file size under 5MB to avoid errors',
                          ].map((tip, index) => (
                            <motion.li
                              key={index}
                              className="flex items-start gap-3"
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.5, delay: index * 0.1 }}
                            >
                              <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" stroke="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </div>
                              <p className="text-gray-600 text-sm">{tip}</p>
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-gray-500">
            FreshSense — AI-powered food freshness detection
          </p>
        </motion.footer>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white/90 backdrop-blur-lg rounded-2xl max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto shadow-2xl scroll-smooth"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-3 rounded-full">
                    <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    FreshSense Information
                  </h3>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-all duration-300"
                  aria-label="Close modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              </div>

              <div className="space-y-8">
                <motion.div
                  className="bg-white/20 backdrop-blur-md p-6 rounded-xl"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Supported Food Items</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {['Apples', 'Bananas', 'Oranges', 'Potatoes', 'Capsicum', 'Bitter Gourds'].map(item => (
                      <div
                        key={item}
                        className="bg-white/30 backdrop-blur-md py-3 px-4 rounded-lg text-sm text-center shadow-sm font-medium text-gray-700"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    How FreshSense Works
                  </h4>
                  <p className="text-gray-600">
                    FreshSense uses advanced computer vision technology powered by a deep learning model trained on thousands of food images. 
                    In real-time mode, it continuously analyzes video frames from your camera, examining visual cues such as color, texture, and surface patterns to estimate food freshness. 
                    The upload feature allows analysis of static images. Results are updated with a confidence score reflecting the model’s certainty.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    Safety Disclaimer
                  </h4>
                  <div className="bg-red-50/70 backdrop-blur-md border border-red-100 rounded-xl p-5 mb-4">
                    <p className="text-gray-700 mb-3">
                      FreshSense is a tool designed to assist in assessing food freshness, but it has limitations. Please read the following carefully:
                    </p>
                    <ul className="space-y-2 text-gray-600">
                      {[
                        'FreshSense evaluates food based on visual appearance only and cannot detect microbial contamination, toxins, or other invisible spoilage factors.',
                        'Results may vary due to image quality, lighting conditions, or camera movement.',
                        'Results are suggestive and should not replace standard food safety practices, such as checking smell, texture, or expiration dates.',
                        'Always follow local food safety guidelines and consult professionals when in doubt about food safety.',
                      ].map((item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-red-500 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    Usage Recommendations
                  </h4>
                  <div className="bg-indigo-100/70 backdrop-blur-md rounded-xl p-5">
                    <ul className="space-y-3 text-gray-600">
                      {[
                        'Ensure good lighting for accurate detection results.',
                        'Use high-quality images or hold the food item steady within the camera frame.',
                        'Use the "Save Result" button to store significant results in history.',
                        'If you suspect spoilage, perform sensory checks (smell, touch) and err on the side of caution.',
                        'Check camera or file permissions if issues occur.',
                      ].map((item, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <div className="bg-indigo-100 p-1 rounded-full text-indigo-600 mt-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m Esq6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </div>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              </div>

              <div className="mt-8 flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-white/30 backdrop-blur-md border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl transition-all duration-300 font-medium"
                >
                  Close
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl transition-all duration-300 shadow-md font-medium"
                >
                  I Understand
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FreshnessDetector;