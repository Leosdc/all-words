import { authService } from '../services/auth-service.js';

export const Sidebar = {
    render: (user, activeItem) => {
        const role = user.role || authService.currentRole;
        const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Usuário');

        if (role === 'student') {
            return `
                <aside class="sidebar">
                    <div class="logo-text" style="margin-bottom: 3rem;">All Words</div>
                    <nav>
                        <div class="nav-item ${activeItem === 'dash' ? 'active' : ''}" id="nav-dash"><i data-lucide="layout-dashboard"></i> Dashboard</div>
                        <div class="nav-item ${activeItem === 'classes' ? 'active' : ''}" id="nav-classes"><i data-lucide="book-open"></i> Minhas Aulas</div>
                        <div class="nav-item ${activeItem === 'agenda' ? 'active' : ''}" id="nav-agenda"><i data-lucide="calendar-plus"></i> Agenda</div>
                        <div style="margin-top: auto;"></div>
                        <div class="nav-item" id="btn-profile"><i data-lucide="user-cog"></i> Editar Perfil</div>
                        <div class="nav-item" id="btn-logout"><i data-lucide="log-out"></i> Sair</div>
                    </nav>
                </aside>
            `;
        }

        // Teacher or Admin Sidebar
        return `
            <aside class="sidebar">
                <div class="logo-text" style="margin-bottom: 3rem; line-height: 1.2;">ALL WORDS<br><span style="font-size: 0.45em; opacity: 0.6; display: block;">${role === 'admin' ? 'ADMIN' : 'TEACHER'}</span></div>
                <nav>
                    ${role === 'admin' ? `
                        <div style="margin: 0 0 0.5rem 1rem; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Administração</div>
                        <div class="nav-item ${activeItem === 'admin-users' ? 'active' : ''}" id="nav-admin-users"><i data-lucide="shield-check"></i> Gestão de Roles</div>
                        <div style="margin: 1.5rem 0 0.5rem 1rem; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Visão Professor</div>
                    ` : ''}
                    
                    <div class="nav-item ${activeItem === 'overview' ? 'active' : ''}" id="nav-overview"><i data-lucide="layout-dashboard"></i> Visão Geral</div>
                    <div class="nav-item ${activeItem === 'lessons' ? 'active' : ''}" id="nav-lessons"><i data-lucide="calendar"></i> Agenda</div>
                    <div class="nav-item ${activeItem === 'students' ? 'active' : ''}" id="nav-students"><i data-lucide="users"></i> Meus Alunos</div>
                    <div class="nav-item ${activeItem === 'exercises' ? 'active' : ''}" id="nav-exercises"><i data-lucide="dumbbell"></i> Exercícios</div>
                    <div class="nav-item ${activeItem === 'formation' ? 'active' : ''}" id="nav-formation"><i data-lucide="graduation-cap"></i> Formação</div>
                    
                    <div style="margin-top: auto;"></div>
                    <div class="nav-item" id="btn-profile"><i data-lucide="user-cog"></i> Editar Perfil</div>
                    <div class="nav-item" id="btn-logout-common"><i data-lucide="log-out"></i> Sair</div>
                </nav>
            </aside>
        `;
    },

    attachEvents: (navigate, role) => {
        // Common Logout (handled by delegated listener in app.js, but keeping refs for safety)
        const btnLogout = document.getElementById('btn-logout-common') || document.getElementById('btn-logout');
        if (btnLogout) btnLogout.onclick = () => authService.logout();

        if (role === 'student') {
            const navDash = document.getElementById('nav-dash');
            const navClasses = document.getElementById('nav-classes');
            const navAgenda = document.getElementById('nav-agenda');
            if (navDash) navDash.onclick = () => navigate('student-dashboard');
            if (navClasses) navClasses.onclick = () => navigate('student-dashboard');
            if (navAgenda) navAgenda.onclick = () => navigate('student-agenda');
            return;
        }

        // Admin/Teacher events
        const navOverview = document.getElementById('nav-overview');
        const navLessons = document.getElementById('nav-lessons');
        const navStudents = document.getElementById('nav-students');
        const navExercises = document.getElementById('nav-exercises');
        const navFormation = document.getElementById('nav-formation');
        const navAdmin = document.getElementById('nav-admin-users');

        if (navOverview) navOverview.onclick = () => navigate('teacher-dashboard');
        if (navLessons) navLessons.onclick = () => navigate('teacher-lessons');
        if (navStudents) navStudents.onclick = () => navigate('teacher-students');
        if (navExercises) navExercises.onclick = () => navigate('teacher-exercises');
        if (navFormation) navFormation.onclick = () => navigate('teacher-formation');
        if (navAdmin) navAdmin.onclick = () => navigate('admin-dashboard');
    }
};
