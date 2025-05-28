import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchProducts, addProduct, deleteProduct } from '../service/apiService';

const ProductTracker = () => {
  const [parsedText, setParsedText] = useState('');
  const [productName, setProductName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [products, setProducts] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [emailSuccess, setEmailSuccess] = useState('');

  // Define email notification settings
  const emailNotification = {
    enabled: true, // Enable/disable email notifications
    email: import.meta.env.VITE_NOTIFICATION_EMAIL || 'subhiksha.senthilkumarr@gmail.com', // Replace with your notification email
    daysBeforeExpiry: 7, // Matches backend logic for 7 days
  };

  // Function to send expiry email via API
  const sendExpiryEmail = async ({ email, products, daysBeforeExpiry }) => {
    try {
      const response = await fetch('https://foodsense-tawy.onrender.com/api/send-expiry-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          products,
          daysBeforeExpiry,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send expiry notification email');
      }
    } catch (error) {
      throw new Error(error.message || 'Failed to send email');
    }
  };

  // Check for products nearing expiry and send email alerts
  useEffect(() => {
    const checkExpiryAndSendEmails = async () => {
      if (!emailNotification.enabled || !emailNotification.email) return;

      const today = new Date();
      const productsNearingExpiry = products.filter((product) => {
        const expiryDate = new Date(product.expiry);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry > 0 && daysUntilExpiry <= emailNotification.daysBeforeExpiry && !product.notificationSent;
      });

      if (productsNearingExpiry.length > 0) {
        try {
          await sendExpiryEmail({
            email: emailNotification.email,
            products: productsNearingExpiry,
            daysBeforeExpiry: emailNotification.daysBeforeExpiry,
          });

          // Mark products as having had emails sent
          const updatedProducts = products.map((product) => {
            if (productsNearingExpiry.some((p) => p._id === product._id)) {
              return { ...product, notificationSent: true };
            }
            return product;
          });
          setProducts(updatedProducts);

          setEmailSuccess(`Expiry notification sent for ${productsNearingExpiry.length} product(s)`);
          setTimeout(() => setEmailSuccess(''), 5000);
        } catch (error) {
          setError('Failed to send expiry notification email.');
          setTimeout(() => setError(''), 5000);
        }
      }
    };

    checkExpiryAndSendEmails();

    // Set up daily check for expiry emails
    const intervalId = setInterval(checkExpiryAndSendEmails, 24 * 60 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [products, emailNotification]);

  // Load products from API
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoadingProducts(true);
        const productsData = await fetchProducts();
        setProducts(productsData);
        setLoadingProducts(false);
      } catch (error) {
        setError('Failed to load products. Please try again later.');
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, []);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setLoading(true);
    setError('');
    setParsedText('');
    setProductName('');
    setExpiryDate('');

    try {
      // OCR.Space API implementation
      const formData = new FormData();
      formData.append('file', file);
      formData.append('apikey', 'K85981005688957'); // Replace with your actual API key
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('detectOrientation', 'true');
      formData.append('scale', 'true');
      formData.append('OCREngine', '2');

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.IsErroredOnProcessing) {
        throw new Error(result.ErrorMessage || 'OCR processing failed');
      }

      if (result.ParsedResults && result.ParsedResults.length > 0) {
        const parsedTextResult = result.ParsedResults[0].ParsedText;
        console.log('OCR Result:', parsedTextResult);

        if (parsedTextResult) {
          setParsedText(parsedTextResult);

          // Flexible date detection
          const datePatterns = [
            /(EXP|GXP|EXPIRE|EXPIRY)[\s:]*([0-9]{2}[\/\-][0-9]{2}(?:[\/\-][0-9]{2,4})?)/i,
            /(EXP|GXP|EXPIRE|EXPIRY)[\s:]*([0-9]{2}[\/\-][0-9]{4})/i,
            /([0-9]{2}[\/\-][0-9]{2}[\/\-][0-9]{2,4})/i,
          ];

          let matchedDate = '';
          for (const pattern of datePatterns) {
            const match = parsedTextResult.match(pattern);
            if (match) {
              matchedDate = match[2] || match[1];
              break;
            }
          }

          if (matchedDate) {
            const parts = matchedDate.split(/[\/\-]/);
            let formattedDate = '';
            if (parts.length === 3) {
              const [month, day, year] = parts;
              const fullYear = year.length === 2 ? `20${year}` : year;
              formattedDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else if (parts.length === 2) {
              const [month, year] = parts;
              formattedDate = `${year}-${month.padStart(2, '0')}-01`;
            }

            if (formattedDate) {
              console.log('Detected EXP Date:', formattedDate);
              setExpiryDate(formattedDate);
            } else {
              setError('Invalid date format detected.');
            }
          } else {
            setError('No expiry date detected.');
          }

          const lines = parsedTextResult.split('\n').filter((line) => line.trim());
          const possibleName = lines.find((line) => !line.match(/EXP|GXP|EXPIRE|EXPIRY|[0-9]{2}[\/\-]/i)) || 'Product detected';
          setProductName(possibleName.trim());
        } else {
          setError('No text extracted from the image.');
        }
      } else {
        setError('OCR processing did not return any results.');
      }

      setLoading(false);
    } catch (error) {
      console.error('Error during OCR:', error);
      setError(`Failed to process image: ${error.message || 'Please try again'}`);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productName || !expiryDate) {
      setError('Please provide a product name and expiry date.');
      return;
    }

    try {
      let imageData = null;
      if (imageFile) {
        const reader = new FileReader();
        imageData = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
      }

      const newProductData = {
        name: productName,
        expiry: expiryDate,
        imageData,
      };

      const savedProduct = await addProduct(newProductData);
      setProducts((prevProducts) => [...prevProducts, savedProduct]);

      setProductName('');
      setExpiryDate('');
      setImageFile(null);
      setImagePreview('');
      setParsedText('');
      setError('');
    } catch (error) {
      setError('Failed to add product. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProduct(id);
      setProducts(products.filter((product) => product._id !== id));
    } catch (error) {
      setError('Failed to delete product. Please try again.');
    }
  };

  const getDaysUntilExpiry = (expiry) => {
    const today = new Date();
    const expiryDate = new Date(expiry);
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 font-sans flex flex-col p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto w-full flex flex-col flex-grow"
      >
        <motion.h1
          className="text-3xl font-bold text-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Product Tracker
        </motion.h1>

        <div className="grid lg:grid-cols-2 gap-6 flex-grow">
          <motion.div
            className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg p-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Add New Product</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="bg-indigo-50/50 rounded-xl p-4">
                {!imagePreview ? (
                  <label className="flex flex-col items-center justify-center text-center border-2 border-dashed border-indigo-200 rounded-xl p-6 hover:border-indigo-400 transition-all duration-300 cursor-pointer">
                    <motion.div className="bg-indigo-100 p-4 rounded-full mb-4" whileHover={{ scale: 1.1 }}>
                      <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </motion.div>
                    <span className="text-gray-600">Upload product image</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" aria-label="Upload product image" />
                  </label>
                ) : (
                  <div className="relative rounded-xl overflow-hidden shadow-md">
                    <img src={imagePreview} alt="Product preview" className="w-full h-40 object-cover" />
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview('');
                        setParsedText('');
                        setProductName('');
                        setExpiryDate('');
                        setError('');
                      }}
                      className="absolute top-2 right-2 bg-white/90 p-2 rounded-full shadow-md hover:bg-white transition-all duration-300"
                      aria-label="Clear image"
                    >
                      <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  </div>
                )}
              </div>

              {loading && (
                <motion.div className="flex items-center gap-2 text-blue-600" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                  <motion.div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-200 border-t-blue-600" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                  <span>Detecting text...</span>
                </motion.div>
              )}

              {error && (
                <motion.div className="bg-red-50/70 backdrop-blur-md text-red-600 p-3 rounded-xl text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                  {error}
                </motion.div>
              )}

              {emailSuccess && (
                <motion.div className="bg-green-50/70 backdrop-blur-md text-green-600 p-3 rounded-xl text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                  {emailSuccess}
                </motion.div>
              )}

              {parsedText && (
                <motion.div className="bg-white/30 backdrop-blur-md rounded-xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Extracted Text</h3>
                  <p className="text-gray-600 text-xs whitespace-pre-wrap">{parsedText}</p>
                </motion.div>
              )}

              <input
                type="text"
                placeholder="Product Name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="bg-white/30 backdrop-blur-md border border-gray-200 p-3 rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
                required
              />

              <input
                type="date"
                placeholder="Expiry Date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="bg-white/30 backdrop-blur-md border border-gray-200 p-3 rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
              />

              <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-md transition-all duration-300">
                Add Product
              </motion.button>
            </form>
          </motion.div>

          <motion.div className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg p-6 overflow-y-auto" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Tracked Products</h2>
            {loadingProducts ? (
              <div className="text-indigo-600">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="text-gray-500">No products added yet.</div>
            ) : (
              <ul className="flex flex-col gap-4">
                <AnimatePresence>
                  {products.map((product) => (
                    <motion.li
                      key={product._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-white/40 backdrop-blur-md p-4 rounded-xl flex items-center justify-between shadow-md"
                    >
                      <div>
                        <h3 className="font-semibold text-gray-700">{product.name}</h3>
                        <p className="text-sm text-gray-500">Expires in {getDaysUntilExpiry(product.expiry)} days</p>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDelete(product._id)}
                        className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-sm transition-all duration-300"
                        aria-label="Delete product"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </motion.button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default ProductTracker;