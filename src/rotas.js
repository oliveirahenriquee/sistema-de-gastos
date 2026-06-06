import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

import db from './conexoes.js';
import { limiteAutenticacao, limiteGeralDasRotas, verificarToken, JWT_SECRET } from './security.js';

const router = express.Router();

const transportadorEmail = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

router.post('/login', limiteAutenticacao, (req, res) => {
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

router.post('/registrar', limiteAutenticacao, async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const senhaHash = await bcrypt.hash(senha, 10);
    const sql = "INSERT INTO usuarios (email, senha) VALUES (?, ?)";
    
    db.query(sql, [email, senhaHash], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Este e-mail já está cadastrado!" });
            return res.status(500).json({ error: "Erro interno no banco de dados." });
        }
        res.json({ mensagem: "Usuário criado com sucesso!" });
    });
});

router.post('/esqueci-senha', limiteAutenticacao, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'O e-mail é obrigatório.' });

    const sql = "SELECT id, nome FROM usuarios WHERE email = ?";
    db.query(sql, [email.trim()], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Erro interno no servidor.' });
        if (results.length === 0) {
            return res.json({ mensagem: "Se o e-mail existir no sistema, um link de recuperação será enviado!" });
        }

        const usuario = results[0];
        const tokenRecuperacao = jwt.sign({ id: usuario.id }, JWT_SECRET, { expiresIn: '1h' });
        const linkRecuperacao = `${req.protocol}://${req.get('host')}/redefinir-senha.html?token=${tokenRecuperacao}`;

        const opcoesEmail = {
            from: `"Controle Financeiro." <${process.env.EMAIL_USER}>`,
            to: email.trim(),
            subject: 'Recuperação de Senha',
            html: `<p>Clique no link abaixo para redefinir sua senha:</p><a href="${linkRecuperacao}">REDEFINIR SENHA</a>`
        };

        transportadorEmail.sendMail(opcoesEmail, (errMail) => {
            if (errMail) return res.status(500).json({ error: "Erro ao disparar e-mail." });
            res.json({ mensagem: "Link de recuperação enviado com sucesso!" });
        });
    });
});

router.post('/salvar', limiteGeralDasRotas, verificarToken, (req, res) => {
    const { descricao, valor_gastos, categoria } = req.body;
    if (!descricao || !categoria || !valor_gastos || isNaN(parseFloat(valor_gastos))) {
        return res.status(400).json({ error: 'Dados inválidos.' });
    }

    const sql = "INSERT INTO controle (descricao, valor_gastos, categoria, usuario_id) VALUES (?, ?, ?, ?)";
    db.query(sql, [descricao, Number(valor_gastos), categoria, req.usuarioId], (err) => {
        if (err) return res.status(500).json({ error: 'Erro ao salvar gasto.' });
        res.json({ mensagem: "Salvo com sucesso!" });
    });
});

router.get('/listar', limiteGeralDasRotas, verificarToken, (req, res) => {
    const sql = "SELECT * FROM controle WHERE usuario_id = ? ORDER BY data_registro DESC";
    db.query(sql, [req.usuarioId], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

router.delete('/excluir/:id', limiteGeralDasRotas, verificarToken, (req, res) => {
    const sql = "DELETE FROM controle WHERE id = ? AND usuario_id = ?";
    db.query(sql, [req.params.id, req.usuarioId], (err, result) => {
        if (err) return res.status(500).json({ error: "Erro ao deletar." });
        res.json({ mensagem: "Gasto excluído com sucesso!" });
    });
});

export default router;