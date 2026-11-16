/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';
// PDF.js Worker 모듈은 타입 선언이 없다. 직접 쓰지 않고 전역에 등록만 한다
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs';
