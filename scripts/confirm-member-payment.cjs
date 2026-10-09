/* eslint-disable @typescript-eslint/no-require-imports -- Explicit owner-authorized fund operation. */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('@next/env').loadEnvConfig(process.cwd());
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const name = arg('--member');
const month = arg('--month');
const amount = Number(arg('--amount'));
assert(process.argv.includes('--apply') && name && /^\d{4}-\d{2}$/.test(month) && Number.isSafeInteger(amount) && amount > 0, 'Required: --member NAME --month YYYY-MM --amount VND --apply');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbUrl = new URL(process.env.TASK_DATABASE_URL);
const project = 'qtuqndmukmarqsbtqpad';
assert(new URL(url).hostname === `${project}.supabase.co` && (dbUrl.username === `postgres.${project}` || dbUrl.hostname === `db.${project}.supabase.co`), 'Database/API project mismatch');
const db = new Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const version = '20261009000700';
const migrationName = 'admin_confirmed_due_payments';
const sql = fs.readFileSync(`supabase/migrations/${version}_${migrationName}.sql`, 'utf8');

(async () => {
  let committed = false;
  try {
    await db.connect(); await db.query('begin');
    await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(hashtext('2amfc_fund'))");
    await db.query('lock table public.payment_submissions, public.monthly_dues, public.fund_ledger in access exclusive mode');
    const admin = (await db.query('select a.admin_user_id,u.email from public.admin_settings a join auth.users u on u.id=a.admin_user_id')).rows;
    assert(admin.length === 1 && admin[0].email === 'khasnhng@gmail.com', 'Unexpected admin');
    const rows = (await db.query('select m.id,m.full_name,d.id as due_id,d.amount_due from public.members m join public.monthly_dues d on d.member_id=m.id where lower(m.full_name)=lower($1) and d.obligation_month=$2', [name, month])).rows;
    assert(rows.length === 1 && Number(rows[0].amount_due) === amount, 'Member/month/amount mismatch');
    const member = rows[0];
    const before = Number((await db.query('select public.fund_balance() as n')).rows[0].n);
    const existing = (await db.query("select id,status from public.payment_submissions where due_id=$1 and status in ('pending','approved')", [member.due_id])).rows;
    assert(existing.length <= 1 && existing[0]?.status !== 'pending', 'A pending receipt must be reviewed first');
    const alreadyPaid = existing[0]?.status === 'approved';
    const backupDir = path.resolve('supabase/.temp', 'before-member-payment-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = { project, member, month, before, createdAt: new Date().toISOString(), tables: {} };
    for (const table of ['fund_ledger', 'payment_submissions', 'monthly_dues', 'fund_periods']) backup.tables[table] = (await db.query('select * from public.' + table)).rows;
    fs.writeFileSync(path.join(backupDir, 'database.json'), JSON.stringify(backup, null, 2));
    if (!(await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version])).rowCount) {
      await db.query(sql);
      await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])', [version, migrationName, [sql]]);
    }
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: admin[0].admin_user_id, role: 'authenticated' })]);
    const note = `Chủ đội xác nhận ${member.full_name} đã đóng quỹ tháng ${month}, số tiền ${amount} đ. Ghi thu theo xác nhận; chưa cung cấp biên lai, ngày chuyển tiền hoặc phương thức thanh toán.`;
    const id = (await db.query('select public.admin_confirm_due_payment($1::uuid,$2::numeric,$3::text) as id', [member.due_id, amount, note])).rows[0].id;
    const after = Number((await db.query('select public.fund_balance() as n')).rows[0].n);
    assert(after === before + (alreadyPaid ? 0 : amount), 'Unexpected balance change');
    if (!alreadyPaid) {
      assert((await db.query("select count(*)::int as n from public.fund_ledger where source_type='payment_submission' and source_id=$1 and amount=$2 and member_id=$3 and obligation_month=$4", [id, amount, member.id, month])).rows[0].n === 1, 'Missing or duplicate ledger posting');
    }
    // Retry inside the same transaction verifies that a repeated confirmation cannot add money again.
    assert((await db.query('select public.admin_confirm_due_payment($1,$2,$3) as id', [member.due_id, amount, note])).rows[0].id === id, 'Retry returned a different payment');
    assert(Number((await db.query('select public.fund_balance() as n')).rows[0].n) === after, 'Retry added money');
    await db.query('commit'); committed = true;
    const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const [summary, dues, unpaid] = await Promise.all([
      guest.rpc('pub_fund_summary', { p_month: month }),
      guest.from('pub_dues').select('member_id,status').eq('obligation_month', month),
      guest.rpc('pub_unpaid', { p_month: month }),
    ]);
    for (const response of [summary, dues, unpaid]) if (response.error) throw new Error(response.error.message);
    assert(dues.data.find(d => d.member_id === member.id)?.status === 'paid', 'Public paid status mismatch');
    assert(!unpaid.data.some(d => d.member_id === member.id), 'Member still listed as unpaid');
    assert(summary.data.balance === after, 'Public balance mismatch');
    const result = { member: member.full_name, month, recordedAmount: alreadyPaid ? 0 : amount, alreadyPaid, before, after, paidMembers: dues.data.filter(d => d.status === 'paid').length, unpaidMembers: unpaid.data.length, summary: summary.data, backupDir };
    fs.writeFileSync(path.join(backupDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    if (!committed) await db.query('rollback').catch(() => {});
    if (committed) console.error('Database committed; retry public verification before recording another payment.');
    throw e;
  } finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
