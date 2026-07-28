// Pagination maths. Pure so the tables never have to reason about empty lists,
// out-of-range pages or off-by-one labels themselves.

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export function isPageSize(value: unknown): value is PageSize {
  return PAGE_SIZES.includes(value as PageSize);
}

export type PageInfo = {
  /** Requested page clamped into range. Always >= 1. */
  page: number;
  pageCount: number;
  /** Slice bounds for the current page. */
  start: number;
  end: number;
  /** 1-based labels for "X-Y de Z". Both 0 when the list is empty. */
  from: number;
  to: number;
  total: number;
};

/**
 * Clamps `page` against the data instead of trusting it. Filtering shrinks the
 * list under the user's feet: page 5 of 5 becomes page 5 of 1 and would render an
 * empty table if the page number were taken at face value.
 */
export function paginate(total: number, page: number, pageSize: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  return {
    page: current,
    pageCount,
    start,
    end,
    from: total === 0 ? 0 : start + 1,
    to: end,
    total,
  };
}
