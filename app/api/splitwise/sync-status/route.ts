import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'app_user_id'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!userId) {
      return NextResponse.json({ error: 'No session' }, { status: 401 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('splitwise_sync_status')
      .select('last_sync_at')
      .eq('app_user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[Splitwise] sync-status error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      last_sync_at: data?.last_sync_at ?? null,
    })
    
    // Evitar caché en PWA/Safari para que siempre obtenga el estado actual
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
  } catch (err: any) {
    console.error('[Splitwise] sync-status error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
