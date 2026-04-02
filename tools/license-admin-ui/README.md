# license-admin-ui

Interface local minima para operar a CLI interna de licencas via subprocesso.

## Executar

Na pasta:

`D:\CannaConverter_2.0\tools\license-admin-ui`

Rode:

```powershell
npm install
npm run tauri:dev
```

## Regras

- a UI nao reimplementa emissao nem validacao
- a UI chama `tools/license-admin/src/cli.mjs`
- a chave privada continua externa
- nada desta ferramenta entra no app do cliente

## Overrides opcionais

- `LICENSE_ADMIN_UI_BASE_DIR`
- `LICENSE_ADMIN_UI_CLI_PATH`
- `LICENSE_ADMIN_UI_CONTRACT_PATH`
