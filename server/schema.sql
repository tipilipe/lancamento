-- Filiais
CREATE TABLE IF NOT EXISTS filiais (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    criado_por TEXT
);

-- Permissões e Usuários
CREATE TABLE IF NOT EXISTS permissions (
    email TEXT PRIMARY KEY,
    modules JSONB DEFAULT '["entry"]',
    filiais JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FDAs (Atendimentos)
CREATE TABLE IF NOT EXISTS fdas (
    id SERIAL PRIMARY KEY,
    number TEXT UNIQUE NOT NULL,
    filial_id INTEGER REFERENCES filiais(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_open BOOLEAN DEFAULT TRUE
);

-- Itens Lançados
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    fda_id INTEGER REFERENCES fdas(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    anexos_nf JSONB DEFAULT '[]',
    anexos_boleto JSONB DEFAULT '[]',
    comprovantes JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logs do Sistema
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Arquivos e Chunks
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER,
    type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_chunks (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL
);
