import pool from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

async function setup() {
    try {
        console.log('Iniciando configuração do banco de dados...');
        await pool.query(sql);
        console.log('Esquema criado com sucesso!');
        process.exit(0);
    } catch (err) {
        console.error('Erro ao configurar banco de dados:', err);
        process.exit(1);
    }
}

setup();
