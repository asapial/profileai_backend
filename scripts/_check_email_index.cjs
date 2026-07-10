require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await c.connect();
  const r = await c.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user'"
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})();