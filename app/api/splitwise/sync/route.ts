import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { app_user_id, group_id } = await request.json()

    if (!app_user_id) {
      return NextResponse.json(
        { error: 'app_user_id is required' },
        { status: 400 }
      )
    }

    if (!group_id) {
      return NextResponse.json(
        { error: 'group_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get Splitwise token from environment variable or user preferences
    // For now, using environment variable. Can be extended to store per-user tokens
    const splitwiseToken = process.env.SPLITWISE_TOKEN

    if (!splitwiseToken) {
      return NextResponse.json(
        { error: 'Splitwise token not configured. Please set SPLITWISE_TOKEN environment variable.' },
        { status: 400 }
      )
    }

    // Get last sync timestamp to only fetch updated expenses
    const { data: syncStatus } = await supabase
      .from('splitwise_sync_status')
      .select('last_successful_sync_at')
      .eq('app_user_id', app_user_id)
      .single()

    // Build Splitwise API URL with updated_after for incremental sync
    // and limit=0 to get ALL expenses (no pagination limit)
    const params = new URLSearchParams({
      group_id: String(group_id),
      limit: '0', // 0 = no limit, returns all expenses
    })

    // If we have a previous sync, only fetch expenses updated since then
    // Subtract 5 minutes as safety margin for clock drift
    if (syncStatus?.last_successful_sync_at) {
      const lastSync = new Date(syncStatus.last_successful_sync_at)
      lastSync.setMinutes(lastSync.getMinutes() - 5)
      params.set('updated_after', lastSync.toISOString())
    }

    // Call Splitwise API
    const splitwiseResponse = await fetch(
      `https://secure.splitwise.com/api/v3.0/get_expenses?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${splitwiseToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!splitwiseResponse.ok) {
      const errorText = await splitwiseResponse.text()
      console.error('[Splitwise] API error:', splitwiseResponse.status, errorText)
      return NextResponse.json(
        { error: `Splitwise API error: ${splitwiseResponse.status}` },
        { status: splitwiseResponse.status }
      )
    }

    const splitwiseData = await splitwiseResponse.json()

    // Log the response structure for debugging
    console.log('[Splitwise] Received data:', {
      hasExpenses: !!splitwiseData.expenses,
      expenseCount: splitwiseData.expenses?.length || 0,
      updatedAfter: params.get('updated_after') || 'full sync',
    })

    // Pass the FULL JSON response directly to PostgreSQL function
    // PostgreSQL will handle all parsing and transformation
    const { error } = await supabase.rpc('sync_splitwise_expenses', {
      p_payload: splitwiseData,
      p_app_user_id: app_user_id,
    })

    if (error) {
      console.error('[Splitwise Sync] RPC error:', error)
      return NextResponse.json(
        { error: 'Database sync failed', details: error },
        { status: 500 }
      )
    }

    // Actualizar last_sync_at en splitwise_sync_status para el cooldown de 3 min
    await supabase
      .from('splitwise_sync_status')
      .upsert(
        {
          app_user_id: app_user_id,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'app_user_id' }
      )

    return NextResponse.json({
      success: true,
      message: 'Splitwise expenses synced successfully',
    })
  } catch (err: any) {
    console.error('[Splitwise] FULL sync error', {
      message: err?.message,
      details: err?.details,
      hint: err?.hint,
      code: err?.code,
      stack: err?.stack,
    })

    return new Response(
      JSON.stringify({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
      }),
      { status: 500 }
    )
  }
}
