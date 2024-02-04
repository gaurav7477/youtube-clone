class ApiError extends Error {
  constructor(statusCode, message = 'Something went wrong', errors = [], stack = "") {
  
    super(message);

    // Initialize properties specific to ApiError
    this.statusCode = statusCode;
    this.errors = errors;
    this.stack = stack;

    // Additional properties for customization
    this.data = null;
    this.success = false;

    // If a stack is provided, use it; otherwise, capture the stack trace
    if (!stack) {
      // Capture stack trace if not provided
      Error.captureStackTrace(this, this.constructor);
    }

  }
}

export { ApiError };
