const { Client } = require('pg');
const client = new Client({ host: 'localhost', port: 5432, database: 'maps_discovery', user: 'maps_user', password: 'maps_pass_local' });
client.connect()
  .then(() => client.query('SELECT COUNT(*) FROM businesses'))
  .then(r => { console.log('total in DB:', r.rows[0].count); client.end(); })
  .catch(e => { console.error(e.message); client.end(); });
