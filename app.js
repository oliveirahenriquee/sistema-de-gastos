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
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de conexão inteligente (Nuvem ou Local)
const ambienteLocal = String(process.env.AMBIENTE_LOCAL || '').toLowerCase() === 'true';

function criarConfigFromUrl(dbUrl) {
    const url = new URL(dbUrl);
    const config = {
        host: url.hostname,
        user: url.username,
        password: url.password,
        database: url.pathname.replace(/^\//, ''),
        port: url.port ? Number(url.port) : 3306
    };

    if (url.protocol === 'mysqls:' || url.searchParams.get('ssl') === 'true') {
        config.ssl = { rejectUnauthorized: false };
    }

    return config;
}

const databasePadrao = process.env.DB_DATABASE || 'defaultdb';

const dbConfig = ambienteLocal
    ? {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '32826039Xb$',
        database: databasePadrao,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
      }
    : process.env.DATABASE_URL
        ? criarConfigFromUrl(process.env.DATABASE_URL)
        : {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '32826039Xb$',
            database: databasePadrao,
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
          };

const db = mysql.createConnection(dbConfig);

console.log('🛠️ Banco selecionado:', {
    ambienteLocal,
    host: dbConfig.host,
    database: dbConfig.database,
    port: dbConfig.port
});

db.connect((err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        return;
    }
    console.log(ambienteLocal ? '💻 Conectado ao banco LOCAL!' : '🚀 Conectado ao banco da AIVEN na nuvem!');
});

// =================================================================
// CONFIGURAÇÃO DO BOT DO WHATSAPP (Ordem corrigida)
// =================================================================
// =================================================================
// CONFIGURAÇÃO DO BOT DO WHATSAPP (Ajuste de Escopo Global)
// =================================================================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const whatsappEnabled = String(process.env.WHATSAPP_ENABLED || 'true').toLowerCase() === 'true';

// Declaramos a variável aqui fora para que todo o arquivo possa enxergá-la
let client = null;

if (whatsappEnabled) {
    // Retiramos o 'const' daqui para reutilizar a variável global
    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    // 2. Configura os ouvintes de conexão (QR Code e Ready)
    client.on('qr', (qr) => {
        console.log('🤖 [WhatsApp Bot] QR Code gerado! Escaneie abaixo com o seu celular:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('🤖 🚀 [WhatsApp Bot] Conectado e pronto para ouvir mensagens!');
    });

    // OUVINTE DE MENSAGENS COM INSPEÇÃO DE NÚMERO E REGISTRO POR NOME
    client.on('message_create', async (msg) => {
        const texto = msg.body.trim();
        const partes = texto.split(' ');

        // Se a mensagem começar com um número e tiver pelo menos 3 partes (ex: 25 Lanche Alimentacao)
        if (partes.length >= 3 && !isNaN(partes[0].replace(',', '.'))) {
            const valor = parseFloat(partes[0].replace(',', '.'));
            const descricao = partes[1];
            const categoria = partes[2];

            // Captura o ID do chat e o número limpo que enviou a mensagem
            const chatOrigem = msg.from;
            const numeroTelefone = msg.from.split('@')[0];

            // 🔍 O ESPIÃO: Mostra no terminal o número exato para você validar com o Workbench
            console.log(`🤖 [WhatsApp Bot] Mensagem recebida! Texto: "${texto}" | Número detectado pelo Bot: ${numeroTelefone}`);

            // Busca o ID, E-mail e o Nome do usuário dono do número de telefone
            const sqlBuscarUsuario = "SELECT id, email, nome FROM usuarios WHERE telefone = ?";

            db.query(sqlBuscarUsuario, [numeroTelefone], (err, results) => {
                if (err) {
                    console.error("❌ Erro ao buscar usuário pelo telefone:", err);
                    client.sendMessage(chatOrigem, "❌ Erro interno ao processar sua identidade.");
                    return;
                }

                // Se não encontrou o número cadastrado no banco de dados
                if (results.length === 0) {
                    console.log(`⚠️ [WhatsApp Bot] O número ${numeroTelefone} tentou registrar um gasto mas não está cadastrado no banco.`);
                    client.sendMessage(chatOrigem, `⚠️ *Número não vinculado!* \n\nO número _${numeroTelefone}_ não está cadastrado no sistema. Ajuste o número na tabela 'usuarios' do Workbench para ficar exatamente igual a este.`);
                    return;
                }

                const usuarioIdDinamico = results[0].id;
                const usuarioEmail = results[0].email;
                const usuarioNome = results[0].nome ? results[0].nome : "Usuário";

                // Realiza o insert na tabela controle relacionando ao ID encontrado
                const sqlInserirGasto = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";

                db.query(sqlInserirGasto, [descricao, valor, categoria, usuarioIdDinamico], (errInsert, resultInsert) => {
                    if (errInsert) {
                        console.error("❌ Erro do bot ao salvar gasto:", errInsert);
                        client.sendMessage(chatOrigem, "❌ Desculpe, deu um erro ao tentar salvar o seu gasto.");
                        return;
                    }

                    // Retorna a mensagem customizada com o nome do usuário
                    client.sendMessage(chatOrigem, `Olá, *${usuarioNome}*! Seu gasto foi registrado com sucesso. 🎉\n\n👤 *Conta:* ${usuarioEmail}\n💰 *Valor:* R$ ${valor.toFixed(2)}\n📝 *Descrição:* ${descricao}\n🏷️ *Categoria:* ${categoria}`);
                });
            });
        }
    });

    console.log("🤖 Inicializando o Bot do WhatsApp...");
    client.initialize();
} else {
    console.log('⚠️ WhatsApp bot desabilitado via WHATSAPP_ENABLED=false. O servidor HTTP seguirá funcionando normalmente.');
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

app.post('/registrar', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

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
    if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const sql = "SELECT * FROM usuarios WHERE email = ?";
    db.query(sql, [email], async (err, results) => {
        if (err) {
            console.error("❌ Erro ao buscar usuário:", err);
            return res.status(500).json({ error: "Erro interno no servidor." });
        }
        if (results.length === 0) return res.status(401).json({ error: "Usuário não encontrado." });
        
        const senhaCorreta = await bcrypt.compare(senha, results[0].senha);
        if (!senhaCorreta) return res.status(401).json({ error: "Senha incorreta." });

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
        if (err) {
            console.error("❌ Erro ao salvar gasto:", err);
            return res.status(500).json({ error: 'Erro interno ao salvar gasto.' });
        }
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
            console.error("❌ Erro ao delete gasto:", err);
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