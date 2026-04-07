require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT, // Adicione esta linha!
    ssl: { rejectUnauthorized: false } // Adicione esta linha para o Aiven aceitar
});

db.connect(err => {
    if (err) {
        console.error('Erro ao conectar:', err.message);
        return;
    }
    console.log('Motor ligado! Conectado ao MySQL.');
});

// ROTAS
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

app.get('/dados-dashboard', (req, res) => {
    const sql = "SELECT categoria, SUM(valor_gastos) as total FROM controle GROUP BY categoria";
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

// IMPORTANTE: '0.0.0.0' permite que o tablet acesse o PC
app.listen(3000, '0.0.0.0', () => {
    console.log('Servidor ACESSÍVEL NA REDE! Use o IP do seu PC na porta 3000');
});