export async function GET() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    return new NextResponse('Notion credentials not configured in .env.local', { status: 500 });
  }

  try {
    const data = await queryNotionDatabase(databaseId, token);
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EBC Youth//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:EBC Youth',
      'X-WR-TIMEZONE:Europe/Amsterdam',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Amsterdam',
      'X-LIC-LOCATION:Europe/Amsterdam',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'DTSTART:19700329T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'DTSTART:19701025T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE',
    ];

    // --- Loop through events (FIXED) ---
    for (const page of data.results || []) {
      const dateProp = page.properties?.Date?.date;
      if (!dateProp) continue;

      const start = dateProp.start;
      const end = dateProp.end; // Notion's end is exclusive for all-day, or exact for timed
      if (!start) continue;

      const isAllDay = !start.includes('T');
      const title = page.properties?.Name?.title?.[0]?.plain_text || 'Untitled';

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${page.id}@ebc-youth`);
      lines.push(`SUMMARY:${escapeICalText(title)}`);
      lines.push(`DTSTAMP:${now}`);

      // --- DTSTART ---
      // For all-day: just the date, no timezone.
      // For timed: convert to Amsterdam time.
      const startLine = formatDT(start, isAllDay, false);
      lines.push(`DTSTART${startLine.line}`);

      // --- DTEND ---
      let endDate = end;
      if (isAllDay) {
        // All-day events MUST have an exclusive DTEND.
        // If Notion didn't give one, add 1 day to the start date.
        if (!endDate) {
          const d = new Date(start + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          endDate = d.toISOString().split('T')[0]; // YYYY-MM-DD
        }
        // Notion's end is already exclusive, so we pass isEnd: false.
        // This prevents adding an extra day.
        const endLine = formatDT(endDate, true, false);
        lines.push(`DTEND${endLine.line}`);
      } else {
        // Timed events
        if (endDate) {
          // Notion's end is the exact datetime (already exclusive).
          const endLine = formatDT(endDate, false, false);
          lines.push(`DTEND${endLine.line}`);
        } else {
          // No end time provided – default to +1 hour
          const d = new Date(start);
          d.setHours(d.getHours() + 1);
          const endLine = formatDT(d.toISOString(), false, false);
          lines.push(`DTEND${endLine.line}`);
        }
      }

      // (Optional) Add description from page blocks
      // const description = await getPageBlocksText(page.id, token);
      // if (description) lines.push(`DESCRIPTION:${escapeICalText(description)}`);

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const ics = lines.join('\r\n');

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="calendar.ics"',
      },
    });
  } catch (error) {
    console.error(error);
    return new NextResponse('Failed to generate calendar', { status: 500 });
  }
}