import pool from './db.js';

async function migrate() {
    try {
        console.log('Iniciando migração: Adicionando coluna comprovantes à tabela items...');
        await pool.query('ALTER TABLE items ADD COLUMN IF NOT EXISTS comprovantes JSONB DEFAULT \'[]\'');
        console.log('✓ Coluna comprovantes adicionada com sucesso ou já existente.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro durante a migração:', err);
        process.exit(1);
    }
}

migrate();
