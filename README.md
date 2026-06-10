# Backend Villela Stay

Proxy seguro da API Stays.net + receptor de webhooks + captura de leads do site.

## Rodar localmente
```powershell
cd backend
npm install
$env:STAYS_CLIENT_ID="..."; $env:STAYS_SECRET="..."
npm start
# http://localhost:3000/health
```

## Endpoints
| Rota | Função |
|------|--------|
| `GET /health` | Verificação de vida |
| `GET /api/anuncios` | Lista pública dos anúncios (para o site) |
| `GET /api/disponibilidade/:listingId?from=&to=` | Disponibilidade + preço por noite (para o motor de reservas do site) |
| `POST /api/leads` | Captura lead do formulário/chat do site `{nome, contato, mensagem}` |
| `POST /webhooks/stays` | Recebe webhooks da Stays (nova reserva, cancelamento) → `data/eventos.jsonl` |

## Publicação (necessária para webhooks e para o site consumir)
O backend precisa de uma URL pública. Opções recomendadas (deploy via Git):
- **Render.com** — plano gratuito serve para começar (dorme após inatividade)
- **Railway.app** — ~US$5/mês, sem dormir
Configurar as variáveis `STAYS_CLIENT_ID`/`STAYS_SECRET` no painel do serviço, nunca no código.
Depois, cadastrar a URL `https://<app>/webhooks/stays` nas notificações webhook da Stays.
