/* eslint-disable @typescript-eslint/no-require-imports -- Node-only CommonJS bootstrap, outside the Next.js app. */
// Explicit hosted demo bootstrap. Never imports local Auth accounts or writes storage.objects.
// Credentials come only from the process environment; .env.local contains public app config.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
require('@next/env').loadEnvConfig(process.cwd());

function required(name) {
  if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);
  return process.env[name];
}
const url = required('NEXT_PUBLIC_SUPABASE_URL');
const publicKey = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const email = required('DEMO_ADMIN_EMAIL');
const password = required('DEMO_ADMIN_PASSWORD');
const anon = () => createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function verify() {
  const guest = anon();
  const owner = anon();
  checked(await owner.auth.signInWithPassword({ email, password }), 'Admin login');
  const tables = ['pub_team','pub_members','pub_periods','pub_dues','pub_ledger','pub_expected_expenses',
    'pub_matches','pub_rsvps','pub_lineups','pub_participations','pub_gatherings','pub_gathering_attendance',
    'pub_reward_events','pub_reward_prizes','pub_reward_results','pub_reward_event_matches',
    'pub_penalties','pub_donations','pub_notifications'];
  const counts = {};
  for (const table of tables) {
    const result = await guest.from(table).select('*', { count: 'exact', head: true });
    checked(result, table);
    counts[table] = result.count;
  }
  for (const table of ['members','member_private_details','payment_submissions','fund_ledger','admin_settings']) {
    if (!(await guest.from(table).select('*').limit(1)).error) throw new Error(`Guest can read ${table}`);
  }
  const admin = checked(await owner.from('admin_settings').select('admin_user_id').single(), 'Admin authorization');
  if (!admin.admin_user_id) throw new Error('Missing admin');
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date());
  const summary = checked(await guest.rpc('pub_fund_summary', { p_month: month }), 'Fund summary');
  checked(await guest.rpc('pub_member_form', { p_month: month }), 'Monthly form');
  checked(await guest.rpc('pub_unpaid', { p_month: month }), 'Unpaid members');
  checked(await guest.rpc('pub_member_stats', { p_from: '2026-01-01', p_to: '2026-12-31' }), 'Statistics');
  const assets = checked(await owner.from('file_assets').select('bucket,object_path,size_bytes,sha256').eq('purpose','receipt'), 'Receipt assets');
  for (const asset of assets) {
    const blob = checked(await owner.storage.from(asset.bucket).download(asset.object_path), 'Download private demo receipt');
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length !== asset.size_bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new Error(`Receipt content mismatch: ${asset.object_path}`);
    }
    if (!(await guest.storage.from(asset.bucket).download(asset.object_path)).error) throw new Error('Guest can download private receipt');
  }
  const settingsResponse = await fetch(`${url}/auth/v1/settings`, {headers:{apikey:publicKey}});
  if (!settingsResponse.ok) throw new Error(`Auth settings: HTTP ${settingsResponse.status}`);
  const settings = await settingsResponse.json();
  console.log(JSON.stringify({ project: new URL(url).hostname, adminEmail: email, counts, summary,
    verifiedReceipts: assets.length, publicBaseTablesBlocked: true, privateReceiptsBlocked: true,
    signupDisabled: settings.disable_signup }, null, 2));
  await owner.auth.signOut();
}

function replaceOnce(sql, from, to) {
  if (sql.split(from).length !== 2) throw new Error('Local seed changed; review hosted adaptation before continuing');
  return sql.replace(from, to);
}

function businessSeed(adminId) {
  const source = fs.readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8').replaceAll('\r\n','\n');
  const marker = '-- ───────── Members (fake) ─────────';
  if (!source.includes(marker)) throw new Error('Missing business seed marker');
  let sql = source.slice(source.indexOf(marker)).replaceAll('a0000000-0000-4000-8000-000000000001', adminId);
  sql = replaceOnce(sql, "'seed/' || d.id || '.png'", "(select object_path from pg_temp.demo_receipts where key = 'history:' || d.member_id || ':' || d.obligation_month)");
  sql = replaceOnce(sql, "'image/png', 1000,", "'image/png', (select size_bytes from pg_temp.demo_receipts where key = 'history:' || d.member_id || ':' || d.obligation_month),");
  sql = replaceOnce(sql, "encode(sha256(convert_to(d.id::text, 'UTF8')), 'hex')", "(select sha256 from pg_temp.demo_receipts where key = 'history:' || d.member_id || ':' || d.obligation_month)");
  const storageInsert = "    insert into storage.objects (bucket_id, name, metadata)\n    values (v_up->>'bucket', v_up->>'path', jsonb_build_object('mimetype', 'image/png', 'size', ";
  sql = replaceOnce(sql,
    "v_up := public.begin_public_upload('receipt', 'image/png', 2048, encode(sha256(convert_to('oct' || r.member_id, 'UTF8')), 'hex'));\n" + storageInsert + '2048));',
    "v_up := pg_temp.reserve_demo_receipt('oct:' || r.member_id);");
  sql = replaceOnce(sql,
    "v_up := public.begin_public_upload('receipt', 'image/png', 3000 + i, encode(sha256(convert_to('donation' || i, 'UTF8')), 'hex'));\n" + storageInsert + '3000 + i));',
    "v_up := pg_temp.reserve_demo_receipt('donation:' || i);");
  if (/auth\.(users|identities)|insert into storage\.objects/.test(sql)) throw new Error('Unsafe hosted seed content');
  return sql;
}

