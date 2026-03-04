import { NextRequest, NextResponse } from 'next/server'

// Generate a simple WAV beep sound
function generateBeep(frequency: number, duration: number, sampleRate = 44100): Buffer {
  const numSamples = Math.floor(sampleRate * duration)
  const buffer = Buffer.alloc(44 + numSamples * 2)

  // WAV header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + numSamples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // Subchunk1Size
  buffer.writeUInt16LE(1, 20) // AudioFormat (PCM)
  buffer.writeUInt16LE(1, 22) // NumChannels
  buffer.writeUInt32LE(sampleRate, 24) // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28) // ByteRate
  buffer.writeUInt16LE(2, 32) // BlockAlign
  buffer.writeUInt16LE(16, 34) // BitsPerSample
  buffer.write('data', 36)
  buffer.writeUInt32LE(numSamples * 2, 40)

  // Generate sine wave with envelope
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const envelope = Math.min(1, Math.min(t * 20, (duration - t) * 20)) // Attack/release envelope
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5 * envelope
    const intSample = Math.floor(sample * 32767)
    buffer.writeInt16LE(intSample, 44 + i * 2)
  }

  return buffer
}

// Generate two-tone notification
function generateTwoToneBeep(): Buffer {
  const sampleRate = 44100
  const duration1 = 0.12
  const duration2 = 0.15
  const gap = 0.05
  const totalDuration = duration1 + gap + duration2
  const numSamples = Math.floor(sampleRate * totalDuration)
  const buffer = Buffer.alloc(44 + numSamples * 2)

  // WAV header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + numSamples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(numSamples * 2, 40)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    let sample = 0

    if (t < duration1) {
      // First tone (lower)
      const envelope = Math.min(1, Math.min(t * 30, (duration1 - t) * 30))
      sample = Math.sin(2 * Math.PI * 880 * t) * 0.4 * envelope
    } else if (t >= duration1 + gap) {
      // Second tone (higher)
      const t2 = t - duration1 - gap
      const envelope = Math.min(1, Math.min(t2 * 30, (duration2 - t2) * 30))
      sample = Math.sin(2 * Math.PI * 1100 * t2) * 0.4 * envelope
    }

    const intSample = Math.floor(sample * 32767)
    buffer.writeInt16LE(intSample, 44 + i * 2)
  }

  return buffer
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  let audioBuffer: Buffer

  if (type === 'new-ticket') {
    // Two-tone notification for new ticket
    audioBuffer = generateTwoToneBeep()
  } else if (type === 'new-message') {
    // Single short beep for new message
    audioBuffer = generateBeep(800, 0.1)
  } else {
    return NextResponse.json({ error: 'Invalid audio type' }, { status: 400 })
  }

  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
