import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
await client.connect()

try {
  await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS weekly_update text NOT NULL DEFAULT ''`)
  console.log('weekly_update column ready.')
} finally {
  await client.end()
}
