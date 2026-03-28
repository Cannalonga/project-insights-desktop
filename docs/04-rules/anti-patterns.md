# CannaConverter 2.0 — Anti-Patterns

## Proibido

### Arquitetura

- Criar backend
- Criar API
- Criar banco de dados
- Criar microserviços
- Criar filas
- Criar comunicação externa

---

### Código

- Criar classes desnecessárias
- Criar serviços genéricos
- Criar factories sem necessidade
- Usar dependency injection
- Criar camadas extras

---

### Abstração

- Generalizar código sem necessidade
- Criar interfaces antecipadamente
- Criar padrões complexos sem motivo

---

### Execução

- Ignorar erros
- Silenciar falhas
- Corrigir dados automaticamente sem registro

---

### Estrutura

- Misturar UI com lógica de negócio
- Misturar parsing com validação
- Misturar export com transformação

---

## Sinais de alerta

Se qualquer um destes acontecer, parar imediatamente:

- código difícil de entender
- necessidade de explicar demais uma função
- criação de estruturas “genéricas”
- aumento rápido de complexidade

---

## Regra Final

Se parece complexo demais para o problema, está errado.
