const pg = require('pg');
const p = new pg.Pool({host:'localhost',port:5432,database:'maps_discovery',user:'maps_user',password:'maps_pass_local'});
const RUN_ID = '94267614-1937-4e8f-8ba0-22d23034674c';

Promise.all([
  p.query('SELECT COUNT(*) as count FROM businesses WHERE run_id = $1', [RUN_ID]),
  p.query('SELECT stats FROM runs WHERE id = $1', [RUN_ID]),
  p.query('SELECT COUNT(DISTINCT fingerprint) as unique_fps FROM businesses WHERE run_id = $1', [RUN_ID]),
  p.query('SELECT COUNT(*) as total_businesses FROM businesses'),
]).then(([runCount, runStats, fps, total]) => {
  console.log('--- DB records for this run ---');
  console.log('row count:', runCount.rows[0].count);
  console.log('unique fingerprints:', fps.rows[0].unique_fps);
  console.log('--- Run stats in DB ---');
  console.log(JSON.stringify(runStats.rows[0]?.stats, null, 2));
  console.log('--- Total businesses in DB ---');
  console.log('total:', total.rows[0].total_businesses);
  p.end();
}).catch(e => { console.error(e.message); p.end(); });
