import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ host: 'localhost', port: 5432, database: 'maps_discovery', user: 'maps_user', password: 'maps_pass_local' });

async function main() {
  const cols = await pool.query('SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', ['raw_results']);
  console.log('=== COLUMNS ===');
  console.log(JSON.stringify(cols.rows, null, 2));

  const fks = await pool.query('SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name WHERE tc.table_name = $1', ['raw_results']);
  console.log('=== CONSTRAINTS ===');
  console.log(JSON.stringify(fks.rows, null, 2));

  try {
    const qCount = await pool.query('SELECT COUNT(*) FROM queries');
    console.log('=== QUERIES TABLE ROW COUNT ===');
    console.log(JSON.stringify(qCount.rows));
  } catch(e) {
    console.log('queries table error:', e.message);
  }

  await pool.end();
}
main().catch(async e => { console.error(e.message); await pool.end(); });
