// One-time, explicitly requested transition from the known demo to the owner's real roster.
// Preserves Auth, admin_settings, team_settings, positions, schema, policies and migrations.
/* eslint-disable @typescript-eslint/no-require-imports -- One-time Node database maintenance. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Client}=require('pg');
const {createClient}=require('@supabase/supabase-js');
require('@next/env').loadEnvConfig(process.cwd());
const names=JSON.parse(fs.readFileSync('supabase/initial-members.json','utf8'));
const tables=['audit_logs','donations','file_assets','fund_ledger','fund_periods','fund_requests',
 'gathering_attendance','lineup_slots','lineup_snapshots','lineups','match_participations',
 'match_rsvp_history','match_rsvps','matches','member_name_history','member_positions',
 'member_private_details','members','monthly_dues','notifications','payment_submissions','penalties',
 'post_match_gatherings','reward_event_eligible_members','reward_event_matches','reward_events',
 'reward_payouts','reward_prizes','reward_results'];
const db=new Client({connectionString:process.env.TASK_DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const service=createClient(url,process.env.TASK_SUPABASE_SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
function checked(r,label){if(r.error)throw new Error(label+': '+r.error.message);return r.data;}
function assert(v,message){if(!v)throw new Error(message);}
(async()=>{
 let committed=false;
 try{
  assert(process.argv.includes('--apply-known-demo-reset'),'Explicit apply flag required');
  assert(new URL(url).hostname==='qtuqndmukmarqsbtqpad.supabase.co','Wrong API project');
  assert(new URL(process.env.TASK_DATABASE_URL).username==='postgres.qtuqndmukmarqsbtqpad','Wrong database project');
  assert(names.length===27 && new Set(names).size===27,'Expected 27 distinct member names');
  await db.connect();
  await db.query('begin');
  await db.query("set local lock_timeout='10s'");
  await db.query("select pg_advisory_xact_lock(hashtext('2am-start-live-data'))");
  await db.query('lock table '+tables.map(t=>'public.'+t).join(',')+' in access exclusive mode');
  const account=(await db.query('select a.admin_user_id,u.email from public.admin_settings a join auth.users u on u.id=a.admin_user_id')).rows;
  assert(account.length===1 && account[0].email==='khasnhng@gmail.com','Unexpected admin');
  assert(Number((await db.query('select count(*) as n from auth.users')).rows[0].n)===1,'Unexpected extra Auth accounts');
  const authBefore=(await db.query('select to_jsonb(u) as snapshot from auth.users u where id=$1',[account[0].admin_user_id])).rows[0].snapshot;
  assert(checked(await service.auth.admin.getUserById(account[0].admin_user_id),'Verify service access').user.id===account[0].admin_user_id,'Wrong Auth project');
  const backup={project:'qtuqndmukmarqsbtqpad',createdAt:new Date().toISOString(),admin:account[0],tables:{},storage:[]};
  for(const t of [...tables,'admin_settings','team_settings','positions']) backup.tables[t]=(await db.query('select * from public.'+t)).rows;
  assert(backup.tables.members.length===14 && backup.tables.members.every(m=>/^10000000-0000-4000-8000-0000000000(0[1-9]|1[0-4])$/.test(m.id)),'Members differ from known demo');
  assert(backup.tables.fund_ledger.length===48 && backup.tables.fund_ledger.every(l=>new Date(l.created_at).toISOString()==='2026-10-09T07:48:41.211Z'),'Ledger differs from known demo');
  assert(backup.tables.matches.length===5 && backup.tables.matches.every(m=>/^20000000-0000-4000-8000-00000000000[1-5]$/.test(m.id)),'Matches differ from known demo');
  const assets=backup.tables.file_assets;
  assert(assets.length===37 && assets.every(a=>a.bucket==='receipts' && /^demo-initial\/0a7d0cbd-841f-4a33-b25c-5220905e6f79\/\d+\.png$/.test(a.object_path)),'Assets differ from known demo');
  const storage=(await db.query('select bucket_id,name from storage.objects')).rows;
  assert(storage.length===37 && storage.every(o=>assets.some(a=>a.bucket===o.bucket_id && a.object_path===o.name)),'Unexpected Storage files');
  const backupDir=path.resolve('supabase/.temp','before-live-'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(path.join(backupDir,'receipts'),{recursive:true});
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
   while(next<assets.length){
    const index=next++;const a=assets[index];
    const blob=checked(await service.storage.from(a.bucket).download(a.object_path),'Backup receipt');
    const bytes=Buffer.from(await blob.arrayBuffer());
    assert(bytes.length===a.size_bytes && crypto.createHash('sha256').update(bytes).digest('hex')===a.sha256,'Backup receipt mismatch');
    const localFile='receipts/'+index+'.png';fs.writeFileSync(path.join(backupDir,localFile),bytes);
    backup.storage.push({bucket:a.bucket,object_path:a.object_path,localFile,sha256:a.sha256});
   }
  }));
  fs.writeFileSync(path.join(backupDir,'database.json'),JSON.stringify(backup,null,2));
  console.log('BACKUP_COMPLETE',backupDir);
  // This removes only the confirmed pre-live demo. No DELETE/UPDATE of ledger rows,
  // no trigger disabling, no CASCADE, and no schema/role/Auth changes.
  await db.query('truncate table '+tables.map(t=>'public.'+t).join(',')+' restart identity');
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:account[0].admin_user_id,role:'authenticated'})]);
  for(const full_name of names){
   await db.query("select public.admin_save_member(null,$1::jsonb,'{}'::text[],null,null)",[
    JSON.stringify({full_name,status:'active',fee_type:'standard',preferred_foot:'unknown',reason:'Nhập danh sách thật do chủ đội cung cấp sau khi dọn dữ liệu mẫu'})
   ]);
  }
  assert(Number((await db.query('select count(*) as n from public.members')).rows[0].n)===27,'Roster import count mismatch');
  assert(Number((await db.query('select public.fund_balance() as balance')).rows[0].balance)===0,'Expected zero balance');
  const authAfter=(await db.query('select to_jsonb(u) as snapshot from auth.users u where id=$1',[account[0].admin_user_id])).rows[0].snapshot;
  assert(JSON.stringify(authBefore)===JSON.stringify(authAfter),'Admin Auth record changed');
  await db.query('commit');committed=true;
  fs.writeFileSync(path.join(backupDir,'progress.json'),JSON.stringify({databaseCommitted:true,storageCleanupPending:true,assets},null,2));
  const removed=checked(await service.storage.from('receipts').remove(assets.map(a=>a.object_path)),'Remove demo receipt files');
  assert(removed.length===37,'Storage deletion count mismatch');
  const remaining=(await db.query('select count(*) as n from storage.objects')).rows[0];
  assert(Number(remaining.n)===0,'Storage is not empty');
  const guest=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  assert(checked(await service.auth.admin.getUserById(account[0].admin_user_id),'Preserved admin account').user.email===account[0].email,'Admin account mismatch');
  const configured=(await db.query('select public.is_admin() as authorized')).rows[0];
  // Transaction-local claims have ended. Verify authorization with fresh claims in a read-only transaction.
  assert(configured.authorized===false,'Unexpected persistent impersonation');
  await db.query('begin read only');
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:account[0].admin_user_id,role:'authenticated'})]);
  assert((await db.query('select public.require_admin() as id')).rows[0].id===account[0].admin_user_id,'Preserved admin authorization');
  await db.query('commit');
  const roster=checked(await guest.from('pub_members').select('full_name,shirt_number,positions,avatar_path,status,fee_type'),'Public roster');
  assert(roster.length===27 && names.every(n=>roster.some(m=>m.full_name===n)),'Public roster mismatch');
  assert(roster.every(m=>m.shirt_number===null && m.positions.length===0 && m.avatar_path===null),'Unexpected invented profile information');
  const summary=checked(await guest.rpc('pub_fund_summary',{p_month:'2026-10'}),'Zero fund summary');
  assert(summary.balance===0 && summary.month_in===0 && summary.month_out===0 && !summary.opening_set,'Expected blank real ledger');
  for(const table of ['pub_ledger','pub_matches','pub_periods','pub_dues','pub_reward_events','pub_donations','pub_penalties','pub_notifications']){
   const r=await guest.from(table).select('*',{count:'exact',head:true});checked(r,table);assert(r.count===0,'Expected empty '+table);
  }
  assert((await guest.from('members').select('id')).error,'Guest access to base table should remain blocked');
  for(const table of tables.filter(t=>!['members','member_private_details','audit_logs'].includes(t))) {
   assert(Number((await db.query('select count(*) as n from public.'+table)).rows[0].n)===0,'Expected empty '+table);
  }
  assert(JSON.stringify((await db.query('select * from public.team_settings')).rows)===JSON.stringify(backup.tables.team_settings),'Team settings changed');
  assert(JSON.stringify((await db.query('select * from public.admin_settings')).rows)===JSON.stringify(backup.tables.admin_settings),'Admin settings changed');
  assert((await db.query('select count(*)::int as n from auth.users')).rows[0].n===1,'Expected one Auth user');
  const result={members:27,adminEmail:account[0].email,adminAuthRecordPreserved:true,adminAuthorizationVerified:true,summary,removedDemoReceiptFiles:37,backupDir};
  fs.writeFileSync(path.join(backupDir,'result.json'),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(backupDir,'progress.json'),JSON.stringify({databaseCommitted:true,storageCleanupPending:false,verified:true},null,2));
  console.log(JSON.stringify(result,null,2));
 }catch(e){if(!committed)await db.query('rollback').catch(()=>{});throw e;}
 finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
