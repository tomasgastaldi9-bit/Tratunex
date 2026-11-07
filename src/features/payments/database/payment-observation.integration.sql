begin;
insert into public.companies(id,name) values ('b2000000-0000-4000-8000-000000000001','Observation fixture');
insert into app_private.payment_reservations(id,company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic,state,tx_hash,signed_envelope)
values ('b2000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','observation',42161,'0x0000000000000000000000000000000000000001',50001,'0x59863989d080b22476db95656d0c3cc18be92214','0x0000000000000000000000000000000000000002','100','prepared','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}');
insert into app_private.payment_broadcast_marks(reservation_id,tx_hash) values ('b2000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
set local role service_role;
do $$ declare value text; begin
  value := public.record_payment_observation('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','pending');
  if value is distinct from 'pending' then raise exception 'pending observation missing'; end if;
  value := public.record_payment_observation('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','confirmed');
  if value is distinct from 'confirmed' then raise exception 'confirmation missing'; end if;
  value := public.record_payment_observation('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','unknown');
  if value is distinct from 'confirmed' then raise exception 'terminal state regressed'; end if;
end $$;
rollback;
