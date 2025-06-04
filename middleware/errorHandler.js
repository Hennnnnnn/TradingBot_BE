const errorHandler = (error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
};

module.exports = errorHandler;