import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Em produção (Neon, Render Postgres, etc.) você normalmente recebe uma
// única string de conexão em DATABASE_URL, já com usuário/senha/host
// embutidos, e precisa de SSL. Localmente continuamos aceitando as
// variáveis separadas (DB_USER, DB_HOST...), sem SSL, como já era.
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
    });
