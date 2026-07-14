Olá, esse projeto começou a partir de uma idéia que tive para controlar alguns gastos desnecessários que eu tinha e gostaria de me organizar financeiramente na época, no começo do projeto era um simples formulário de gastos, onde eu digitava as informações 
e o sistema salvava, bem simples e com visualização web apenas, mas aí com o tempo começaram a surgir as primeiras idéias de implementações e melhorias, como: Adicionar filtros por categoria, depois um gráfico com essas informações e se manteve assim por um tempo. 
Até que começou outro dilema: Não era prático ter que entrar no site toda vez que quisesse registrar um gasto novo, com isso veio a idéia da integração via whatsapp, e por meio de pesquisa, estudos e conversa com amigos dev's optei pelo bot, e basicamente foi isso.
Abaixo irei falar um pouco mais sobre o projeto e a parte técnica também. 


Controle Financeiro Inteligente & WhatsApp Bot
Um sistema robusto de gerenciamento de despesas pessoais que une um dashboard web interativo a um assistente inteligente no WhatsApp para lançamentos e consultas automatizadas em tempo real.

O Projeto
O objetivo deste ecossistema é descentralizar o controle financeiro. Em vez de abrir planilhas complexas, o usuário gerencia suas finanças direto pelo chat do WhatsApp com comandos simples. Os dados são processados e consolidados em um banco de dados em nuvem, alimentando um painel web com gráficos analíticos detalhados.

Principais Funcionalidades
Assistente do WhatsApp (whatsapp-web.js)
Lançamento Rápido: Basta enviar [Valor] [Descrição] [Categoria] (Ex: 35.00 Açaí Lazer) para registrar o gasto instantaneamente.

Consulta de Acumulados: Comandos como gasto total respondem com o balanço somado e agrupado por todas as categorias.

Relatório Diário: Envie "quanto gastei hoje" para receber a soma exata dos lançamentos do dia atual.

Resiliência em Nuvem: Sistema de limpeza de travas do Chromium para garantir o funcionamento estável (Zero Downtime) e persistência de sessão.

Painel Web & API HTTP (Express.js)
Visualização Analítica: Gráficos interativos (via Chart.js) integrados à API para exibir tendências de gastos por categoria.

Segurança Avançada:

Criptografia de senhas com bcryptjs e autenticação segura baseada em JWT.

Proteção de cabeçalhos HTTP via helmet.

Limitadores de requisições (express-rate-limit) diferenciados para mitigar ataques de força bruta e DoS.

Interface Amigável (UX): Cadastro e login integrados com recurso de alternância de visibilidade de senha (mostrar/esconder).

Tecnologias Utilizadas
Back-end & Infraestrutura
Runtime: Node.js (v22+) configurado nativamente com ES Modules (import/export)

Framework Web: Express.js (v5)

Banco de Dados: MySQL (Pool de conexões escalável integrado localmente e em nuvem via Aiven)

Automação de Mensagens: whatsapp-web.js & Puppeteer (rodando em ambiente Linux isolado)

Hospedagem: Render (Web Service + Disco Volumétrico Persistente para sessões do Chrome)

Comunicação & Segurança
Autenticação: JSON Web Tokens (jsonwebtoken)

Segurança: Helmet, CORS, e Express Rate Limit

Disparador de E-mails: Nodemailer (para fluxo de recuperação de senha)

📂 Estrutura Arquitetural do Código
O projeto adota uma arquitetura modularizada focada em limpa separação de responsabilidades (Clean Code):

Plaintext
├── public/               # Front-end estático (HTML, CSS, JS, Componentes)
├── src/
│   ├── conexoes.js       # Gerenciamento e Pool do Banco de Dados
│   ├── security.js       # Middlewares de segurança, JWT e Rate Limiters
│   ├── rotas.js          # Roteador Express contendo as rotas da API HTTP
│   └── bot.js            # Inteligência, comandos e tratamento de eventos do WhatsApp
├── .env                  # Variáveis de ambiente protegidas
├── app.js                # Arquivo principal (Maestro de inicialização)
└── package.json          # Manifesto do projeto e dependências globais
🔧 Variáveis de Ambiente Necessárias
Para rodar o projeto localmente ou em produção, configure o arquivo .env com as seguintes chaves:

Snippet de código
PORT=3000
DATABASE_URL=your_mysql_cloud_uri
JWT_SECRET=your_master_jwt_secret
URL_SITE=your_production_url
WHATSAPP_ENABLED=true
WWEBJS_AUTH_PATH=/data/.wwebjs_auth_definitivo
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password

🧑‍💻 Autor
Henrique Gonçalves — Engenheiro de Software em Formação

GitHub: [oliveirahenriquee]
