import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './conexoes.js';

const whatsappEnabled = String(process.env.WHATSAPP_ENABLED || 'true').toLowerCase() === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inicializarBot = () => {
    if (!whatsappEnabled) {
        console.log('WhatsApp bot desabilitado via WHATSAPP_ENABLED=false.');
        return;
    }

    const authPath = process.env.WWEBJS_AUTH_PATH || path.join(__dirname, '../.wwebjs_auth');

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: authPath }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--single-process', '--disable-gpu', '--no-default-browser-check',
                '--disable-extensions', '--disable-default-apps', '--proxy-server=direct://',
                '--proxy-bypass-list=*', '--js-flags=--max-old-space-size=150'
            ],
        }
    });

    client.on('qr', (qr) => {
        console.log('QR Code gerado. Escaneie para conectar o bot ao WhatsApp:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log(' Conectado e pronto!');
    });

    client.on('message', async (msg) => {
        if (msg.fromMe) return;

        const texto = msg.body.trim().toLowerCase();
        const partes = msg.body.trim().split(' ');
        const chatOrigem = msg.from;
        
        const numeroTelefone = msg.from.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').trim();
        const URL_SITE = process.env.URL_SITE;

        if (texto === 'gasto total' || texto === 'gastos totais' || texto === 'quanto gastei') {
            console.log(`Consulta de gastos totais para: ${numeroTelefone}`);
            
            const sqlTotal = `
                SELECT c.categoria, SUM(c.valor_gastos) as total_categoria, u.nome, u.email
                FROM usuarios u
                LEFT JOIN controle c ON u.id = c.usuario_id
                WHERE u.telefone = ?
                GROUP BY c.categoria, u.nome, u.email
            `;

            db.query(sqlTotal, [numeroTelefone], (err, results) => {
                if (err) {
                    console.error("Erro ao buscar gastos totais:", err);
                    client.sendMessage(chatOrigem, "Erro ao consultar seus gastos no banco.");
                    return;
                }
                if (results.length === 0) {
                    client.sendMessage(chatOrigem, "Número não vinculado ou nenhum gasto anotado ainda.");
                    return;
                }

                const usuarioNome = results[0].nome || "Usuário";
                let somaGeral = 0;
                let mensagem = `*Resumo Geral dos seus Gastos* \nOlá, *${usuarioNome}*! Aqui está o acumulado até o momento:\n\n`;

                results.forEach(row => {
                    if (row.categoria) {
                        const valor = parseFloat(row.total_categoria);
                        somaGeral += valor;
                        mensagem += `🏷️ *${row.categoria}:* R$ ${valor.toFixed(2)}\n`;
                    }
                });

                if (somaGeral === 0) {
                    mensagem += "Você ainda não possui nenhum gasto registrado!";
                } else {
                    mensagem += `\n*TOTAL ACUMULADO:* R$ ${somaGeral.toFixed(2)}`;
                    mensagem += `\n\nAcompanhe os gráficos detalhados no site:\n👉 ${URL_SITE}`;
                }

                client.sendMessage(chatOrigem, mensagem);
            });
            return;
        }

        if (texto === 'gasto hoje' || texto === 'gastos de hoje' || texto === 'quanto gastei hoje') {
            console.log(`Consulta de gastos do dia para: ${numeroTelefone}`);
            
            const sqlHoje = `
                SELECT c.categoria, SUM(c.valor_gastos) as total_categoria, u.nome
                FROM usuarios u
                INNER JOIN controle c ON u.id = c.usuario_id
                WHERE u.telefone = ? AND DATE(c.data_registro) = CURDATE()
                GROUP BY c.categoria, u.nome
            `;

            db.query(sqlHoje, [numeroTelefone], (err, results) => {
                if (err) {
                    console.error("Erro ao buscar gastos de hoje:", err);
                    client.sendMessage(chatOrigem, "Erro ao consultar seus gastos de hoje.");
                    return;
                }

                if (results.length === 0) {
                    db.query("SELECT nome FROM usuarios WHERE telefone = ?", [numeroTelefone], (errUser, userRes) => {
                        if (userRes && userRes.length > 0) {
                            client.sendMessage(chatOrigem, `*Gastos de Hoje* \nOlá, *${userRes[0].nome || 'Usuário'}*!\n\nVocê ainda não registrou nenhum gasto hoje.\n\n Site: ${URL_SITE}`);
                        } else {
                            client.sendMessage(chatOrigem, "*Número não vinculado!* Cadastre seu telefone no sistema.");
                        }
                    });
                    return;
                }

                const usuarioNome = results[0].nome || "Usuário";
                let somaHoje = 0;
                let mensagem = `*Seus Gastos de Hoje* \nOlá, *${usuarioNome}*! Aqui está o que você gastou hoje:\n\n`;

                results.forEach(row => {
                    const valor = parseFloat(row.total_categoria);
                    somaHoje += valor;
                    mensagem += ` *${row.categoria}:* R$ ${valor.toFixed(2)}\n`;
                });

                mensagem += `\n*TOTAL HOJE:* R$ ${somaHoje.toFixed(2)}`;
                mensagem += `\n\nVisualize os relatórios no painel:\n ${URL_SITE}`;

                client.sendMessage(chatOrigem, message);
            });
            return;
        }

        if (partes.length >= 3 && !isNaN(partes[0].replace(',', '.'))) {
            const valor = parseFloat(partes[0].replace(',', '.'));
            const descricao = partes[1];
            const categoria = partes[2]; 

            console.log(`Mensagem de registro recebida! | Número: ${numeroTelefone}`);

            const sqlBuscarUsuario = "SELECT id, email, nome FROM usuarios WHERE telefone = ?";

            db.query(sqlBuscarUsuario, [numeroTelefone], (err, results) => {
                if (err) {
                    console.error("Erro ao buscar usuário pelo telefone:", err);
                    client.sendMessage(chatOrigem, "Erro interno ao processar sua identidade.");
                    return;
                }

                if (results.length === 0) {
                    client.sendMessage(chatOrigem, `*Número não vinculado!* \n\nO número identificado no seu WhatsApp é: *${numeroTelefone}*.\n\nConfigure ele para no sistema para utilizar o serviço.`);
                    return;
                }

                const usuarioIdDinamico = results[0].id;
                const usuarioEmail = results[0].email;
                const usuarioNome = results[0].nome ? results[0].nome : "Usuário";

                const sqlInserirGasto = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";

                db.query(sqlInserirGasto, [descricao, valor, categoria, usuarioIdDinamico], (errInsert) => {
                    if (errInsert) {
                        console.error("Erro no INSERT do MySQL:", errInsert);
                        client.sendMessage(chatOrigem, "Desculpe, deu um erro ao tentar salvar o seu gasto.");
                        return;
                    }
                    
                    client.sendMessage(chatOrigem, `Olá, *${usuarioNome}*! Seu gasto foi registrado com sucesso.\n\n*Conta:* ${usuarioEmail}\n*Valor:* R$ ${valor.toFixed(2)}\n*Descrição:* ${descricao}\n*Categoria:* ${categoria}\n\n*Veja seu gráfico atualizado no site:*\n${URL_SITE}`);
                });
            });
        }
    });

    const travaRaiz = path.join(authPath, 'SingletonLock');
    const travaDefault = path.join(authPath, 'Default', 'SingletonLock');
    const socketRaiz = path.join(authPath, 'SingletonSocket');
    const socketDefault = path.join(authPath, 'Default', 'SingletonSocket');
    
    const arquivosParaRemover = [travaRaiz, travaDefault, socketRaiz, socketDefault];

    arquivosParaRemover.forEach((caminhoArquivo) => {
        try {
            if (fs.existsSync(caminhoArquivo)) {
                fs.unlinkSync(caminhoArquivo);
                console.log(`Removido com sucesso: ${caminhoArquivo}`);
            }
        } catch (e) {
            console.log(`Não foi possível remover ${caminhoArquivo}:`, e.message);
        }
    });

    console.log("Inicializando...");
    client.initialize();
};

export default inicializarBot;