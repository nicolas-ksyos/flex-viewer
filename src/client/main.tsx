import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, defaultTheme } from '@ksyos/design-system';
import '@ksyos/design-tokens/dist/css/custom-properties.css';
import '@ksyos/design-system/dist/components.css';
import '@frontend/assets/styles/base/fonts.css';
import '@frontend/assets/styles/main.css';
import '@frontend/assets/styles/base/typography.css';
import { App } from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider theme={defaultTheme}>
            <App />
        </ThemeProvider>
    </StrictMode>
);
