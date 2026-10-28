import React from 'react';
import { createRoot } from 'react-dom/client';
// 글꼴은 앱에 함께 묶는다 (발표장 네트워크가 불안해도 글꼴이 깨지지 않게)
import '@fontsource/black-han-sans/400.css';
import '@fontsource/gothic-a1/400.css';
import '@fontsource/gothic-a1/500.css';
import '@fontsource/gothic-a1/700.css';
import '@fontsource/gothic-a1/800.css';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
