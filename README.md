# TI Hub — módulo de impressoras

Esqueleto inicial para validar acesso SNMP de um contêiner Docker a uma impressora da rede local. O teste faz uma consulta SNMP v2c ao OID numérico `sysDescr` (`1.3.6.1.2.1.1.1.0`). Ainda não há banco de dados nem coleta agendada.

## Requisitos

- Docker Desktop com Docker Compose ativo.
- A máquina deve conseguir acessar a impressora pela rede em UDP 161.
- SNMP v2c deve estar habilitado na impressora, com a comunidade correta.

Node.js no Windows é opcional para este teste: o contêiner instala as dependências e compila o TypeScript.

## Estado da validação

Em 28/10/2026, a consulta de `sysDescr` a `192.168.0.51` funcionou tanto no Windows quanto dentro do Docker. O contêiner recebeu a descrição `RICOH Aficio SP 3510SF V2.10` via SNMP v2c em UDP 161. A execução com `docker compose run --rm snmp-check` terminou com código de saída zero.

## Executar

No PowerShell, na raiz do projeto:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e confira `SNMP_HOST` e `SNMP_COMMUNITY`. O arquivo `.env` não é versionado pelo Git. Depois execute:

```powershell
docker compose build
docker compose up -d api
Invoke-RestMethod http://127.0.0.1:3000/health
docker compose run --rm snmp-check
```

O último comando mostra `reachable: true` e a descrição enviada pela impressora se o SNMP responder. Em caso de erro, mostra `reachable: false` e termina com código de saída diferente de zero. Ele não altera a impressora.

Para encerrar a API:

```powershell
docker compose down
```

## Diagnóstico

Se houver timeout, verifique o IP, a comunidade SNMP, o acesso UDP 161 e as regras de firewall/VPN. Compare a consulta no Windows com a consulta dentro do contêiner; respostas diferentes apontam para a rota de rede do Docker. A API de teste publica apenas a porta HTTP 3000 em `127.0.0.1`; consultas SNMP de saída não exigem publicar a porta 161.

## Próxima etapa

Com o acesso SNMP validado, a próxima etapa é expandir `src/modules/printers` com consultas de status, normalização, persistência e agendamento. O plano acordado para a persistência é Prisma com PostgreSQL.
