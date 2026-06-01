require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit'); // NOVO
const nodemailer = require('nodemailer');        // NOVO

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 🔒 PROTEÇÃO CONTRA ATAQUES (RATE LIMITER)
// =================================================================
const limitadorAutenticacao = rateLimit({
    windowMs: 15 * 60 * 1000, // Janela de 15 minutos
    max: 5, // Limita cada IP a 5 requisições por janela
    message: { error: 'Muitas tentativas feitas. Por favor, tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply para rotas sensíveis de login e cadastro
app.use('/login', limitadorAutenticacao);
app.use('/registrar', limitadorAutenticacao);

// =================================================================
// 📧 CONFIGURAÇÃO DO DISPARADOR DE E-MAILS (NODEMAILER)
// =================================================================
const transportadorEmail = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    secure: false, // true para 465, false para outras portas
    auth: {
        user: process.env.EMAIL_USER, // Seu e-mail de envio cadastrado no .env
        pass: process.env.EMAIL_PASS  // Sua senha de app configurada no .env
    }
});

// =================================================================
// CONEXÃO INTELIGENTE COM O BANCO DE DADOS
// =================================================================
const usarNuvem = process.env.DATABASE_URL ? true : false;
let db;

if (usarNuvem) {
    db = mysql.createConnection({
        uri: process.env.DATABASE_URL.split('?')[0],
        ssl: { rejectUnauthorized: false }
    });
} else {
    db = mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '32826039Xb$',
        database: process.env.DB_DATABASE || 'planilha_db',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    });
}

db.connect((err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        return;
    }
    console.log(usarNuvem ? '🚀 Conectado ao banco da AIVEN na nuvem!' : '💻 Conectado ao banco LOCAL!');
});

// =================================================================
// CONFIGURAÇÃO DO BOT DO WHATSAPP (Ajuste de Escopo Global)
// =================================================================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const whatsappEnabled = String(process.env.WHATSAPP_ENABLED || 'true').toLowerCase() === 'true';

let client = null;

if (whatsappEnabled) {
    client = new Client({
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

            const chatOrigem = msg.from;
            const numeroTelefone = msg.from.split('@')[0];

            console.log(`🤖 [WhatsApp Bot] Mensagem recebida! | Número detectado: ${numeroTelefone}`);

            const sqlBuscarUsuario = "SELECT id, email, nome FROM usuarios WHERE telefone = ?";

            db.query(sqlBuscarUsuario, [numeroTelefone], (err, results) => {
                if (err) {
                    console.error("❌ Erro ao buscar usuário pelo telefone:", err);
                    client.sendMessage(chatOrigem, "❌ Erro interno ao processar sua identidade.");
                    return;
                }

                if (results.length === 0) {
                    client.sendMessage(chatOrigem, `⚠️ *Número não vinculado!* \n\nO número _${numeroTelefone}_ não está cadastrado no sistema.`);
                    return;
                }

                const usuarioIdDinamico = results[0].id;
                const usuarioEmail = results[0].email;
                const usuarioNome = results[0].nome ? results[0].nome : "Usuário";

                const sqlInserirGasto = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";

                db.query(sqlInserirGasto, [descricao, valor, categoria, usuarioIdDinamico], (errInsert) => {
                    if (errInsert) {
                        client.sendMessage(chatOrigem, "❌ Desculpe, deu um erro ao tentar salvar o seu gasto.");
                        return;
                    }
                    client.sendMessage(chatOrigem, `Olá, *${usuarioNome}*! Seu gasto foi registrado com sucesso. 🎉\n\n👤 *Conta:* ${usuarioEmail}\n💰 *Valor:* R$ ${valor.toFixed(2)}\n📝 *Descrição:* ${descricao}\n🏷️ *Categoria:* ${categoria}`);
                });
            });
        }
    });

    console.log("🤖 Inicializando o Bot do WhatsApp...");
    client.initialize();
} else {
    console.log('⚠️ WhatsApp bot desabilitado via WHATSAPP_ENABLED=false.');
}

