import { handleLogin } from '@/lib/auth/handlers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handleLogin(request)
}
