import pool from './db.js';

const run = async () => {
    try {
        console.log("Adicionando coluna password_hash...");
        await pool.query('ALTER TABLE permissions ADD COLUMN IF NOT EXISTS password_hash TEXT');

        console.log("Atualizando usuários sem senha...");
        await pool.query("UPDATE permissions SET password_hash = 'sha256:default' WHERE password_hash IS NULL");

        console.log("Sucesso!");
        process.exit(0);
    } catch (err) {
        console.error("Erro:", err);
        process.exit(1);
    }
};

run();
