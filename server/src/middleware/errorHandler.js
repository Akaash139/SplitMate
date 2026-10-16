class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    message = errors.join(". ") || "Validation failed";
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    if (field === "email") {
      message = "An account with this email already exists";
    } else {
      message = `Duplicate value for ${field}. Please use another value`;
    }
  }

  // Mongoose bad ObjectId / CastError
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path || "identifier"}: ${err.value}`;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please log in again";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your session has expired. Please log in again";
  }

  // In production or default 500s, avoid leaking raw internal system errors
  if (statusCode === 500 && !err.isOperational) {
    console.error("Unhandled Error:", err);
    message = "An unexpected server error occurred. Please try again later";
  }

  res.status(statusCode).json({
    success: false,
    error: message
  });
}

module.exports = {
  AppError,
  errorHandler
};
