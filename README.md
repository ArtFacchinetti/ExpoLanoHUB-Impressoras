# TI Hub — módulo de impressoras

Módulo inicial de monitoramento de impressoras. Consulta equipamentos por SNMP v2c, salva o último estado no PostgreSQL e registra mudanças e contadores. A API, a coleta e o banco rodam com Docker Compose.

## Iniciar

Requisito: Docker Desktop com Docker Compose ativo e acesso da máquina às impressoras em UDP 161.

Na primeira execução, copie o exemplo e edite `.env`:

```powershell
Copy-Item .env.example .env
```

Defina `PRINTER_HOSTS` com os IPs separados por vírgula e ajuste `SNMP_COMMUNITY`. Escolha uma senha local para `POSTGRES_PASSWORD` e use a mesma em `DATABASE_URL`. O `.env` é ignorado pelo Git. No workspace atual, ele está configurado com os IPs `192.168.0.50` a `.56`; `.55` está cadastrada, mas não respondeu ao SNMP no teste de 29/10/2026.

`PRINTER_HOSTS` é a lista cadastrada na inicialização. `SNMP_HOST` serve apenas ao comando de diagnóstico `snmp-check`; mudar `SNMP_HOST` não adiciona uma impressora à coleta. Para adicionar um IP enquanto a API está rodando, use `POST /printers`. O cadastro fica no banco e o agendador passará a consultá-lo. Mantenha também o IP em `PRINTER_HOSTS` para documentar a configuração local.

Suba o banco, aplique as migrações e inicie a API:

```powershell
docker compose up --build -d api
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/printers/status
```

O Compose aguarda o banco ficar saudável e a migração terminar antes de iniciar a API. Na inicialização, a aplicação cadastra os IPs de `PRINTER_HOSTS` sem duplicá-los e dispara as primeiras consultas. Depois consulta `FAST` a cada 30 segundos e `NORMAL` a cada 300 segundos, por padrão.

Execute uma única instância da API nesta fase: ela também contém o agendador. Múltiplas instâncias fariam coletas duplicadas.

Para ver os registros diretamente no PostgreSQL:

```powershell
docker compose exec db psql -U ti_hub -d ti_hub -c 'SELECT count(*) FROM printer_status;'
```

Para parar os serviços, use `docker compose down`. O banco usa o volume nomeado `impressoras_postgres_data`; ele permanece quando o contêiner para ou é recriado. `docker compose down -v` remove esse volume e os dados. O volume não substitui um backup externo, que ainda precisa ser configurado antes de usar o sistema como fonte crítica de relatórios.

## API local

| Método | Rota | Função |
| --- | --- | --- |
| GET | `/health` | Verifica API e banco |
| GET | `/printers` | Lista o cadastro |
| GET | `/printers/status` | Lista cadastro e último status |
| GET | `/printers/{id}/status` | Obtém uma impressora e seu status |
| GET | `/printers/events` | Lista até 100 mudanças recentes; aceita `?printerId=...` |
| POST | `/printers` | Cadastra ou reutiliza um IP: `{"ip":"192.168.0.55"}` |
| POST | `/printers/{id}/poll` | Executa coleta manual: `{"level":"FAST"}` ou `{"level":"NORMAL"}` |

As portas da API e do banco estão vinculadas a `127.0.0.1` no host. A API ainda não possui autenticação e deve permanecer local nesta fase.

## Como os dados são salvos

- `printers`: IP único, identificação e configuração de cadastro.
- `printer_status`: um registro por impressora com o último estado, visor, contadores, suprimentos e horários de consulta, sucesso e mudança.
- `printer_events`: somente mudanças de disponibilidade, estado ou texto do visor. Uma nova consulta com `Ready` igual ao anterior não gera outro evento.
- `printer_metrics`: amostras dos contadores obtidas nas consultas `NORMAL`.

`FAST` atualiza estado, visor e uptime sem apagar contadores ou suprimentos. `NORMAL` atualiza contadores e suprimentos sem apagar estado e visor. Se uma tabela de suprimentos falhar, os dados anteriores são preservados. Três falhas consecutivas de consulta marcam a impressora como offline; uma resposta válida zera a contagem.

Os valores de suprimento são salvos como **valores brutos**. Por exemplo, `levelRaw: "-3"` não é tratado como porcentagem. A aplicação usa OIDs numéricos internamente. As gravações produzidas por cada coleta são feitas em uma transação do banco.

Esta versão coleta identificação, uptime, estado, visor, contador e suprimentos. A leitura detalhada de alertas e bandejas fica para a próxima ampliação do módulo.

## Diagnóstico SNMP

Para repetir somente o teste de conectividade, sem escrever no banco:

```powershell
docker compose run --rm snmp-check
```

O teste consulta `sysDescr` no IP `SNMP_HOST` de `.env` e mostra `reachable: true` se houver resposta. Em 28/10/2026, ele identificou uma `RICOH Aficio SP 3510SF V2.10` tanto no Windows quanto dentro do Docker.

## Desenvolvimento e versionamento

O projeto usa [versionamento semântico](https://semver.org/lang/pt-BR/): `0.1.0` foi o teste SNMP; `0.2.0` adiciona persistência e coleta automática. O [CHANGELOG.md](CHANGELOG.md) registra as entregas. As alterações de banco ficam em `prisma/migrations/` e são aplicadas com `prisma migrate deploy` pelo serviço `migrate`.

Com Node.js 24 instalado localmente, execute `npm ci`, `npm run db:generate`, `npm test`. A configuração do Prisma usa `DATABASE_URL` do `.env` e a porta local `5433`.
