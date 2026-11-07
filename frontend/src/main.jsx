import React from 'react';
import { createRoot } from 'react-dom/client';
// Pretendard 를 앱에 함께 묶는다 (발표장 네트워크가 불안해도 글꼴이 깨지지 않게, 쓰는 글자만 내려받음)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
