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

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Inicializa o cliente do WhatsApp com autenticação local
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('🤖 [WhatsApp Bot] QR Code gerado! Escaneie abaixo com o seu celular:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('🤖 🚀 [WhatsApp Bot] Conectado e pronto para ouvir mensagens!');
});

client.on('message_create', async (msg) => {
    const texto = msg.body.trim();
    const partes = texto.split(' ');

    if (partes.length >= 3 && !isNaN(partes[0].replace(',', '.'))) {
        const valor = parseFloat(partes[0].replace(',', '.'));
        const descricao = partes[1];
        const categoria = partes[2];
        const usuarioIdFixo = 1; 

        const sql = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";
        
        db.query(sql, [descricao, valor, categoria, usuarioIdFixo], (err, result) => {
            if (err) {
                console.error("❌ Erro do bot ao salvar no banco:", err);
                msg.reply("❌ Desculpe, deu um erro interno ao tentar salvar o seu gasto.");
                return;
            }
            msg.reply(`✅ *Gasto Registrado pelo Bot!* \n\n💰 *Valor:* R$ ${valor.toFixed(2)}\n📝 *Descrição:* ${descricao}\n🏷️ *Categoria:* ${categoria}`);
        });
    }
});

// O robô SÓ VAI LIGAR se o banco for LOCAL. 
// Na nuvem (Render), ele vai ignorar o WhatsApp e manter apenas o site ativo!
if (!process.env.DATABASE_URL) {
    console.log("💻 Ambiente Local detectado: Inicializando o Bot do WhatsApp...");
    client.initialize();
} else {
    console.log("🚀 Ambiente de Produção (Render) detectado: O Bot do WhatsApp ficará desligado na nuvem.");
}

const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_secreta';

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

app.post('/registrar', async (req, res) => {
    const { email, senha } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);
    const sql = "INSERT INTO usuarios (email, senha) VALUES (?, ?)";
    
    db.query(sql, [email, senhaHash], (err, result) => {
        if (err) {
            console.error("❌ Erro ao inserir usuário no banco:", err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: "Este e-mail já está cadastrado!" });
            }
            return res.status(500).json({ error: "Erro interno no servidor de banco de dados." });
        }
        res.json({ mensagem: "Usuário criado com sucesso!" });
    });
});

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

app.post('/salvar', verificarToken, (req, res) => {
    const { descricao, valor_gastos, categoria } = req.body;
    const sql = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";
    db.query(sql, [descricao, valor_gastos, categoria, req.usuarioId], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ mensagem: "Salvo com sucesso!" });
    });
});

app.get('/listar', verificarToken, (req, res) => {
    const sql = "SELECT * FROM controle WHERE usuario_id = ? ORDER BY data_registro DESC";
    db.query(sql, [req.usuarioId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.delete('/excluir/:id', verificarToken, (req, res) => {
    const gastoId = req.params.id;
    const usuarioId = req.usuarioId;

    const sql = "DELETE FROM controle WHERE id = ? AND usuario_id = ?";
    
    db.query(sql, [gastoId, usuarioId], (err, result) => {
        if (err) {
            console.error("❌ Erro ao deletar gasto:", err);
            return res.status(500).json({ error: "Erro ao deletar do banco de dados." });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Gasto não encontrado ou não pertence a você." });
        }

        res.json({ mensagem: "Gasto excluído com sucesso!" });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor ON na porta ${PORT}`));