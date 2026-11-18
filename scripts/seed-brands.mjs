import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
await client.connect()

try {
  await client.query('BEGIN')

  await client.query(`
    CREATE TABLE IF NOT EXISTS logos (
      id serial PRIMARY KEY,
      mime_type text NOT NULL,
      data bytea NOT NULL,
      byte_size integer NOT NULL,
      sha256 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS brands (
      slug text PRIMARY KEY,
      position integer NOT NULL DEFAULT 0,
      is_default boolean NOT NULL DEFAULT false,
      name text NOT NULL,
      header_lead text NOT NULL DEFAULT '',
      header_accent text NOT NULL DEFAULT '',
      logo_id integer REFERENCES logos(id) ON DELETE SET NULL,
      logo_alt text NOT NULL DEFAULT '',
      color_background text NOT NULL DEFAULT '#071a33',
      color_surface text NOT NULL DEFAULT '#1a3f6b',
      color_accent text NOT NULL DEFAULT '#87cf36',
      color_timeline_accent text NOT NULL DEFAULT '#0e6b9a',
      updated_at timestamptz NOT NULL DEFAULT now()
    )`)

  await client.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS brand_slug text REFERENCES brands(slug),
      ADD COLUMN IF NOT EXISTS logo_id integer REFERENCES logos(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS logo_alt text,
      ADD COLUMN IF NOT EXISTS color_accent text,
      ADD COLUMN IF NOT EXISTS color_timeline_accent text,
      ADD COLUMN IF NOT EXISTS page_title text`)

  const { rowCount } = await client.query(`SELECT 1 FROM brands WHERE slug = 'anyone-home'`)
  if (rowCount === 0) {
    const svg = await readFile(new URL('../public/anyone-home-logo.svg', import.meta.url))
    const sha = createHash('sha256').update(svg).digest('hex')
    const {
      rows: [logo],
    } = await client.query(
      `INSERT INTO logos (mime_type, data, byte_size, sha256) VALUES ('image/svg+xml', $1, $2, $3) RETURNING id`,
      [svg, svg.length, sha],
    )
    await client.query(
      `INSERT INTO brands (slug, position, is_default, name, header_lead, header_accent, logo_id, logo_alt)
       VALUES ('anyone-home', 0, true, 'Anyone Home', 'AI Pod', 'Delivery Timelines', $1, 'Anyone Home')`,
      [logo.id],
    )
  }

  await client.query(`UPDATE projects SET brand_slug = 'anyone-home' WHERE brand_slug IS NULL`)
  await client.query(`ALTER TABLE projects ALTER COLUMN brand_slug SET NOT NULL`)

  await client.query('COMMIT')
  const { rows } = await client.query(`SELECT slug, brand_slug FROM projects ORDER BY position`)
  console.log('Brands seeded. Projects:', rows)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
