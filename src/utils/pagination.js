function getPagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginatedResponse({ page, limit, total, data }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data,
  };
}

module.exports = { getPagination, paginatedResponse };
