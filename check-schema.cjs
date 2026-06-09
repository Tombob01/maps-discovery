const pg = require('pg');
const p = new pg.Pool({host:'localhost',port:5432,database:'maps_discovery',user:'maps_user',password:'maps_pass_local'});

Promise.all([
  p.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`),
  p.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='businesses'`),
  p.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='business_records'`),
]).then(([tables, bizIdx, bizRecIdx]) => {
  console.log('--- TABLES ---');
  console.log(tables.rows.map(r => r.table_name));
  console.log('--- indexes on businesses ---');
  console.log(bizIdx.rows);
  console.log('--- indexes on business_records ---');
  console.log(bizRecIdx.rows);
  p.end();
}).catch(e => { console.error(e.message); p.end(); });
