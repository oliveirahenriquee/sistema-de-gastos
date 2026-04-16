require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err.message);
        return;
    }
    console.log('Motor ligado! Conectado ao MySQL no Aiven.');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/salvar', (req, res) => {
    const { descricao, valor_gastos, categoria } = req.body; 
    const sql = "INSERT INTO controle (descricao, valor_gastos, categoria) VALUES (?, ?, ?)";
    db.query(sql, [descricao, valor_gastos, categoria], (err, result) => {
        if (err) return res.status(500).json({ mensagem: "Erro ao salvar" });
        res.json({ mensagem: "Lançamento realizado com sucesso!" });
    });
});

app.get('/listar', (req, res) => {
    const sql = "SELECT * FROM controle ORDER BY data_registro DESC";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/excluir/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM controle WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ mensagem: "Excluído com sucesso!" });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});