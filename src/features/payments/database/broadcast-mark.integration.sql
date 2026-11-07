-- Isolated database only: no RPC network access, signatures or actual transfers.
begin;
insert into public.companies(id,name) values ('b1000000-0000-4000-8000-000000000001','Broadcast fixture');
insert into app_private.payment_reservations(id,company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic,state,tx_hash,signed_envelope)
values ('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','broadcast',42161,'0x0000000000000000000000000000000000000001',50000,'0x59863989d080b22476db95656d0c3cc18be92214','0x0000000000000000000000000000000000000002','100','prepared','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{}');
do $$ begin
  if has_function_privilege('anon','public.mark_payment_broadcast(uuid,uuid,uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.mark_payment_broadcast(uuid,uuid,uuid,text)','EXECUTE') then raise exception 'broadcast mark exposed to public roles'; end if;
end $$;
set local role service_role;
do $$ declare first_result boolean; retry_result boolean; begin
  first_result := public.mark_payment_broadcast('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  retry_result := public.mark_payment_broadcast('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  if first_result is not true or retry_result is not false then raise exception 'broadcast mark must be acquired exactly once'; end if;
end $$;
rollback;
