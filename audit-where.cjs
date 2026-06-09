const pg = require('pg');
const p = new pg.Pool({host:'localhost',port:5432,database:'maps_discovery',user:'maps_user',password:'maps_pass_local'});

Promise.all([
  p.query('SELECT run_id, COUNT(*) as count FROM businesses GROUP BY run_id ORDER BY count DESC'),
  p.query('SELECT id, status, stats, started_at, completed_at FROM runs ORDER BY started_at DESC LIMIT 10'),
]).then(([byRun, runs]) => {
  console.log('--- Record counts by run_id ---');
  console.log(byRun.rows);
  console.log('--- Recent runs ---');
  runs.rows.forEach(r => {
    console.log('id:', r.id, 'status:', r.status, 'started:', r.started_at, 'completed:', r.completed_at);
    console.log('stats:', JSON.stringify(r.stats));
  });
  p.end();
}).catch(e => { console.error(e.message); p.end(); });
