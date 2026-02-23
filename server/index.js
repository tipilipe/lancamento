import express from 'express';
import cors from 'cors';
import pool from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'lma-finance-secret-key-123';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../dist')));

// --- AUTHENTICATION ---
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM permissions WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        const user = result.rows[0];

        // If password_hash is null or 'sha256:default', we might want to allow setting it or use a default
        if (!user.password_hash || user.password_hash === 'sha256:default') {
            // For migration: if the user provides 'shipstore123', we'll allow it and hash it
            if (password === 'shipstore123') {
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(password, salt);
                await pool.query('UPDATE permissions SET password_hash = $1 WHERE email = $2', [hash, email]);
                const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '24h' });
                return res.json({ token, user: { email: user.email, modules: user.modules } });
            }
            return res.status(401).json({ error: 'Senha inicial incorreta. Use shipstore123 para o primeiro acesso.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { email: user.email, modules: user.modules } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    const { email, oldPassword, newPassword } = req.body;
    try {
        const result = await pool.query('SELECT password_hash FROM permissions WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

        const isMatch = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Senha atual incorreta' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);
        await pool.query('UPDATE permissions SET password_hash = $1 WHERE email = $2', [hash, email]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FILIAIS ---
app.get('/api/filiais', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM filiais ORDER BY nome');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/filiais', async (req, res) => {
    const { nome, criadoPor } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO filiais (nome, criado_por) VALUES ($1, $2) RETURNING *',
            [nome, criadoPor]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/filiais/:id', async (req, res) => {
    const { id } = req.params;
    const { nome } = req.body;
    try {
        const result = await pool.query(
            'UPDATE filiais SET nome = $1 WHERE id = $2 RETURNING *',
            [nome, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/filiais/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM filiais WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PERMISSIONS ---
app.get('/api/permissions/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const result = await pool.query('SELECT * FROM permissions WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            // Default permissions if not found
            return res.json({ email, modules: ['entry'], filiais: [] });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/permissions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM permissions');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/permissions', async (req, res) => {
    const { email, modules, filiais } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO permissions (email, modules, filiais) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET modules = $2, filiais = $3 RETURNING *',
            [email, JSON.stringify(modules), JSON.stringify(filiais)]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/permissions/:email', async (req, res) => {
    const { email } = req.params;
    try {
        await pool.query('DELETE FROM permissions WHERE email = $1', [email]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FDAs ---
app.get('/api/fdas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM fdas ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fdas', async (req, res) => {
    const { number, filialId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO fdas (number, filial_id) VALUES ($1, $2) RETURNING *',
            [number, filialId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/fdas/:id', async (req, res) => {
    const { id } = req.params;
    const { number, is_open } = req.body;
    try {
        const result = await pool.query(
            'UPDATE fdas SET number = COALESCE($1, number), is_open = COALESCE($2, is_open) WHERE id = $3 RETURNING *',
            [number, is_open, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/fdas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM fdas WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ITEMS ---
app.get('/api/items', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM items ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    const { fdaId, data, anexosNF, anexosBoleto, comprovantes } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO items (fda_id, data, anexos_nf, anexos_boleto, comprovantes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [fdaId, JSON.stringify(data), JSON.stringify(anexosNF || []), JSON.stringify(anexosBoleto || []), JSON.stringify(comprovantes || [])]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    const { data, anexosNF, anexosBoleto, comprovantes } = req.body;
    try {
        const result = await pool.query(
            'UPDATE items SET data = $1, anexos_nf = COALESCE($2, anexos_nf), anexos_boleto = COALESCE($3, anexos_boleto), comprovantes = COALESCE($4, comprovantes), updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
            [JSON.stringify(data), anexosNF ? JSON.stringify(anexosNF) : null, anexosBoleto ? JSON.stringify(anexosBoleto) : null, comprovantes ? JSON.stringify(comprovantes) : null, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM items WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOGS ---
app.get('/api/logs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 1000');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', async (req, res) => {
    const { user, action, details } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO logs (user_email, action, details) VALUES ($1, $2, $3) RETURNING *',
            [user, action, details]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FILES & CHUNKS ---
app.post('/api/files', async (req, res) => {
    const { name, size, type } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO files (name, size, type) VALUES ($1, $2, $3) RETURNING id',
            [name, size, type]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/files/:id/chunks', async (req, res) => {
    const { id } = req.params;
    const { index, content } = req.body;
    try {
        await pool.query(
            'INSERT INTO file_chunks (file_id, chunk_index, content) VALUES ($1, $2, $3)',
            [id, index, content]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files/:id/chunks', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT chunk_index, content FROM file_chunks WHERE file_id = $1 ORDER BY chunk_index',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});
