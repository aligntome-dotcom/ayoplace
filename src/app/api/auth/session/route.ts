import { handleSession } from '@/lib/auth/handlers'

export const dynamic = 'force-dynamic'

// Read-only: reports the verified session state and never writes cookies.
export async function GET(): Promise<Response> {
  return handleSession()
}
