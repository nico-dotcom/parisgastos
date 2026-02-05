import { NextResponse } from 'next/server'

const SESSION_COOKIE_NAME = 'app_user_id'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  
  // Limpiar cookie httpOnly del servidor
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  
  // Limpiar cookie accesible desde el cliente
  res.cookies.set('app_logged_in', '', {
    path: '/',
    maxAge: 0,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  
  return res
}
