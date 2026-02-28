# Changelog - All Words

## [1.1.0] - 2026-02-27
### Adicionado
- **README.md**: Documentação inicial do projeto.
- **Sistema de Janelas de 1h**: Aulas agora ocupam um intervalo de 1 hora.
- **Proteção contra Sobreposição**: O sistema impede agendar duas aulas no mesmo intervalo de 60 minutos (Antigravity).

### Alterado
- **Níveis CEFR**: Atualizado o sistema de níveis de "Starter/Intermediate" para o padrão internacional A1, A2, B1, B2, C1, C2.
- **Gestão de Alunos**: Restaurado o campo de Status do Aluno no modal de edição do professor.
- **Exibição de Disponibilidade**: Alunos agora veem os horários ocupados do professor como intervalos (ex: 10:00 - 11:00).

### Corrigido
- **Regressão no Agendamento**: Corrigido erro onde o botão "Agendar Aula" recarregava a página involuntariamente.
- **Fechamento de Modais**: Corrigido problema onde o "X" e o botão "Cancelar" não fechavam os painéis.
- **Erro 404**: Resolvido o erro de arquivo ausente para `changelog.md`.
- **Alinhamento de UI**: Ajustado o posicionamento da seta no seletor de nível.

## [1.0.0] - 2026-02-26
### Lançamento Inicial
- Versão funcional com Dashboard de Professor e Aluno.
- Integração completa com Firebase.
