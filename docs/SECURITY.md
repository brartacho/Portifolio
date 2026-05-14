# Segurança do painel admin — Auditoria

> Última revisão: 2026-05-14

## Proteções ativas

| Camada | Mecanismo | Detalhes |
|---|---|---|
| Rate limiting | IP-based, Redis/memória | 5 tentativas / 15 min — retorna 429 + Retry-After |
| Senha | bcrypt (cost ≥ 10) | Hash armazenado na tabela `admin_credentials` ou variável de ambiente `ADMIN_PASSWORD_HASH` |
| Token de sessão | JWT HS256 | Expira em 8 h; secret em `JWT_SECRET` (env) |
| Erros genéricos | "Usuário ou senha incorretos." | Não revela qual dos dois está errado (mitiga enumeração) |
| Timing attack | `bcrypt.compare` sempre executa | Mesmo com usuário inválido — evita side-channel por tempo de resposta |
| Headers HTTP | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection | Configurados via `vercel.json` para todas as rotas `/api` e `/admin` |
| Robots | X-Robots-Tag: noindex,nofollow | Evita indexação da área admin |
| Audit log | Tabela `admin_login_attempts` | Registra IP, user-agent, resultado e dica do username em cada tentativa |

## Fluxo de autenticação

```
POST /api/admin/login
  → checkRateLimit (5/15min por IP)
  → isUsernameValid (email ou telefone)
  → fetch hash (admin_credentials > env fallback)
  → bcrypt.compare (sempre, independente do username)
  → logAttempt (admin_login_attempts — fire-and-forget)
  → 401 genérico  OU  JWT 8h
```

## Monitoramento

A aba **Métricas → Tentativas de acesso** mostra:
- Últimas 50 tentativas (IP, navegador, resultado, dica do login)
- **Alerta vermelho** + pulsação na aba quando ≥ 3 falhas do mesmo IP na última hora

A RPC `admin_login_recent` computa o contador de falhas em tempo real via subquery correlacionada.

## Pontos de atenção / recomendações futuras

### Alta prioridade

- **JWT rotation**: o token não é rotacionado nem revogável. Uma sessão comprometida dura até 8 h. Mitigação: armazenar `jti` no banco e validar a cada request, ou usar refresh tokens com validade curta (15–30 min).
- **2FA (TOTP)**: adicionar um segundo fator (e.g. Google Authenticator / TOTP via `otplib`) elimina o risco de credencial vazada.
- **Lockout progressivo**: atualmente o rate limiter bloqueia por 15 min após 5 tentativas. Considerar backoff exponencial (15 min → 1 h → 24 h) e notificação por e-mail a cada bloqueio.

### Média prioridade

- **HTTPS-only**: garantir que `Strict-Transport-Security` (HSTS) esteja configurado na camada Vercel/CDN.
- **Content Security Policy**: adicionar header CSP no `/admin` para limitar execução de scripts externos.
- **Notificação automática**: enviar e-mail/WhatsApp quando ≥ 3 falhas detectadas (usando a tabela `admin_login_attempts` + cron job leve).
- **Auditoria de sessões**: registrar quando/de onde o JWT é usado, não só quando é gerado.

### Baixa prioridade

- **Passkey / WebAuthn**: substituir senha + TOTP por autenticação biométrica no dispositivo.
- **IP allowlist**: para acesso a `/admin` aceitar apenas IPs conhecidos (conflita com mobilidade, mas reduz superfície de ataque).

## Variáveis de ambiente críticas

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JWT_SECRET` | Sim | Secret de assinatura dos tokens. Rotacionar invalida todas as sessões ativas. |
| `ADMIN_PASSWORD_HASH` | Fallback | Hash bcrypt da senha. Preferir `admin_credentials` no banco. |
| `ADMIN_EMAIL` | Sim | E-mail aceito como username. |
| `ADMIN_PHONE` | Opcional | Telefone aceito como username alternativo. |

> Nunca compartilhar valores dessas variáveis em logs, PRs, ou chats. Sempre editá-las diretamente no painel do Vercel ou no `.env` local.
