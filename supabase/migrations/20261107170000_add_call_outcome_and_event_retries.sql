-- Voz (Bautista, TRA-48): resultado procesado de cada llamada y reintentos de avisos.
-- calls guarda lo que se muestra en /calls/[id]; los miembros de la empresa ya lo
-- leen por la política existente. voice_events agrega lo necesario para procesar
-- cada aviso una sola vez y reintentar si algo falla.

alter table public.calls
  add column ended_at timestamptz,
  add column recording_url text check (recording_url is null or recording_url ~* '^https?://'),
  add column transcript text,
  -- CallResultV1 normalizado que se entregó al CRM.
  add column result jsonb check (result is null or jsonb_typeof(result) = 'object');

alter table public.voice_events
  add column attempts integer not null default 0 check (attempts >= 0),
  -- Reserva temporal mientras un proceso trabaja el aviso (webhook o cron).
  add column locked_until timestamptz,
  add column last_error text;

create index voice_events_pending_reports_idx on public.voice_events(received_at)
  where processed_at is null and event_type = 'end-of-call-report';
