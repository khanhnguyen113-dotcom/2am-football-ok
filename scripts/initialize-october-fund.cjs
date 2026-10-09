/* eslint-disable @typescript-eslint/no-require-imports -- Explicit one-time database initialization. */
// Initialize only a blank fund for this project's real roster, with an owner-confirmed
// opening balance and dues already included in it. Never invent transfers or receipts.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('@next/env').loadEnvConfig(process.cwd());

const project = 'qtuqndmukmarqsbtqpad';
const month = '2026-10';
const balance = 3890000;
const unpaidName = 'Nguyễn Quang Anh';
const names = JSON.parse(fs.readFileSync('supabase/initial-members.json', 'utf8'));
const version = '20261009000600';
const migrationName = 'opening_dues_confirmations';
const migration = fs.readFileSync(`supabase/migrations/${version}_${migrationName}.sql`, 'utf8');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbUrl = new URL(process.env.TASK_DATABASE_URL);
if (new URL(url).hostname !== `${project}.supabase.co` ||
    !(dbUrl.username === `postgres.${project}` || dbUrl.hostname === `db.${project}.supabase.co`)) {
  throw new Error('Database/API project mismatch');
}
const db = new Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const tables = ['admin_settings', 'team_settings', 'members', 'fund_periods', 'monthly_dues', 'payment_submissions', 'fund_ledger', 'fund_requests', 'audit_logs'];

async function verify() {
  const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const [summary, dues, unpaid] = await Promise.all([
    guest.rpc('pub_fund_summary', { p_month: month }),
    guest.from('pub_dues').select('*').eq('obligation_month', month),
    guest.rpc('pub_unpaid', { p_month: month }),
  ]);
  for (const result of [summary, dues, unpaid]) if (result.error) throw new Error(result.error.message);
  const member = (await db.query('select id from public.members where full_name=$1', [unpaidName])).rows[0];
  assert(summary.data.balance === balance && summary.data.available === balance, 'Balance mismatch');
  assert(summary.data.month_in === 0 && summary.data.month_out === 0 && summary.data.outstanding === 150000, 'Fund totals mismatch');
  assert(dues.data.length === 27 && dues.data.filter(d => d.status === 'paid').length === 26, 'Paid count mismatch');
  assert(unpaid.data.length === 1 && unpaid.data[0].member_id === member.id && unpaid.data[0].amount === 150000, 'Unpaid member mismatch');
  return { month, balance, paidMembers: 26, unpaidMember: unpaidName, unpaidAmount: 150000, publicSummary: summary.data };
}

(async () => {
  let committed = false;
  let backupDir;
  try {
    assert(process.argv.includes('--apply'), 'Explicit --apply is required');
    await db.connect();
    await db.query('begin');
    await db.query("set local lock_timeout='10s'");
    await db.query("select pg_advisory_xact_lock(hashtext('2amfc_fund'))");
    await db.query('lock table public.fund_periods, public.monthly_dues, public.payment_submissions, public.fund_ledger in access exclusive mode');
    await db.query('lock table public.members, public.team_settings, public.admin_settings in share mode');
    const admin = (await db.query('select a.admin_user_id,u.email from public.admin_settings a join auth.users u on u.id=a.admin_user_id')).rows;
    assert(admin.length === 1 && admin[0].email === 'khasnhng@gmail.com', 'Unexpected admin');
    const roster = (await db.query('select id,full_name,status,fee_type,public.member_fee(id) as fee from public.members')).rows;
    assert(roster.length === 27 && names.every(name => roster.some(m => m.full_name === name)), 'Unexpected roster');
    assert(roster.every(m => m.status === 'active' && Number(m.fee) === 150000), 'Unexpected membership/fee settings');
    assert(roster.filter(m => m.full_name === unpaidName).length === 1, 'Unpaid name is not unique');
    assert((await db.query('select public.month_of(public.vn_today()) as month')).rows[0].month === month, 'Month changed; review import');
    const backup = { project, createdAt: new Date().toISOString(), tables: {} };
    for (const table of tables) backup.tables[table] = (await db.query('select * from public.' + table)).rows;
    for (const table of ['fund_periods', 'monthly_dues', 'payment_submissions', 'fund_ledger', 'fund_requests']) {
      assert(backup.tables[table].length === 0, `Fund already has data in ${table}; no changes made`);
    }
    const matchesBefore = (await db.query('select to_jsonb(m) as row from public.matches m order by id')).rows;
    const authBefore = (await db.query('select id,email,encrypted_password from auth.users order by id')).rows;
    backupDir = path.resolve('supabase/.temp', 'before-october-fund-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'database.json'), JSON.stringify(backup, null, 2));
    console.log('BACKUP_COMPLETE', backupDir);

    const prior = (await db.query('select version from supabase_migrations.schema_migrations where version=$1', [version])).rows;
    assert(prior.length === 0, 'Migration already present; review import');
    await db.query(migration);
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])', [version, migrationName, [migration]]);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: admin[0].admin_user_id, role: 'authenticated' })]);
    await db.query('select public.admin_set_opening_balance($1,public.vn_today())', [balance]);
    const day = (await db.query('select due_day from public.team_settings')).rows[0].due_day;
    await db.query('select public.admin_create_period($1,$2::date)', [month, `${month}-${String(day).padStart(2, '0')}`]);
    const generated = (await db.query('select public.admin_generate_dues($1,$2::uuid[]) as n', [month, roster.map(m => m.id)])).rows[0].n;
    assert(generated === 27, 'Obligation count mismatch');
    const note = 'Chủ đội xác nhận ngày 09/10/2026: đã đóng quỹ tháng 10 và đã nằm trong số dư khởi tạo 3.890.000 đ. Chưa cung cấp ngày chuyển tiền/biên lai; không ghi thêm khoản thu.';
    const confirmed = await db.query('select public.admin_confirm_opening_due(d.id,$2) from public.monthly_dues d join public.members m on m.id=d.member_id where d.obligation_month=$1 and m.full_name<>$3', [month, note, unpaidName]);
    assert(confirmed.rowCount === 26, 'Confirmation count mismatch');
    const dues = (await db.query('select m.full_name,d.status from public.pub_dues d join public.members m on m.id=d.member_id where obligation_month=$1', [month])).rows;
    assert(dues.length === 27 && dues.filter(d => d.status === 'paid').length === 26 && dues.find(d => d.status === 'unpaid')?.full_name === unpaidName, 'Dues status mismatch');
    assert(Number((await db.query('select public.fund_balance() as n')).rows[0].n) === balance, 'Balance mismatch before commit');
    assert((await db.query('select count(*)::int as n from public.fund_ledger')).rows[0].n === 1, 'Unexpected extra ledger entry');
    assert(JSON.stringify(matchesBefore) === JSON.stringify((await db.query('select to_jsonb(m) as row from public.matches m order by id')).rows), 'Matches changed');
    assert(JSON.stringify(authBefore) === JSON.stringify((await db.query('select id,email,encrypted_password from auth.users order by id')).rows), 'Auth changed');
    await db.query('commit'); committed = true;
    const result = { ...(await verify()), backupDir, adminPreserved: true, matchesPreserved: true, importedTransferDates: 0, receiptFilesCreated: 0 };
    fs.writeFileSync(path.join(backupDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    if (!committed) await db.query('rollback').catch(() => {});
    if (committed) console.error('Database committed; verification needs retry. Backup:', backupDir);
    throw e;
  } finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
