-- Runs inside a disposable database with ORD-01/03 and QUO-02 installed.
-- No network, wallet key, signing or transfer is involved.
begin;
do $$ begin
  if has_function_privilege('anon','public.claim_order_payment(uuid,uuid,uuid,text,integer,integer,text,text,bigint)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_order_payment(uuid,uuid,uuid,text,integer,integer,text,text,bigint)','EXECUTE') then
    raise exception 'claim is accessible to non-server roles';
  end if;
end $$;
insert into auth.users(id,email) values ('a0000000-0000-4000-8000-000000000001','claim-a@example.test');
insert into public.companies(id,name) values ('b0000000-0000-4000-8000-000000000001','Claim fixture');
insert into public.company_members(company_id,user_id,role) values ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','admin');
insert into public.contacts(id,company_id,name,phone_e164,source) values ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Proveedor de prueba','+12025550101','{}');
insert into public.supplier_profiles(company_id,contact_id,collection_chain,collection_address,wallet_version,wallet_updated_at) values ('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','arbitrum','0x0000000000000000000000000000000000000002',1,now());
insert into public.purchase_requests(id,company_id,product,quantity,needed_by,budget_atomic) values ('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Insumo',1,'2030-01-01',10000000000000000000);
insert into public.purchase_policies(company_id,max_per_purchase_atomic,auto_pay_limit_atomic) values ('b0000000-0000-4000-8000-000000000001',10000000000000000000,0);
insert into public.supplier_quotes(id,company_id,purchase_request_id,supplier_contact_id,source,source_url,can_supply,unit_price,currency,accepts_argt,summary) values ('e0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','web','https://example.test/quote','yes',1,'ARS','yes','Prueba');
insert into public.purchase_orders(id,company_id,purchase_request_id,supplier_quote_id,supplier_contact_id,product,quantity,unit,supplier_name,quote_source,quoted_unit_price,quoted_total,quoted_currency,amount_atomic,pricing_status,status,version,wallet_chain,wallet_address,wallet_version,quote_snapshot,request_snapshot,supplier_snapshot,policy_snapshot,created_by,approved_by,approved_at)
select 'f0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Insumo',1,'','Proveedor de prueba','web',1,1,'ARS',1000000000000000000,'ready','approved',2,'arbitrum','0x0000000000000000000000000000000000000002',1,c->'quote',c->'request',c->'supplier',c->'policy','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',now() from (select app_private.purchase_order_context('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001') c) snapshot;
insert into public.calls(id,company_id,contact_id,action_id,provider,transport,status) values ('a1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','fixture-call','mock','mock','completed');
update public.supplier_quotes set source='call',source_url=null,call_id='a1000000-0000-4000-8000-000000000001' where id='e0000000-0000-4000-8000-000000000001';
update public.purchase_orders set quote_source='call',quote_snapshot=(select to_jsonb(q) from public.supplier_quotes q where id='e0000000-0000-4000-8000-000000000001') where id='f0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  begin
    perform public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','mock-call',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',7);
    raise exception 'mock call was accepted';
  exception when raise_exception then if sqlerrm not like 'FORBIDDEN: call is not a completed real phone call%' then raise; end if; end;
end $$;
reset role;
update public.calls set provider='vapi',transport='phone',provider_call_id='fixture-real-phone' where id='a1000000-0000-4000-8000-000000000001';
savepoint before_phone_claim;
set local role service_role;
do $$ declare claimed jsonb; begin
  claimed := public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','real-phone',2,42161,'0x0000000000000000000000000000000000000008','0x59863989d080b22476db95656d0c3cc18be92214',7);
  if claimed->>'state' is distinct from 'reserved' then raise exception 'real phone fixture was not reserved'; end if;
end $$;
rollback to savepoint before_phone_claim;
update public.supplier_quotes set source='web',source_url='https://example.test/quote',call_id=null where id='e0000000-0000-4000-8000-000000000001';
update public.purchase_orders set quote_source='web',quote_snapshot=(select to_jsonb(q) from public.supplier_quotes q where id='e0000000-0000-4000-8000-000000000001') where id='f0000000-0000-4000-8000-000000000001';
update public.purchase_policies set max_per_purchase_atomic = 20000000000000000000 where company_id = 'b0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  begin
    perform public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','stale',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',7);
    raise exception 'stale policy was accepted';
  exception when raise_exception then if sqlerrm not like 'CONFLICT: approved conditions changed%' then raise; end if; end;
end $$;
reset role;
update public.purchase_policies set max_per_purchase_atomic = 10000000000000000000 where company_id = 'b0000000-0000-4000-8000-000000000001';
update public.supplier_profiles set collection_address = '0x0000000000000000000000000000000000000003', wallet_version = 2 where company_id = 'b0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  begin
    perform public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','stale-wallet',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',7);
    raise exception 'stale wallet was accepted';
  exception when raise_exception then if sqlerrm not like 'CONFLICT: approved conditions changed%' then raise; end if; end;
end $$;
reset role;
update public.supplier_profiles set collection_address = '0x0000000000000000000000000000000000000002', wallet_version = 1 where company_id = 'b0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare a jsonb; b jsonb; begin
  a := public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','first',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',7);
  b := public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','second',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',12);
  if a->>'id' is distinct from b->>'id' or b->>'nonce' is distinct from '7' then raise exception 'replay changed reservation or nonce'; end if;
  if a->>'destination' is distinct from '0x0000000000000000000000000000000000000002' or a->>'amount_atomic' is distinct from '1000000000000000000' then raise exception 'claim does not use approved order details'; end if;
end $$;
reset role;
delete from public.company_members where company_id = 'b0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ begin
  begin
    perform public.claim_order_payment('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','first',2,42161,'0x0000000000000000000000000000000000000001','0x59863989d080b22476db95656d0c3cc18be92214',7);
    raise exception 'replay without membership was accepted';
  exception when raise_exception then if sqlerrm not like 'FORBIDDEN: admin membership required%' then raise; end if; end;
end $$;
rollback;
