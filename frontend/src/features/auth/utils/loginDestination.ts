import type { Role } from '../AuthContext';

// An address inside this site, as saved by ProtectedRoute: "/path" or "/path?query"
function internalTarget(from: unknown): { target: string; path: string; search: string } | null {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null;
  const queryAt = from.indexOf('?');
  const path = queryAt === -1 ? from : from.slice(0, queryAt);
  const search = queryAt === -1 ? '' : from.slice(queryAt);
  return { target: from, path, search };
}

/**
 * Where a person goes after signing in. `from` is the page they were trying to open before the login.
 *  - hiker: back to the booking page with what was already chosen, otherwise the booking page
 *  - staff: back to the page where they reserve for a hiker (keeping day, time and party size) or to
 *    the slots page; a booking link of a visitor becomes the same reservation on the staff desk
 */
export function destinationAfterLogin(from: unknown, role: Role): string {
  const where = internalTarget(from);
  if (role === 'hiker') {
    return where?.path === '/book-table' ? where.target : '/book-table';
  }
  if (where?.path === '/book-table') return `/staff/reserve${where.search}`;
  if (where?.path === '/staff/reserve' || where?.path === '/staff/slots') return where.target;
  return '/staff/slots';
}