import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];

if (!projectId) {
  throw new Error("Could not read project_id from supabase/config.toml");
}

const containerName = `supabase_db_${projectId}`;
const companyId = randomUUID();
const actorId = randomUUID();
const actionId = `concurrency-${randomUUID()}`;
const schemaName = `test_idem_${randomUUID().replaceAll("-", "")}`;
const payload = `'{"operation":"concurrent-test","amount":1}'::jsonb`;

async function query(sql) {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      containerName,
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  );

  return stdout.trim();
}

const setupSql = `
  create schema ${schemaName};
  create table ${schemaName}.counter (company_id uuid primary key, value integer not null);
  create function ${schemaName}.apply_once(
    p_company_id uuid, p_actor_id uuid, p_action_id text, p_payload jsonb
  ) returns jsonb language plpgsql as $$
  declare
    v_claimed boolean;
    v_cached jsonb;
    v_count integer;
    v_result jsonb;
  begin
    select claim.claimed, claim.cached_result into v_claimed, v_cached
      from app_private.claim_action(
        p_company_id, 'user', p_actor_id, p_action_id, 'test.concurrent', p_payload
      ) as claim;

    if not v_claimed then
      return v_cached;
    end if;

    perform pg_sleep(3);
    insert into ${schemaName}.counter as current_counter (company_id, value)
      values (p_company_id, 1)
      on conflict (company_id) do update set value = current_counter.value + 1
      returning value into v_count;

    v_result := jsonb_build_object('count', v_count);
    perform app_private.complete_action(p_company_id, p_action_id, v_result);
    return v_result;
  end;
  $$;
`;

const callSql = `select ${schemaName}.apply_once(
  '${companyId}', '${actorId}', '${actionId}', ${payload}
);`;

try {
  await query(setupSql);

  const [firstOutput, secondOutput] = await Promise.all([query(callSql), query(callSql)]);
  const firstResult = JSON.parse(firstOutput);
  const secondResult = JSON.parse(secondOutput);
  const finalCount = Number(await query(
    `select value from ${schemaName}.counter where company_id = '${companyId}';`,
  ));
  const receiptCount = Number(await query(
    `select count(*) from app_private.action_receipts where company_id = '${companyId}' and action_id = '${actionId}';`,
  ));

  if (JSON.stringify(firstResult) !== JSON.stringify(secondResult)) {
    throw new Error(`Concurrent responses differed: ${firstOutput} vs ${secondOutput}`);
  }
  if (finalCount !== 1 || receiptCount !== 1 || firstResult.count !== 1) {
    throw new Error(`Expected one mutation and receipt; got count=${finalCount}, receipts=${receiptCount}`);
  }

  process.stdout.write("Concurrent duplicate requests returned one stored result and applied the mutation once.\n");
} finally {
  await query(`drop schema if exists ${schemaName} cascade;`);
  await query(
    `delete from app_private.action_receipts where company_id = '${companyId}' and action_id = '${actionId}';`,
  );
}