// =================================================================
// ROTAS DA API HTTP
// =================================================================
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

// NOVO: ROTA PARA SOLICITAR RECUPERAÇÃO DE SENHA
app.post('/esqueci-senha', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'O e-mail é obrigatório.' });

    const sql = "SELECT id, nome FROM usuarios WHERE email = ?";
    db.query(sql, [email.trim()], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Erro interno no servidor.' });
        
        // Medida de Segurança (Timing Attack): Sempre responda com sucesso para o front-end
        // para evitar que hackers fiquem testando quais e-mails existem ou não no seu banco.
        if (results.length === 0) {
            return res.json({ mensagem: "Um link de recuperação será enviado ao seu email! Não se esqueça de verificar a caixa de spam caso não encontre o email." });
        }

        const usuario = results[0];
        // Gera um token temporário que expira em 1 hora para redefinir a senha
        const tokenRecuperacao = jwt.sign({ id: usuario.id }, JWT_SECRET, { expiresIn: '1h' });

        // Link apontando para a nova tela de redefinição que você criará no front
        const linkRecuperacao = `${req.protocol}://${req.get('host')}/redefinir-senha.html?token=${tokenRecuperacao}`;

        const opcoesEmail = {
            from: `"Controle Financeiro 🪙" <${process.env.EMAIL_USER}>`,
            to: email.trim(),
            subject: 'Recuperação de Senha - Sistema Financeiro',
            html: `<h3>Olá, ${usuario.nome || 'Usuário'}!</h3>
                   <p>Você solicitou a redefinição de sua senha. Clique no link abaixo para criar uma nova senha:</p>
                   <a href="${linkRecuperacao}" target="_blank" style="display:inline-block; background:#00d2ff; color:#0a0f1d; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold;">REDEFINIR MINHA SENHA</a>
                   <p>Este link é válido por 1 hora. Se não foi você quem solicitou, ignore este e-mail.</p>`
        };

        transportadorEmail.sendMail(opcoesEmail, (errMail) => {
            if (errMail) {
                console.error("❌ Erro ao enviar e-mail:", errMail);
                return res.status(500).json({ error: "Erro ao disparar e-mail de recuperação." });
            }
            res.json({ mensagem: "Se o e-mail existir no sistema, um link de recuperação será enviado!" });
        });
    });
});

app.post('/registrar', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const senhaHash = await bcrypt.hash(senha, 10);
    const sql = "INSERT INTO usuarios (email, senha) VALUES (?, ?)";
    
    db.query(sql, [email, senhaHash], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Este e-mail já está cadastrado!" });
            return res.status(500).json({ error: "Erro interno no servidor de banco de dados." });
        }
        res.json({ mensagem: "Usuário criado com sucesso!" });
    });
});

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const sql = "SELECT * FROM usuarios WHERE email = ?";
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: "Erro interno no servidor." });
        if (results.length === 0) return res.status(401).json({ error: "Usuário ou senha incorretos." });
        
        const senhaCorreta = await bcrypt.compare(senha, results[0].senha);
        if (!senhaCorreta) return res.status(401).json({ error: "Usuário ou senha incorretos." });

        const token = jwt.sign({ id: results[0].id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ auth: true, token });
    });
});

app.post('/salvar', verificarToken, (req, res) => {
    const { descricao, valor_gastos, categoria } = req.body;
    if (!descricao || !categoria || !valor_gastos || isNaN(parseFloat(valor_gastos))) {
        return res.status(400).json({ error: 'Dados de gasto inválidos.' });
    }

    const sql = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";
    db.query(sql, [descricao, Number(valor_gastos), categoria, req.usuarioId], (err) => {
        if (err) return res.status(500).json({ error: 'Erro interno ao salvar gasto.' });
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
        if (err) return res.status(500).json({ error: "Erro ao deletar do banco de dados." });
        if (result.affectedRows === 0) return res.status(404).json({ error: "Gasto não encontrado." });
        res.json({ mensagem: "Gasto excluído com sucesso!" });
    });
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Rejeição não tratada detectada:', reason);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor ON na porta ${PORT}`));