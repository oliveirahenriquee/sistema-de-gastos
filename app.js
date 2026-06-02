require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const helmet = require('helmet');

const app = express();

// =================================================================
// 🛡️ CONFIGURAÇÃO DE SEGURANÇA HTTP (HELMET & CORS)
// =================================================================
app.use(helmet({
    contentSecurityPolicy: false, // Mantido em false para não bloquear os gráficos do Chart.js
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 🔒 CONTROLE DE FLUXO E ATAQUES (RATE LIMITERS DIFERENCIADOS)
// =================================================================
const limiteAutenticacao = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, 
    message: { error: 'Muitas tentativas feitas deste computador. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const limiteGeralDasRotas = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 60, // Máximo de 60 requisições por minuto por IP
    message: { error: 'Calma lá! Você está gerando requisições rápido demais.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Aplicando os limitadores nos alvos corretos
app.use('/login', limiteAutenticacao);
app.use('/registrar', limiteAutenticacao);
app.use('/esqueci-senha', limiteAutenticacao);

// Rotas de manipulação de dados protegidas pelo limite geral
app.use('/salvar', limiteGeralDasRotas);
app.use('/listar', limiteGeralDasRotas);
app.use('/excluir', limiteGeralDasRotas);

// =================================================================
// 📧 CONFIGURAÇÃO DO DISPARADOR DE E-MAILS (NODEMAILER)
// =================================================================
const transportadorEmail = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// =================================================================
// 🛠️ POOL DE CONEXÕES INTELIGENTE (Performance Escalável)
// =================================================================
const usarNuvem = process.env.DATABASE_URL ? true : false;
let pool;

const configComumPool = {
    waitForConnections: true,
    connectionLimit: 10, // Abre até 10 conexões simultâneas sob demanda
    queueLimit: 0
};

if (usarNuvem) {
    pool = mysql.createPool({
        uri: process.env.DATABASE_URL.split('?')[0],
        ssl: { rejectUnauthorized: false },
        ...configComumPool
    });
} else {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD, 
        database: process.env.DB_DATABASE || 'planilha_db',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        ...configComumPool
    });
}

const db = pool; 

console.log(usarNuvem ? '🚀 Pool de conexões ativado na AIVEN (Nuvem)!' : '💻 Pool de conexões ativado LOCALMENTE!');

// =================================================================
// CONFIGURAÇÃO DO BOT DO WHATSAPP (Blindado contra loops)
// =================================================================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const whatsappEnabled = String(process.env.WHATSAPP_ENABLED || 'true').toLowerCase() === 'true';

let client = null;

if (whatsappEnabled) {
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth' 
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-default-apps',
                '--proxy-server="direct://"',
                '--proxy-bypass-list=*',
                '--js-flags="--max-old-space-size=150"' 
            ],
        }
    });

    client.on('qr', (qr) => {
        console.log('🤖 [WhatsApp Bot] QR Code gerado! Escaneie abaixo com o seu celular:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('🤖 🚀 [WhatsApp Bot] Conectado e pronto para ouvir mensagens!');
    });

    // Escuta estritamente mensagens RECEBIDAS (ignora as enviadas pelo próprio bot)
    client.on('message', async (msg) => {
        if (msg.fromMe) return;

        const texto = msg.body.trim();
        const partes = texto.split(' ');

        if (partes.length >= 3 && !isNaN(partes[0].replace(',', '.'))) {
            const valor = parseFloat(partes[0].replace(',', '.'));
            const descricao = partes[1];
            const category = partes[2];

            const chatOrigem = msg.from;
            
            // Trata a string para capturar apenas os números puros do WhatsApp
            const numeroTelefone = msg.from.replace('@c.us', '').replace('@s.whatsapp.net', '').trim();

            console.log(`🤖 [WhatsApp Bot] Mensagem recebida! | Número limpo detectado: ${numeroTelefone}`);

            const sqlBuscarUsuario = "SELECT id, email, nome FROM usuarios WHERE telefone = ?";

            db.query(sqlBuscarUsuario, [numeroTelefone], (err, results) => {
                if (err) {
                    console.error("❌ Erro ao buscar usuário pelo telefone:", err);
                    client.sendMessage(chatOrigem, "❌ Erro interno ao processar sua identidade.");
                    return;
                }

                if (results.length === 0) {
                    // Retorna o número limpo exato no chat para facilitar o seu vínculo no Workbench
                    client.sendMessage(chatOrigem, `⚠️ *Número não vinculado!* \n\nO número identificado no seu WhatsApp é: *${numeroTelefone}*.\n\nConfigure este número exato na sua conta pelo banco de dados.`);
                    return;
                }

                const usuarioIdDinamico = results[0].id;
                const usuarioEmail = results[0].email;
                const usuarioNome = results[0].nome ? results[0].nome : "Usuário";

                const sqlInserirGasto = "INSERT INTO controle (descricao, valor_gastos, category, usuario_id) VALUES (?, ?, ?, ?)";

                db.query(sqlInserirGasto, [descricao, valor, category, usuarioIdDinamico], (errInsert) => {
                    if (errInsert) {
                        client.sendMessage(chatOrigem, "❌ Desculpe, deu um erro ao tentar salvar o seu gasto.");
                        return;
                    }
                    client.sendMessage(chatOrigem, `Olá, *${usuarioNome}*! Seu gasto foi registrado com sucesso. 🎉\n\n👤 *Conta:* ${usuarioEmail}\n💰 *Valor:* R$ ${valor.toFixed(2)}\n📝 *Descrição:* ${descricao}\n🏷️ *Categoria:* ${category}`);
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
// ROTAS DA API HTTP (AUTENTICAÇÃO & SISTEMA)
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

// ROTA PARA SOLICITAR RECUPERAÇÃO DE SENHA
app.post('/esqueci-senha', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'O e-mail é obrigatório.' });

    const sql = "SELECT id, nome FROM usuarios WHERE email = ?";
    db.query(sql, [email.trim()], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Erro interno no servidor.' });
        
        if (results.length === 0) {
            return res.json({ mensagem: "Um link de recuperação será enviado ao seu email! Não se esqueça de verificar a caixa de spam caso não encontre o email." });
        }

        const usuario = results[0];
        const tokenRecuperacao = jwt.sign({ id: usuario.id }, JWT_SECRET, { expiresIn: '1h' });
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

// ROTA DE REGISTRO DE USUÁRIO
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

// ROTA DE LOGIN
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

// ROTA PARA SALVAR GASTO (WEB)
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

// ROTA PARA LISTAR GASTOS (WEB)
app.get('/listar', verificarToken, (req, res) => {
    const sql = "SELECT * FROM controle WHERE usuario_id = ? ORDER BY data_registro DESC";
    db.query(sql, [req.usuarioId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// ROTA PARA EXCLUIR GASTO (WEB)
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