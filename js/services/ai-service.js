import { CONFIG } from '../config/config.js';
import { auth } from '../config/firebase.js';

export const AIService = {
    sendMessage: async (prompt) => {
        const url = CONFIG.APPS_SCRIPT_URL;
        // secret is no longer used, we use Firebase Token


        // Validation for placeholder values
        if (!url || url.includes('YOUR_APPS_SCRIPT')) {
            console.warn('Apps Script URL not configured in js/config/config.js');
            return "Erro: Configure a URL no arquivo js/config/config.js";
        }

        try {
            let authToken = '';
            if (auth.currentUser) {
                authToken = await auth.currentUser.getIdToken();
            }

            let response;
            try {
                // Try simple POST without any headers to avoid Preflight/CORS issues
                response = await fetch(url, {
                    method: 'POST',
                    body: JSON.stringify({
                        prompt: prompt,
                        authToken: authToken
                    })
                });
            } catch (postError) {
                console.warn('POST failed, trying GET fallback...', postError);
                // Fallback to GET
                const params = new URLSearchParams({
                    prompt: prompt,
                    authToken: authToken
                });
                response = await fetch(`${url}?${params.toString()}`, {
                    method: 'GET'
                });
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            try {
                const data = JSON.parse(text);
                return data.text || data.response || data.output || text;
            } catch (e) {
                return text;
            }
        } catch (error) {
            console.error('Error calling AI Service:', error);
            return "Desculpe, tive um problema ao conectar com minha mente digital. Tente novamente mais tarde.";
        }
    }
};
