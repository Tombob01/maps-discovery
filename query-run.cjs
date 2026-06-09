const pg = require('pg');
const p = new pg.Pool({host:'localhost',port:5432,database:'maps_discovery',user:'maps_user',password:'maps_pass_local'});
const RUN_ID = '8fe99f04-be4a-4093-9431-bd2681366620';
p.query('SELECT COUNT(*) as count FROM businesses WHERE run_id = $1', [RUN_ID])
  .then(r => { console.log('DB count:', r.rows[0]); p.end(); })
  .catch(e => { console.error(e.message); p.end(); });