async function seed() {
  if (password.length < 6) throw new Error('Admin password must contain at least 6 characters');
  const dbUrl = new URL(required('DEMO_DATABASE_URL'));
  if (dbUrl.pathname !== '/postgres') throw new Error('Expected postgres database');
  const ref = new URL(url).hostname.split('.')[0];
  if (!(dbUrl.username === `postgres.${ref}` || dbUrl.hostname === `db.${ref}.supabase.co`)) {
    throw new Error('Database and public API project do not match');
  }
  dbUrl.searchParams.delete('sslmode');
  // Encrypted bootstrap session, same certificate behavior as Supabase CLI sslmode=require.
  const db = new Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  const service = createClient(url, required('DEMO_SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const uploaded = [];
  let committed = false;
  try {
    await db.connect();
    await db.query('begin');
    await db.query("select pg_advisory_xact_lock(hashtext('2am-hosted-demo-bootstrap'))");
    const existing = await db.query("select (select count(*) from public.members) + (select count(*) from public.fund_ledger) + (select count(*) from public.matches) + (select count(*) from public.monthly_dues) + (select count(*) from public.reward_events) + (select count(*) from public.payment_submissions) + (select count(*) from public.file_assets) as n, public.month_of(public.vn_today()) as month");
    if (Number(existing.rows[0].n) !== 0) throw new Error('Database already has business data; use --verify instead. No data was changed.');
    if (existing.rows[0].month !== '2026-10') throw new Error('This demo is dated October 2026; adapt the source seed before running in another month.');
    const users = checked(await service.auth.admin.listUsers({ page:1, perPage:1000 }), 'List Auth users').users;
    let admin = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    const configured = await db.query('select admin_user_id from public.admin_settings');
    if (configured.rows.length && configured.rows[0].admin_user_id !== admin?.id) throw new Error('Another admin is already configured');
    if (!admin) admin = checked(await service.auth.admin.createUser({ email, password, email_confirm:true }), 'Create admin').user;
    // No password resets or modifications of existing Auth users.
    await db.query('insert into public.admin_settings(admin_user_id) values ($1) on conflict (id) do nothing', [admin.id]);
    const sql = businessSeed(admin.id);
    const batch = `demo-initial/${crypto.randomUUID()}`;
    const receipts = [];
    const memberId = i => `10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
    for (const month of ['2026-08','2026-09']) for (let i=1;i<=14;i++) {
      if (i===13 || (month==='2026-09' && i===12)) continue;
      receipts.push({key:`history:${memberId(i)}:${month}`, amount:[12,14].includes(i)?50000:150000});
    }
    for (let i=1;i<=10;i++) receipts.push({key:`oct:${memberId(i)}`,amount:i===1?300000:150000});
    receipts.push({key:'donation:1',amount:300000},{key:'donation:2',amount:200000});
    for (const receipt of receipts) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="560"><rect width="960" height="560" fill="#f8fafc"/><rect width="960" height="100" fill="#043c75"/><g font-family="Arial,sans-serif"><text x="48" y="65" font-size="36" fill="white">2AM FC — BIÊN LAI MẪU</text><text x="48" y="170" font-size="28" fill="#bd1023">DỮ LIỆU MẪU — KHÔNG PHẢI GIAO DỊCH THẬT</text><text x="48" y="270" font-size="56" fill="#043c75">${receipt.amount.toLocaleString('vi-VN')} VND</text><text x="48" y="350" font-size="20" fill="#334155">${receipt.key}</text><text x="48" y="455" font-size="24" fill="#334155">Chỉ dùng để kiểm tra ứng dụng và quy trình duyệt quỹ.</text></g></svg>`;
      const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
      receipt.object_path = `${batch}/${receipts.indexOf(receipt)+1}.png`;
      receipt.size_bytes = bytes.length;
      receipt.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      checked(await service.storage.from('receipts').upload(receipt.object_path, bytes, {contentType:'image/png',upsert:false}), 'Upload demo receipt');
      uploaded.push(receipt.object_path);
    }
    await db.query('create temporary table demo_receipts(key text primary key, object_path text, size_bytes int, sha256 text) on commit drop');
    await db.query('insert into demo_receipts select key,object_path,size_bytes,sha256 from jsonb_to_recordset($1::jsonb) as r(key text,object_path text,size_bytes int,sha256 text)', [JSON.stringify(receipts)]);
    await db.query(`create function pg_temp.reserve_demo_receipt(p_key text) returns jsonb language plpgsql as $$
      declare r record; v_id uuid;
      begin
        select * into strict r from pg_temp.demo_receipts where key=p_key;
        insert into public.file_assets(bucket,object_path,purpose,mime,size_bytes,sha256,actor_kind)
        values('receipts',r.object_path,'receipt','image/png',r.size_bytes,r.sha256,'public') returning id into v_id;
        return jsonb_build_object('asset_id',v_id,'bucket','receipts','path',r.object_path);
      end $$`);
    await db.query(sql);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({sub:admin.id,role:'authenticated'})]);
    await db.query("select public.admin_decide_fund_request(id,'approve',null,null) from public.fund_requests where public_description='Mua bộ áo bib 2 màu' and status='pending'");
    await db.query('commit');
    committed = true;
    console.log(`Seed committed: 14 demo members; ${uploaded.length} real private receipt images; one configured admin.`);
  } catch (e) {
    if (!committed) {
      await db.query('rollback').catch(()=>{});
      // Only objects uploaded by this invocation are removed; never touches existing data.
      if (uploaded.length) checked(await service.storage.from('receipts').remove(uploaded), 'Cleanup uncommitted demo receipts');
    }
    throw e;
  } finally { await db.end(); }
  await verify();
}

(process.argv.includes('--seed') ? seed() : verify()).catch(e => { console.error(e.message); process.exitCode=1; });
