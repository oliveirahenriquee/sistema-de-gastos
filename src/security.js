import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'chave_mestra_secreta';

export const limiteAutenticacao = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, 
    message: { error: 'Muitas tentativas feitas deste computador. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const limiteGeralDasRotas = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Aguarde um pouco. Muitas requisições foram feitas.' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Acesso negado!" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Token inválido!" });
        req.usuarioId = decoded.id;
        next();
    });
};