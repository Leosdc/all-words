import { authService } from './services/auth-service.js';
import { HomeView } from './views/home-view.js';
import { LoginView, RegisterView } from './views/auth-views.js';
import { StudentDashboard } from './views/student-dashboard.js';
import { TeacherDashboard } from './views/teacher-dashboard.js';
import { TeacherStudents, TeacherExercises, TeacherFormation } from './views/teacher-subviews.js';
import { ProfileModal } from './views/profile-view.js';
import { AdminView } from './views/admin-view.js';
import { modal } from './ui/modal.js';
import { chatWidget } from './ui/chat-widget.js';

const app = document.getElementById('app');

// State
let intendedRole = sessionStorage.getItem('intendedRole') || 'student';
let currentUser = null;

// Helpers
window.setIntendedRole = (role) => {
    intendedRole = role;
    sessionStorage.setItem('intendedRole', role);
};

// Router
const navigate = (viewName) => {
    console.log('Navigating to:', viewName);

    // Hide chat widget temporarily (specific views re-enable it)
    if (window.chatWidget) window.chatWidget.setVisibility(false);

    let viewHtml = '';
    let attachEventsFn = null;
    let isFlagTheme = false;

    // 1. Generate Content
    switch (viewName) {
        case 'home':
            isFlagTheme = true;
            viewHtml = HomeView.render();
            attachEventsFn = () => HomeView.attachEvents(navigate, window.setIntendedRole);
            break;

        case 'login':
            isFlagTheme = true;
            viewHtml = LoginView.render(intendedRole);
            attachEventsFn = () => LoginView.attachEvents(navigate, intendedRole);
            break;

        case 'register':
            isFlagTheme = true;
            viewHtml = RegisterView.render(intendedRole);
            attachEventsFn = () => RegisterView.attachEvents(navigate, intendedRole);
            break;

        case 'student-dashboard':
            if (!currentUser) return navigate('home');
            viewHtml = StudentDashboard.render(currentUser);
            attachEventsFn = () => StudentDashboard.attachEvents(navigate);
            break;

        case 'teacher-dashboard':
            if (!currentUser) return navigate('home');
            if (currentUser.role !== 'teacher' && currentUser.role !== 'admin') {
                modal.show({ title: 'Acesso Negado', message: 'Área exclusiva para professores.', type: 'error' });
                return navigate('student-dashboard');
            }
            viewHtml = TeacherDashboard.render(currentUser);
            attachEventsFn = () => TeacherDashboard.attachEvents(navigate);
            break;

        case 'teacher-students':
            if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) return navigate('home');
            viewHtml = TeacherStudents.render();
            attachEventsFn = () => TeacherStudents.attachEvents(navigate);
            break;

        case 'teacher-exercises':
            if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) return navigate('home');
            viewHtml = TeacherExercises.render();
            attachEventsFn = () => TeacherExercises.attachEvents(navigate);
            break;

        case 'teacher-formation':
            if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'admin')) return navigate('home');
            viewHtml = TeacherFormation.render();
            attachEventsFn = () => TeacherFormation.attachEvents(navigate);
            break;

        case 'admin-dashboard':
            if (!currentUser || currentUser.role !== 'admin') return navigate('home');
            viewHtml = AdminView.render();
            attachEventsFn = () => AdminView.attachEvents(navigate);
            break;

        default:
            return navigate('home');
    }

    // 2. DOM Update Strategy (Smart vs Full)
    if (isFlagTheme) document.body.classList.add('flag-theme');
    else document.body.classList.remove('flag-theme');

    const app = document.getElementById('app');
    const existingLayout = app.querySelector('.dashboard-layout');

    // Parse new HTML to check structure
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(viewHtml, 'text/html');
    const newLayout = newDoc.querySelector('.dashboard-layout');

    // Smart Navigation: If both are dashboards, swap content only
    if (existingLayout && newLayout) {
        // Replace Sidebar (to update active state)
        const newSidebar = newLayout.querySelector('.sidebar');
        const oldSidebar = existingLayout.querySelector('.sidebar');
        if (oldSidebar && newSidebar) oldSidebar.replaceWith(newSidebar);

        // Replace Main Content (to update view)
        const newMain = newLayout.querySelector('.main-content');
        const oldMain = existingLayout.querySelector('.main-content');
        if (oldMain && newMain) oldMain.replaceWith(newMain);

        // Add specific class for view if needed (optional)
    } else {
        // Full Render (Legacy/Transition)
        app.innerHTML = viewHtml;
        window.scrollTo(0, 0);
    }

    // 3. Attach Events
    if (attachEventsFn) attachEventsFn();

    // 4. Save State & Init Icons
    sessionStorage.setItem('currentView', viewName);

    const initIcons = () => {
        if (window.lucide) {
            lucide.createIcons();
        } else {
            setTimeout(initIcons, 50);
        }
    };
    initIcons();
};

// Auth Listener
authService.init((user, role) => {
    currentUser = user;
    if (user) {
        currentUser.role = role; // Attach role to user obj for convenience

        // Check Intent vs Reality
        if (intendedRole === 'teacher' && role === 'student') {
            modal.show({
                title: 'Conta de Estudante',
                message: 'Você entrou com uma conta de estudante, por isso foi redirecionado para o painel de aluno.',
                type: 'warning'
            });
            sessionStorage.setItem('intendedRole', 'student'); // Reset intent
            window.setIntendedRole('student');
            navigate('student-dashboard');
        } else if (role === 'teacher' || role === 'admin') {
            // Restore last view if available, else default to appropriate dashboard
            const lastView = sessionStorage.getItem('currentView');
            if (lastView && (lastView.startsWith('teacher-') || lastView === 'admin-dashboard')) {
                navigate(lastView);
            } else {
                navigate(role === 'admin' ? 'admin-dashboard' : 'teacher-dashboard');
            }
        } else {
            navigate('student-dashboard');
        }
    } else {
        // Logged out
        navigate('home');
    }
});

// Global Event Delegation for Dynamic Elements (Optional but adds stability)
// Global Event Delegation for Dynamic Elements
document.addEventListener('click', (e) => {
    // 1. Logout Handlers
    if (e.target.closest('#btn-logout-teacher') || e.target.closest('#btn-logout-admin') || e.target.closest('#btn-logout')) {
        e.preventDefault(); // Prevent default link behavior if any
        authService.logout();
        return;
    }

    // 2. Profile Handler (Universal)
    if (e.target.closest('#btn-profile')) {
        e.preventDefault();
        console.log("Global Click: Opening Profile Modal");
        if (currentUser) {
            ProfileModal.open(currentUser);
        } else {
            console.error("No current user found for profile modal");
            modal.show({ title: 'Erro', message: 'Usuário não identificado.', type: 'error' });
        }
        return;
    }
});

// Initial Render
// Initial Render handled by authService
// navigate('home'); // Removed to prevent overwriting session storage before auth check
