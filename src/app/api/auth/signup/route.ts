import { handleSignup } from '@/lib/auth/handlers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handleSignup(request)
}
