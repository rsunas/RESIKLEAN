import { useState } from 'react';

// Filters identify a result set; refreshing or deleting rows clamps its current page.
export default function useTablePagination(rows, filterKey) {
  const [state, setState] = useState({ page: 1, pageSize: 7, filterKey });
  const page = Math.min(state.filterKey === filterKey ? state.page : 1, Math.max(1, Math.ceil(rows.length / state.pageSize)));
  if (state.filterKey !== filterKey || state.page !== page) setState({ ...state, filterKey, page });
  return {
    rows: rows.slice((page - 1) * state.pageSize, page * state.pageSize),
    controls: { page, pageSize: state.pageSize, total: rows.length,
      onPageChange: next => setState({ ...state, filterKey, page: next }),
      onPageSizeChange: pageSize => setState({ filterKey, page: 1, pageSize }),
    },
  };
}
