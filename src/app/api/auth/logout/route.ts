import { handleLogout } from '@/lib/auth/handlers'

export const dynamic = 'force-dynamic'

// Clears the browser session cookie. This is not a Xano token revocation:
// the token stays valid at Xano until it expires or the account changes.
export async function POST(request: Request): Promise<Response> {
  return handleLogout(request)
}
