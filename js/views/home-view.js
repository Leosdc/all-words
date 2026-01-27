export const HomeView = {
    render: () => {
        return `
            <section id="home-view" class="view active" style="display:flex">
                <div class="logo-container">
                    <div class="logo-text">All Words</div>
                </div>

                <div class="split-screen">
                    <!-- Student Side -->
                    <div class="side student-side">
                        <div class="side-content">
                            <i data-lucide="graduation-cap" class="side-icon"></i>
                            <h2>Sou Aluno</h2>
                            <p>Quero aprender inglês com aulas dinâmicas e autonomia.</p>
                            <div class="btn-group" style="margin-top: 2rem;">
                                <button class="btn-primary" id="btn-student-login">Entrar</button>
                                <button class="btn-secondary" id="btn-student-register">Criar Conta</button>
                            </div>
                        </div>
                    </div>
                    <!-- Teacher Side -->
                    <div class="side teacher-side">
                        <div class="side-content">
                            <i data-lucide="presentation" class="side-icon"></i>
                            <h2>Sou Professor</h2>
                            <p>Sou professor e quero dar aulas, gerenciar alunos e acompanhar progresso.</p>
                            <div class="btn-group" style="margin-top: 2rem;">
                                <button class="btn-primary" id="btn-teacher-login">Entrar</button>
                                <button class="btn-secondary" id="btn-teacher-register">Criar Conta</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Mission/Vision/Values Carousel -->
                <div class="home-footer-carousel">
                    <div class="carousel-container">
                        <div class="carousel-text active" id="text-mission">
                            <strong>Missão:</strong> Oferecer ensino de qualidade a todos que buscam comunicar-se com excelência em inglês.
                        </div>
                        <div class="carousel-text" id="text-vision">
                            <strong>Visão:</strong> Tornar-se um modelo de referência no ensino de língua inglesa como ferramenta de transformação e expressão, visando a autonomia do indivíduo e capacitando-o a interagir de maneira consciente e crítica na comunidade global.
                        </div>
                        <div class="carousel-text" id="text-values">
                            <strong>Valores:</strong> Aprendizagem com inovação e tecnologia, valorizando a relação com o cliente no compromisso com uma educação de qualidade e de caráter libertador.
                        </div>
                    </div>
                </div>
            </section>
        `;
    },

    attachEvents: (navigate, setIntendedRole) => {
        // Navigation Events
        document.getElementById('btn-student-login').onclick = () => {
            setIntendedRole('student');
            navigate('login');
        };
        document.getElementById('btn-student-register').onclick = () => {
            setIntendedRole('student');
            navigate('register');
        };
        document.getElementById('btn-teacher-login').onclick = () => {
            setIntendedRole('teacher');
            navigate('login');
        };
        document.getElementById('btn-teacher-register').onclick = () => {
            setIntendedRole('teacher');
            navigate('register');
        };

        // Carousel Logic
        const slides = [
            document.getElementById('text-mission'),
            document.getElementById('text-vision'),
            document.getElementById('text-values')
        ];
        let currentSlide = 0;

        // Cleanup interval if exists (checking window property)
        if (window.homeCarouselInterval) clearInterval(window.homeCarouselInterval);

        window.homeCarouselInterval = setInterval(() => {
            // Check if element is still in DOM, else stop
            if (!document.getElementById('text-mission')) {
                clearInterval(window.homeCarouselInterval);
                return;
            }

            // Hide current
            slides[currentSlide].classList.remove('active');

            // Move to next
            currentSlide = (currentSlide + 1) % slides.length;

            // Show next
            slides[currentSlide].classList.add('active');
        }, 6000); // 6 seconds per slide
    }
};
