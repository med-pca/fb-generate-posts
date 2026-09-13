export function paginated<T>(data: T[], total: number, page: number, limit: number) {
  return { data, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
