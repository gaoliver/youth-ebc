import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || 'youth-ebc.vercel.app';
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();

  const isApple = /iphone|ipad|ipod|macintosh/.test(userAgent);
  // const isAndroid = /android/.test(userAgent);

  if (isApple) {
    // Redireciona Apple Calendar nativo para inscrição automática
    const webcalUrl = `webcal://${host}/api/calendar.ics`;
    return NextResponse.redirect(webcalUrl, 307);
  }

  // Para Android ou navegadores desktop: abre tela direta de adicionar feed no Google Calendar
  const encodedFeedUrl = encodeURIComponent(`webcal://${host}/api/calendar.ics`);
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?cid=${encodedFeedUrl}`;

  return NextResponse.redirect(googleCalendarUrl, 307);
}