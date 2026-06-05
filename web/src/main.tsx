import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n/context.tsx'
import { ThemeProvider } from './theme/context.tsx'
import { ModelProvider } from './components/settings/ModelSelector.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ModelProvider>
          <App />
        </ModelProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
