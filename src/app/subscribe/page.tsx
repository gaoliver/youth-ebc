'use client';

import { useEffect, useState } from 'react';

export default function SubscribePage() {
  const [feedUrl, setFeedUrl] = useState('');

  useEffect(() => {
    // Pega o domínio atual automaticamente
    const host = window.location.host;
    setFeedUrl(`${host}/api/calendar.ics`);
  }, []);

  if (!feedUrl) return null;

  const appleUrl = `webcal://${feedUrl}`;
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${feedUrl}`)}`;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      textAlign: 'center',
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: '#1e293b',
        borderRadius: '16px',
        padding: '32px 24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          📅 EBC Youth Calendar
        </h1>
        <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '28px', lineHeight: '1.5' }}>
          Subscribe to automatically sync all group meetings, parties, and birthdays to your phone.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Botão Apple Calendar */}
          <a
            href={appleUrl}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '16px',
              padding: '14px 20px',
              borderRadius: '10px',
              textDecoration: 'none',
            }}
          >
             Subscribe on Apple Calendar
          </a>

          {/* Botão Google Calendar */}
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              backgroundColor: '#334155',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '16px',
              padding: '14px 20px',
              borderRadius: '10px',
              textDecoration: 'none',
            }}
          >
            Google Calendar
          </a>
        </div>

        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '24px' }}>
          Events update automatically. No manual refresh needed.
        </p>
      </div>
    </div>
  );
}