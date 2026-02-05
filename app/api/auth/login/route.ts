import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SESSION_COOKIE_NAME = 'app_user_id'
const SESSION_MAX_AGE = 365 * 24 * 60 * 60 // 1 año en segundos

function setSessionCookie(res: NextResponse, userId: string) {
  res.cookies.set(SESSION_COOKIE_NAME, userId, {
    path: '/',
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  
  // Cookie adicional accesible desde el cliente para verificación rápida
  res.cookies.set('app_logged_in', 'true', {
    path: '/',
    maxAge: SESSION_MAX_AGE,
    httpOnly: false, // Accesible desde JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    console.log('[v0] Login API - email:', email)

    const supabase = await createClient()

    // Check if user exists (don't use .single() to avoid error when user doesn't exist)
    const { data: existingUsers, error: selectError } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)

    if (selectError) {
      console.error('[v0] Database error:', selectError)
      throw selectError
    }

    console.log('[v0] Existing users found:', existingUsers?.length || 0)

    // Si el email no está registrado, no crear usuario; devolver error.
    if (!existingUsers || existingUsers.length === 0) {
      return NextResponse.json(
        { error: 'Email no registrado' },
        { status: 401 }
      )
    }

    console.log('[v0] Returning existing user')
    const user = existingUsers[0]
    const res = NextResponse.json({
      user,
      isNew: false,
    })
    setSessionCookie(res, user.id)
    return res
  } catch (error: any) {
    console.error('[v0] Login API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
