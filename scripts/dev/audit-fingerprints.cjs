const pg = require('pg');
const p = new pg.Pool({host:'localhost',port:5432,database:'maps_discovery',user:'maps_user',password:'maps_pass_local'});
const RUN_ID = '94267614-1937-4e8f-8ba0-22d23034674c';

p.query(`
  SELECT b.run_id, COUNT(*) as count
  FROM businesses b
  WHERE b.fingerprint IN (
    SELECT fingerprint FROM businesses WHERE run_id = $1
  )
  GROUP BY b.run_id
  ORDER BY count DESC
`, [RUN_ID]).then(r => {
  console.log('--- Fingerprint distribution across runs ---');
  console.log(r.rows);
  p.end();
}).catch(e => { console.error(e.message); p.end(); });
