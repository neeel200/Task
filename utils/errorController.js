const errorController = (error, req, res, next) => {
  return res.status(500).json({
    message: error?.message,
    stack: error.stack,
  });
};

module.exports = errorController;
