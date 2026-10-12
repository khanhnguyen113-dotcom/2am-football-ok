/* eslint-disable @typescript-eslint/no-require-imports -- Owner-authorized roster changes. */
// Preview by default. Set TASK_DATABASE_URL securely, then run with --apply.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('@next/env').loadEnvConfig(process.cwd());
const project = 'qtuqndmukmarqsbtqpad';
const changes = [
  { id: '943863ce-df53-45e8-afdf-ca882d73fa21', name: 'Nguyễn Quốc Huy', status: 'active', fee_type: 'student_exempt' },
  { id: '50068772-d983-483f-a4c9-b67d3c156e27', name: 'Đặng Tiến Sơn', status: 'active', fee_type: 'student_exempt' },
  { id: 'e142c663-10d3-4aaa-be58-006ea6fd50d2', name: 'Đặng Minh', status: 'paused' },
  { id: '398c413a-28fc-4603-85f8-66256173ffb8', name: 'Đức nhỏ', status: 'paused' },
  { id: '8298eca9-ce12-457b-89db-d2451f3d6ec6', name: 'Mạnh Captain', status: 'paused' },
  { id: 'e1a35541-df37-4f2a-bc3d-99f93de5ebd0', name: 'Thái Chocoo', status: 'paused' },
];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const apply = process.argv.includes('--apply');

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert(new URL(url).hostname === `${project}.supabase.co`, 'Unexpected API project');
  const api = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const read = await api.from('pub_members').select('id,full_name,status,fee_type').in('id', changes.map(c => c.id));
  if (read.error) throw new Error(read.error.message);
  for (const c of changes) assert(read.data.find(m => m.id === c.id)?.full_name === c.name, `Member mismatch: ${c.name}`);
  console.log(JSON.stringify({ apply, changes, before: read.data }, null, 2));
  if (!apply) return;
  assert(process.env.TASK_DATABASE_URL, 'Missing TASK_DATABASE_URL; no changes applied');
  const dbUrl = new URL(process.env.TASK_DATABASE_URL);
  assert(dbUrl.username === `postgres.${project}` || dbUrl.hostname === `db.${project}.supabase.co`, 'Unexpected database project');
  const db = new Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  let committed = false;
  try {
    await db.connect();
    await db.query('begin');
    await db.query("set local lock_timeout = '10s'");
    await db.query("select pg_advisory_xact_lock(hashtext('2amfc_member_classifications'))");
    const admin = (await db.query('select admin_user_id from public.admin_settings')).rows;
    assert(admin.length === 1 && admin[0].admin_user_id, 'Missing configured admin');
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin[0].admin_user_id, role: 'authenticated' })]);
    const before = (await db.query('select * from public.members where id = any($1::uuid[]) for update', [changes.map(c => c.id)])).rows;
    for (const c of changes) assert(before.find(m => m.id === c.id)?.full_name === c.name, `Member changed: ${c.name}`);
    const backupDir = path.resolve('supabase/.temp', 'before-member-classifications-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(backupDir, { recursive: true });
    const balance = Number((await db.query('select public.fund_balance() as n')).rows[0].n);
    const dues = (await db.query('select * from public.monthly_dues where member_id = any($1::uuid[])', [changes.map(c => c.id)])).rows;
    fs.writeFileSync(path.join(backupDir, 'database.json'), JSON.stringify({ before, dues, balance }, null, 2));
    for (const [version, name] of [['20261012000100', 'student_exempt'], ['20261012000200', 'missing_vote_penalties']]) {
      if ((await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version])).rowCount) continue;
      const sql = fs.readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8');
      await db.query(sql);
      await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])', [version, name, [sql]]);
    }
    const note = 'Chủ đội xác nhận HSSV miễn quỹ nhưng vẫn phải vote; bốn thành viên nghỉ tạm được miễn vote.';
    await db.query("select public.set_ctx('admin', null, null, $1)", [note]);
    for (const c of changes) {
      await db.query('update public.members set status=$2, fee_type=coalesce($3,fee_type) where id=$1 and (status is distinct from $2 or ($3::text is not null and fee_type is distinct from $3))', [c.id, c.status, c.fee_type ?? null]);
      if (!c.fee_type) continue;
      // Exempt only open, unpaid dues. Preserve receipts, prior income and closed books.
      const adjustable = (await db.query(`select d.id from public.monthly_dues d
        join public.fund_periods p on p.month=d.obligation_month
        where d.member_id=$1 and p.status='open' and d.amount_due>0
        and not exists(select 1 from public.payment_submissions s where s.due_id=d.id and s.status in ('pending','approved'))`, [c.id])).rows;
      for (const d of adjustable) await db.query('select public.admin_adjust_due($1,0,$2)', [d.id, 'HSSV được chủ đội miễn quỹ']);
    }
    await db.query('select public.refresh_auto_lineups()');
    assert(Number((await db.query('select public.fund_balance() as n')).rows[0].n) === balance, 'Unexpected ledger change');
    await db.query('commit'); committed = true;
    const after = await api.from('pub_members').select('id,full_name,status,fee_type').in('id', changes.map(c => c.id));
    if (after.error) throw new Error(after.error.message);
    for (const c of changes) {
      const m = after.data.find(m => m.id === c.id);
      assert(m?.status === c.status && (!c.fee_type || m.fee_type === c.fee_type), `Verification failed: ${c.name}`);
    }
    console.log(JSON.stringify({ updated: after.data, backupDir, balance }, null, 2));
  } catch (error) {
    if (!committed) await db.query('rollback').catch(() => {});
    else console.error('Committed; verify public data before retrying.');
    throw error;
  } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
