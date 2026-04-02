# license-admin

CLI interna para emissao e validacao local de licencas do Project Insights.

## Configuracao da chave privada

Coloque a chave em:
- `D:\LICENCAS_CANNACONVERTER2_0\private_key\private_key.pem`

Ou informe override com:
- `--private-key-file "D:\outro\caminho\private_key.pem"`

## Contrato compartilhado

A ferramenta e o app principal consomem o mesmo contrato em:
- `shared/license-contract.json`

Override opcional:
- `--license-contract-file "D:\outro\caminho\license-contract.json"`

## Emitir licenca

```powershell
node src/cli.mjs emitir --customer-name "Cliente Teste" --license-id "PI-0001" --plan annual --issued-at "2026-04-01T00:00:00.000Z" --expires-at "2027-04-01T00:00:00.000Z"
```

## Validar licenca

```powershell
node src/cli.mjs validar --file "D:\LICENCAS_CANNACONVERTER2_0\issued\PI-0001.license"
```

## Saidas padrao

- chave privada: `D:\LICENCAS_CANNACONVERTER2_0\private_key\private_key.pem`
- licencas emitidas: `D:\LICENCAS_CANNACONVERTER2_0\issued\`
- logs operacionais: `D:\LICENCAS_CANNACONVERTER2_0\logs\`
