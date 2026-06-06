import mysql from 'mysql2';

const usarNuvem = process.env.DATABASE_URL ? true : false;
let pool;

const configComumPool = {
    waitForConnections: true,
    connectionLimit: 10,
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

console.log(usarNuvem ? 'Conexão ativa na AIVEN!' : '');

export default pool;