begin;
insert into auth.users(id,email) values ('a3000000-0000-4000-8000-000000000001','payment-read@example.test');
insert into public.companies(id,name) values ('b3000000-0000-4000-8000-000000000001','Read fixture');
insert into public.company_members(company_id,user_id,role) values ('b3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','admin');
insert into app_private.payment_reservations(id,company_id,order_id,action_id,chain_id,sender,nonce,token,destination,amount_atomic,state,tx_hash,signed_envelope)
values ('b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003','read',42161,'0x0000000000000000000000000000000000000001',50002,'0x59863989d080b22476db95656d0c3cc18be92214','0x0000000000000000000000000000000000000002','100','prepared','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','{"secret":"do not expose"}');
set local role service_role;
do $$ declare value jsonb; begin
  value := public.read_order_payment('b3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003');
  if value->>'status' is distinct from 'prepared' or value->>'amount_atomic' is distinct from '100' or value ? 'signed_envelope' or value::text like '%do not expose%' then raise exception 'unsafe or incorrect payment DTO'; end if;
end $$;
reset role;
delete from public.company_members where company_id='b3000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  begin
    perform public.read_order_payment('b3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003');
    raise exception 'read after membership revocation was accepted';
  exception when raise_exception then if sqlerrm not like 'FORBIDDEN: membership required%' then raise; end if; end;
end $$;
rollback;
