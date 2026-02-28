# All Words - Plataforma de Ensino de Inglês

Uma plataforma moderna para gestão de aulas de inglês, conectando professores e alunos com ferramentas de agendamento, acompanhamento de progresso (CEFR) e exercícios interativos.

## Funcionalidades Principais

### Para Professores
- **Gestão de Alunos**: Cadastro, edição de nível (A1-C2) e controle de status.
- **Agenda Inteligente**: Agendamento de aulas com proteção contra sobreposição (janela de 1h).
- **Acompanhamento**: Avaliação de habilidades (Reading, Writing, Listening, Speaking) com sistema de estrelas.
- **Exercícios**: Criação de exercícios manuais ou via IA para os alunos.

### Para Alunos
- **Dashboard Personalizado**: Visualização de progresso e próximas aulas.
- **Agendamento**: Possibilidade de solicitar aulas de reforço baseadas na disponibilidade do professor.
- **Material de Aula**: Acesso aos conteúdos e exercícios vinculados a cada aula.

## Tecnologias Utilizadas
- **Frontend**: Vanilla JS (ES6+), CSS3 (Variáveis, Flexbox, Grid).
- **Backend / Database**: Firebase Firestore.
- **Autenticação**: Firebase Auth (Google Sign-In).
- **UI/UX**: Lucide Icons, DatePickers customizados, Toast notifications.

## Configuração do Projeto
1. Clone o repositório.
2. Configure as credenciais do Firebase em `js/config/firebase.js`.
3. Inicie um servidor local (ex: `npx serve .`).
4. Acesse via navegador.

---
Desenvolvido para criar uma experiência de aprendizado fluida e organizada.
