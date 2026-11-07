-- Cotizaciones de proveedores (QUO-02, BRIEF §8). Las de llamadas las escribe
-- Voz (Bautista) con la clave de servicio; las de la web y las de ejemplo, el
-- CRM (Nano). Las leen el comparador (ORD-02) y el ranking (BUY-03).

-- Para que una cotización solo pueda apuntar a una llamada y a una compra de su
-- misma empresa. Solo agregan una restricción: `id` ya era único en las dos.
alter table public.calls add constraint calls_company_id_id_key unique (company_id, id);
alter table public.purchase_requests add constraint purchase_requests_company_id_id_key unique (company_id, id);

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- La compra que se cotiza (BUY-01, Vale). null solo en datos sueltos de prueba.
  purchase_request_id uuid,
  supplier_contact_id uuid not null,
  call_id uuid,
  source text not null check (source in ('call', 'web', 'example')),
  can_supply text not null check (can_supply in ('yes', 'partial', 'no', 'unknown')),
  -- Un dato que el proveedor no dijo es null: nunca 0 ni texto vacío.
  unit_price numeric(14, 2) check (unit_price is null or unit_price > 0),
  currency text check (currency is null or currency in ('ARS', 'USD', 'unknown')),
  price_includes_vat text check (price_includes_vat is null or price_includes_vat in ('yes', 'no', 'unknown')),
  available_quantity integer check (available_quantity is null or available_quantity >= 0),
  minimum_order_quantity integer check (minimum_order_quantity is null or minimum_order_quantity >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 365),
  lead_time_text text check (lead_time_text is null or length(btrim(lead_time_text)) between 1 and 200),
  delivery_included text check (delivery_included is null or delivery_included in ('yes', 'no', 'unknown')),
  accepts_argt text not null check (accepts_argt in ('yes', 'no', 'unknown')),
  payment_terms text check (payment_terms is null or length(btrim(payment_terms)) between 1 and 300),
  notes text check (notes is null or length(btrim(notes)) between 1 and 1000),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  -- El proveedor, la llamada y la compra son de la misma empresa que la cotización.
  foreign key (company_id, supplier_contact_id) references public.contacts(company_id, id),
  foreign key (company_id, call_id) references public.calls(company_id, id),
  foreign key (company_id, purchase_request_id) references public.purchase_requests(company_id, id) on delete cascade,
  -- Una llamada da como máximo una cotización: reprocesar el aviso no la duplica.
  unique (call_id),
  -- Solo las cotizaciones de llamadas tienen llamada, y todas la tienen.
  check ((source = 'call') = (call_id is not null))
);

create index supplier_quotes_company_request_idx
  on public.supplier_quotes(company_id, purchase_request_id, created_at desc);
create index supplier_quotes_company_supplier_idx
  on public.supplier_quotes(company_id, supplier_contact_id, created_at desc);

alter table public.supplier_quotes enable row level security;

revoke all on public.supplier_quotes from public, anon, authenticated;
grant select on public.supplier_quotes to authenticated;

create policy "members can read their company supplier quotes" on public.supplier_quotes
  for select to authenticated using (
    exists (
      select 1 from public.company_members as member
      where member.company_id = supplier_quotes.company_id and member.user_id = (select auth.uid())
    )
  );
