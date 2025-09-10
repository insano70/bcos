import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import { nanoid } from 'nanoid'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-key')

export async function signJWT(payload: JWTPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(nanoid())
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret)
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}

export async function refreshJWT(token: string): Promise<string | null> {
  const payload = await verifyJWT(token)
  if (!payload) return null
  
  return await signJWT({
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    firstName: payload.firstName,
    lastName: payload.lastName
  })
}

export function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return null
}
