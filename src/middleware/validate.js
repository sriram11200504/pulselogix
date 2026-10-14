const ApiError = require('../utils/ApiError');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return next(
        ApiError.badRequest(
          'Validation failed',
          error.details.map((d) => d.message)
        )
      );
    }
    req[source] = value;
    return next();
  };
}

module.exports = { asyncHandler, validate };
