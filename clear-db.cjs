const pg = require('pg');
const p = new pg.Pool({host:'localhost',port:5432,database:'maps_discovery',user:'maps_user',password:'maps_pass_local'});
p.query('DELETE FROM businesses').then(r => {
  console.log('Deleted rows:', r.rowCount);
  p.end();
}).catch(e => { console.error(e.message); p.end(); });
