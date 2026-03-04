import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * POST /api/admin/create-user
 * 
 * Creates a user using the Supabase Admin API with service_role key.
 * This bypasses rate limits for user creation.
 * 
 * IMPORTANT: This endpoint should only be called from authenticated admin users.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, nome } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Create admin client with service_role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Create user using admin API - bypasses rate limits
    // Normalize email to lowercase to prevent login issues
    const normalizedEmail = email.trim().toLowerCase()
    
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { nome },
    })

    if (createError) {
      console.error('Error creating user:', createError)
      return NextResponse.json(
        { error: createError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
      },
    })
  } catch (error) {
    console.error('Error in create-user API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
