import { createRoot } from 'react-dom/client';
import App from './App';
import { registerPwa } from './lib/pwa';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
registerPwa();
