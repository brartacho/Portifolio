# Política de Segurança

## Modelo de Ameaças

Este portfólio expõe um painel administrativo em `https://artacho.dev/admin`
e endpoints autenticados em `/api/admin/*`. O modelo de ameaças considera:

- **Atacantes automatizados** — bots, scrapers, agentes LLM tentando força
  bruta, descoberta de endpoints, credential stuffing, abuse de envio de email.
- **Atacantes manuais** — alguém com acesso à página de login tentando senhas
  comuns, payloads de SQL/XSS, fuzz de parâmetros.
- **XSS / injection** — dados de visitante (CV, formulários) que poderiam
  servir como vetor de execução.
- **Vazamento de sessão** — JWT roubado por XSS, sniffing, CSRF.

**Fora de escopo** (sem mitigação dedicada por enquanto):
- Ataques físicos no dispositivo do administrador
- Comprometimento da máquina do administrador
- Insider threats no Vercel/Supabase/Cloudflare

## Camadas de Defesa Implementadas

### Borda (Cloudflare — config manual no dashboard)
- WAF Managed Rules (Free)
- Bot Fight Mode
- Rate Limit edge: 10 req/min em `/api/admin/login`
- Custom rules: bloqueio de UAs de ferramentas (`curl`, `python-requests`, etc) e ASNs de cloud providers
- Cloudflare Access (Zero Trust SSO) restringe `/admin` ao email autorizado
- Turnstile invisível no form de login (planejado)

### Aplicação (este repositório)
- **Headers HTTP estritos** ([vercel.json](vercel.json)): HSTS, CSP, Referrer-Policy,
  Permissions-Policy, COOP, X-Frame-Options, X-Content-Type-Options
- **CORS estrito** ([api/_lib/auth.js](api/_lib/auth.js)): allowlist explícita
  de origens (artacho.dev + previews Vercel + localhost dev)
- **Rate limit em 2 janelas** ([api/_lib/rate-limit.js](api/_lib/rate-limit.js)):
  - Burst: 5 falhas / 15min
  - Diária: 20 falhas / 24h
  - Conta APENAS falhas (logins bem-sucedidos não consomem slot)
- **Bot detection** ([api/_lib/bot-detection.js](api/_lib/bot-detection.js)):
  - Content-Type obrigatório `application/json`
  - Tamanho de payload < 8KB
  - User-Agent: rejeita vazio, longo demais, ou contendo padrões de automação
  - Honeypot: campo `website` invisível ao humano; bot que preenche → bloqueio
  - FillTime: tempo entre focar form e submeter < 800ms → bloqueio
- **Autenticação** ([api/admin/login.js](api/admin/login.js)):
  - bcrypt cost 12 + senha sempre comparada (defesa contra timing attack)
  - JWT HS256, expiração 8h (TODO Fase 2: reduzir para 1h + sliding refresh)
  - Mensagem de erro genérica (`Usuário ou senha incorretos`) para mitigar enumeração
- **Audit log** (tabela `admin_login_attempts`): IP, UA, sucesso/falha, hint do username
- **Alertas Telegram** ([api/_lib/notify.js](api/_lib/notify.js)):
  - Rate limit blocking → alerta imediato
  - Login bem-sucedido de IP novo (não visto em 30d)
  - Bot detection → alerta

### Roadmap (Fase 2+)
- JWT em cookie httpOnly + Secure + SameSite=Strict (substituir localStorage)
- TTL JWT 1h + sliding refresh
- Sessão revogável por JTI (tabela `admin_sessions`)
- Passkey/WebAuthn como 2º fator + "remember device 30d"
- Cloudflare Turnstile token no login
- Middleware de validação de Cf-Access-Jwt-Assertion no backend
- Rotação programada de `JWT_SECRET` (script `scripts/rotate-jwt-secret.mjs`)

## Reportar uma Vulnerabilidade

Se você descobriu uma vulnerabilidade, por favor **NÃO abra uma issue pública**.

Envie um email para **br.artacho@gmail.com** com:
- Descrição da vulnerabilidade
- Passos para reproduzir
- Impacto potencial
- (Opcional) Sugestão de mitigação

Respondo em até 72h. Não há programa de bug bounty monetário — é um projeto
de portfólio pessoal — mas crédito público no `SECURITY.md` é oferecido a
quem reportar de boa fé e responsavelmente.

## Versão das Dependências

Dependabot security alerts está habilitado no repositório. Vulnerabilidades
em deps são tratadas conforme severidade:
- Critical/High: patch em ≤24h
- Medium: patch em ≤7d
- Low: próximo ciclo de manutenção
