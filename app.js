require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Cria a conexão usando a URI única que você colocou no .env
// Remove parâmetros extras da URL
// Forçamos o Node a quebrar a URL da Aiven e focar apenas no banco planilha_db
// Configuração de conexão inteligente (Nuvem ou Local)
const dbConfig = process.env.DATABASE_URL 
    ? {
        uri: process.env.DATABASE_URL.split('?')[0],
        database: 'defaultdb',
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: 'localhost',
        user: 'root',
        password: '32826039Xb$',
        database: 'planilha_db',
        port: 3306
      };

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        return;
    }
    console.log(process.env.DATABASE_URL ? '🚀 Conectado ao banco da AIVEN na nuvem!' : '💻 Conectado ao banco LOCAL!');
});

const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_secreta';

// Middleware para verificar se o usuário está logado
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Acesso negado!" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Token inválido!" });
        req.usuarioId = decoded.id;
        next();
    });
};

// Rota de Registro
// Rota de Registro Melhorada
app.post('/registrar', async (req, res) => {
    const { email, senha } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);
    const sql = "INSERT INTO usuarios (email, senha) VALUES (?, ?)";
    
    db.query(sql, [email, senhaHash], (err, result) => {
        if (err) {
            // ISSO AQUI VAI MOSTRAR O ERRO REAL NO SEU TERMINAL DO VS CODE:
            console.error("❌ Erro ao inserir usuário no banco:", err);
            
            // Se o erro for de e-mail duplicado (Código 1062 no MySQL)
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: "Este e-mail já está cadastrado!" });
            }
            
            return res.status(500).json({ error: "Erro interno no servidor de banco de dados." });
        }
        res.json({ mensagem: "Usuário criado com sucesso!" });
    });
});

// Rota de Login
app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    const sql = "SELECT * FROM usuarios WHERE email = ?";
    db.query(sql, [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Usuário não encontrado." });
        
        const senhaCorreta = await bcrypt.compare(senha, results[0].senha);
        if (!senhaCorreta) return res.status(401).json({ error: "Senha incorreta." });

        const token = jwt.sign({ id: results[0].id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ auth: true, token });
    });
});

// Rota Salvar (Protegida)
app.post('/salvar', verificarToken, (req, res) => {
    const { descricao, valor_gastos, categoria } = req.body;
    const sql = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";
    db.query(sql, [descricao, valor_gastos, categoria, req.usuarioId], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ mensagem: "Salvo com sucesso!" });
    });
});

// Rota Listar (Protegida - Lista apenas os gastos do usuário logado)
app.get('/listar', verificarToken, (req, res) => {
    const sql = "SELECT * FROM controle WHERE usuario_id = ? ORDER BY data_registro DESC";
    db.query(sql, [req.usuarioId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor ON na porta ${PORT}`));